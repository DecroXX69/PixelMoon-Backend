// controllers/walletController.js
const { StatusCodes } = require('http-status-codes');
const mongoose = require('mongoose');
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const phonepeService = require('../services/phonepeService');

// Get wallet balance
const getWalletBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: 'User not found' });
    }
    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        balancePaise: user.walletBalancePaise,
        balanceRupees: user.getWalletBalanceInRupees(),
        userId: user._id
      }
    });
  } catch (error) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error fetching wallet balance',
      error: error.message
    });
  }
};

// Get wallet transactions with pagination
const getWalletTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    const userId = req.user.userId;
    const transactions = await WalletTransaction.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('relatedOrderId', 'gameId amount');
    const total = await WalletTransaction.countDocuments({ userId });
    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        transactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalTransactions: total,
          hasNext: skip + transactions.length < total,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error fetching wallet transactions',
      error: error.message
    });
  }
};

// Initiate deposit (wallet top-up) via PhonePe
const initiateDeposit = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { amount, isStub = false } = req.body;
    if (!amount || amount < 1) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'Amount must be at least ₹1' });
    }
    const user = await User.findById(req.user.userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: 'User not found' });
    }
    const amountPaise = Math.round(amount * 100);
    const transactionId = WalletTransaction.generateTransactionId();
    const merchantOrderId = isStub ? null : null; // will set below if real
    if (isStub) {
      const txn = new WalletTransaction({
        userId: user._id,
        transactionId,
        type: 'DEPOSIT',
        status: 'SUCCESS',
        amountPaise,
        description: `Wallet deposit of ₹${amount} (STUB)`,
        paymentMethod: 'UPI',
        balanceAfterTransaction: user.walletBalancePaise + amountPaise,
        metadata: { isStub: true }
      });
      await txn.save({ session });
      await user.addToWallet(amountPaise);
      await session.commitTransaction();
      return res.status(StatusCodes.OK).json({
        success: true,
        message: 'Deposit successful (STUB)',
        data: { transactionId, amount, newBalance: user.getWalletBalanceInRupees() }
      });
    }
    // REAL PHONEPE FLOW
    // 1. Create pending WalletTransaction
    const pendingTxn = new WalletTransaction({
      userId: user._id,
      transactionId,
      phonepeTransactionId: null, // will set after initiatePayment
      type: 'DEPOSIT',
      status: 'PENDING',
      amountPaise,
      description: `Wallet deposit of ₹${amount}`,
      paymentMethod: 'UPI',
      balanceAfterTransaction: user.walletBalancePaise,
      metadata: { initiatedAt: new Date() }
    });
    // save pendingTxn without phonepeTransactionId yet
    await pendingTxn.save({ session });
    await session.commitTransaction();
    // 2. Initiate PhonePe payment
    try {
      const { merchantOrderId: mpoId, checkoutUrl } = await phonepeService.initiatePayment(amountPaise, transactionId);
      // update phonepeTransactionId in DB
      await WalletTransaction.findOneAndUpdate(
        { transactionId },
        { phonepeTransactionId: mpoId, 'metadata.merchantOrderId': mpoId }
      );
      return res.status(StatusCodes.OK).json({
        success: true,
        message: 'Payment initiated successfully',
        data: { transactionId, merchantOrderId: mpoId, checkoutUrl, redirectRequired: true }
      });
    } catch (ppErr) {
      // mark pendingTxn as failed
      await WalletTransaction.findOneAndUpdate(
        { transactionId },
        {
          status: 'FAILED',
          'metadata.error': ppErr.message,
          'metadata.failedAt': new Date()
        }
      );
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Error initiating PhonePe payment',
        error: ppErr.message
      });
    }
  } catch (error) {
    await session.abortTransaction();
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error initiating deposit',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// Handle PhonePe webhook callbacks (payment and refund)
const handlePhonePeWebhook = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const authHeader = req.headers.authorization;
if (!phonepeService.validateWebhookSignature(authHeader)) {
  return res.status(StatusCodes.UNAUTHORIZED).json({ 
    success: false, 
    message: 'Invalid webhook signature' 
  });
}
const callbackResp = req.body;
const { event, payload } = callbackResp;
const { merchantOrderId: orderId, state } = payload;

// Refund callback  
if (event.includes('refund')) {
      const refTxn = await WalletTransaction.findOne({
        'metadata.refundId': orderId,
        type: 'REFUND',
        status: 'PENDING'
      }).session(session);
      if (!refTxn) {
        await session.abortTransaction();
        return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: 'Refund transaction not found' });
      }
      const user = await User.findById(refTxn.userId).session(session);
      if (state === 'refund.completed') {
        refTxn.status = 'SUCCESS';
        refTxn.balanceAfterTransaction = user.walletBalancePaise + refTxn.amountPaise;
        refTxn.metadata = {
          ...refTxn.metadata,
          phonepeResponse: callbackResp,
          completedAt: new Date()
        };
        await refTxn.save({ session });
        await user.addToWallet(refTxn.amountPaise);
      } else {
        refTxn.status = 'FAILED';
        refTxn.metadata = {
          ...refTxn.metadata,
          phonepeResponse: callbackResp,
          failedAt: new Date()
        };
        await refTxn.save({ session });
      }
      await session.commitTransaction();
      return res.status(StatusCodes.OK).json({ success: true, message: 'Refund callback processed' });
    }
    // Payment callback
    const txn = await WalletTransaction.findOne({
      phonepeTransactionId: orderId,
      status: 'PENDING'
    }).session(session);
    if (!txn) {
      await session.abortTransaction();
      return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: 'Transaction not found' });
    }
    const user = await User.findById(txn.userId).session(session);
    if (state === 'checkout.order.completed') {
      txn.status = 'SUCCESS';
      txn.balanceAfterTransaction = user.walletBalancePaise + txn.amountPaise;
      txn.metadata = {
        ...txn.metadata,
        phonepeResponse: callbackResp,
        completedAt: new Date()
      };
      await txn.save({ session });
      await user.addToWallet(txn.amountPaise);
    } else {
      txn.status = 'FAILED';
      txn.metadata = {
        ...txn.metadata,
        phonepeResponse: callbackResp,
        failedAt: new Date()
      };
      await txn.save({ session });
    }
    await session.commitTransaction();
    return res.status(StatusCodes.OK).json({ success: true, message: 'Payment callback processed' });
  } catch (error) {
    await session.abortTransaction();
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: 'Invalid webhook signature or payload'
    });
  } finally {
    session.endSession();
  }
};

// Check payment status (fallback if webhook not yet received)
const checkPaymentStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const txn = await WalletTransaction.findOne({ transactionId });
    if (!txn) {
      return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: 'Transaction not found' });
    }
    if (!txn.phonepeTransactionId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'No PhonePe order ID saved' });
    }
    try {
      const statusResp = await phonepeService.getPaymentStatus(txn.phonepeTransactionId);
      // Optionally reconcile local status if still PENDING and state is final
      const { state } = statusResp;
      if (txn.status === 'PENDING') {
        if (state === 'checkout.order.completed') {
          const user = await User.findById(txn.userId);
          txn.status = 'SUCCESS';
          txn.balanceAfterTransaction = user.walletBalancePaise + txn.amountPaise;
          txn.metadata = {
            ...txn.metadata,
            phonepeResponse: statusResp,
            completedAt: new Date()
          };
          await txn.save();
          await user.addToWallet(txn.amountPaise);
        } else if (state === 'checkout.order.failed') {
          txn.status = 'FAILED';
          txn.metadata = {
            ...txn.metadata,
            phonepeResponse: statusResp,
            failedAt: new Date()
          };
          await txn.save();
        }
      }
      return res.status(StatusCodes.OK).json({
        success: true,
        data: {
          transactionId,
          merchantOrderId: txn.phonepeTransactionId,
          status: state,
          localStatus: txn.status
        }
      });
    } catch (ppErr) {
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Error checking PhonePe status',
        error: ppErr.message
      });
    }
  } catch (error) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error checking payment status',
      error: error.message
    });
  }
};

// Export
module.exports = {
  getWalletBalance,
  getWalletTransactions,
  initiateDeposit,
  handlePhonePeWebhook,
  checkPaymentStatus,
  spendFromWallet: async (userId, amountPaise, orderId, description) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const user = await User.findById(userId).session(session);
      if (!user) throw new Error('User not found');
      if (user.walletBalancePaise < amountPaise) throw new Error('Insufficient wallet balance');
      const txn = new WalletTransaction({
        userId: user._id,
        transactionId: WalletTransaction.generateTransactionId(),
        type: 'DEBIT',
        status: 'SUCCESS',
        amountPaise,
        description,
        relatedOrderId: orderId,
        balanceAfterTransaction: user.walletBalancePaise - amountPaise
      });
      await txn.save({ session });
      await user.deductFromWallet(amountPaise);
      await session.commitTransaction();
      return txn;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  },
  refundToWallet: async (userId, amountPaise, orderId, description) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const user = await User.findById(userId).session(session);
      if (!user) throw new Error('User not found');
      const txn = new WalletTransaction({
        userId: user._id,
        transactionId: WalletTransaction.generateTransactionId(),
        type: 'REFUND',
        status: 'SUCCESS',
        amountPaise,
        description,
        relatedOrderId: orderId,
        balanceAfterTransaction: user.walletBalancePaise + amountPaise
      });
      await txn.save({ session });
      await user.addToWallet(amountPaise);
      await session.commitTransaction();
      return txn;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  },
  creditWallet: async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { userId, amount, reason } = req.body;
      if (!userId || !amount || amount <= 0) {
        return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'Valid userId and amount required' });
      }
      const user = await User.findById(userId).session(session);
      if (!user) {
        await session.abortTransaction();
        return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: 'User not found' });
      }
      const amountPaise = Math.round(amount * 100);
      const txn = new WalletTransaction({
        userId: user._id,
        transactionId: WalletTransaction.generateTransactionId(),
        type: 'CREDIT',
        status: 'SUCCESS',
        amountPaise,
        description: reason || 'Manual credit by admin',
        balanceAfterTransaction: user.walletBalancePaise + amountPaise,
        metadata: { creditedBy: req.user.userId }
      });
      await txn.save({ session });
      await user.addToWallet(amountPaise);
      await session.commitTransaction();
      return res.status(StatusCodes.OK).json({
        success: true,
        message: 'Wallet credited successfully',
        data: { transactionId: txn.transactionId, newBalance: user.getWalletBalanceInRupees() }
      });
    } catch (error) {
      await session.abortTransaction();
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Error crediting wallet',
        error: error.message
      });
    } finally {
      session.endSession();
    }
  },
  processRefund: async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { transactionId, amount, reason } = req.body;
      if (!transactionId || !amount || amount <= 0) {
        return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'Valid transactionId and amount required' });
      }
      const origTxn = await WalletTransaction.findOne({
        transactionId,
        type: 'DEPOSIT',
        status: 'SUCCESS'
      }).session(session);
      if (!origTxn) {
        await session.abortTransaction();
        return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: 'Original transaction not found' });
      }
      const refundAmountPaise = Math.round(amount * 100);
      if (refundAmountPaise > origTxn.amountPaise) {
        await session.abortTransaction();
        return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'Refund amount cannot exceed original amount' });
      }
      const refundTransactionId = WalletTransaction.generateTransactionId();
      const refundTxn = new WalletTransaction({
        userId: origTxn.userId,
        transactionId: refundTransactionId,
        phonepeTransactionId: null,
        type: 'REFUND',
        status: 'PENDING',
        amountPaise: refundAmountPaise,
        description: reason || `Refund for transaction ${transactionId}`,
        relatedOrderId: origTxn.relatedOrderId,
        balanceAfterTransaction: 0,
        metadata: { originalTransactionId: transactionId, initiatedAt: new Date() }
      });
      await refundTxn.save({ session });
      await session.commitTransaction();
      // initiate PhonePe refund
      try {
        const { merchantRefundId } = await phonepeService.initiateRefund(origTxn.phonepeTransactionId, refundAmountPaise);
        await WalletTransaction.findOneAndUpdate(
          { transactionId: refundTransactionId },
          { phonepeTransactionId: merchantRefundId, 'metadata.refundId': merchantRefundId }
        );
        return res.status(StatusCodes.OK).json({
          success: true,
          message: 'Refund initiated successfully',
          data: { refundTransactionId, refundId: merchantRefundId, status: 'PENDING', amount }
        });
      } catch (ppErr) {
        await WalletTransaction.findOneAndUpdate(
          { transactionId: refundTransactionId },
          {
            status: 'FAILED',
            'metadata.error': ppErr.message,
            'metadata.failedAt': new Date()
          }
        );
        throw ppErr;
      }
    } catch (error) {
      await session.abortTransaction();
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Error processing refund',
        error: error.message
      });
    } finally {
      session.endSession();
    }
  },
  checkRefundStatus: async (req, res) => {
    try {
      const { refundTransactionId } = req.params;
      const refundTxn = await WalletTransaction.findOne({
        transactionId: refundTransactionId,
        type: 'REFUND'
      });
      if (!refundTxn) {
        return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: 'Refund transaction not found' });
      }
      if (!refundTxn.metadata.refundId) {
        return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'No PhonePe refund ID saved' });
      }
      try {
        const refundStatusResp = await phonepeService.getRefundStatus(refundTxn.metadata.refundId);
        // Optionally reconcile local record if still PENDING and state final
        const { state } = refundStatusResp;
        if (refundTxn.status === 'PENDING') {
          if (state === 'refund.completed') {
            const user = await User.findById(refundTxn.userId);
            refundTxn.status = 'SUCCESS';
            refundTxn.balanceAfterTransaction = user.walletBalancePaise + refundTxn.amountPaise;
            refundTxn.metadata = {
              ...refundTxn.metadata,
              phonepeResponse: refundStatusResp,
              completedAt: new Date()
            };
            await refundTxn.save();
            await user.addToWallet(refundTxn.amountPaise);
          } else if (state === 'refund.failed') {
            refundTxn.status = 'FAILED';
            refundTxn.metadata = {
              ...refundTxn.metadata,
              phonepeResponse: refundStatusResp,
              failedAt: new Date()
            };
            await refundTxn.save();
          }
        }
        return res.status(StatusCodes.OK).json({
          success: true,
          data: {
            refundTransactionId,
            refundId: refundTxn.metadata.refundId,
            phonepeStatus: state,
            localStatus: refundTxn.status,
            amount: refundTxn.amountPaise / 100
          }
        });
      } catch (ppErr) {
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: 'Error checking PhonePe refund status',
          error: ppErr.message
        });
      }
    } catch (error) {
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Error fetching refund status',
        error: error.message
      });
    }
  }
};
