// controllers/walletController.js - Wallet controller with stub and PhonePe integration
const { StatusCodes } = require('http-status-codes');
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const crypto = require('crypto');
const mongoose = require('mongoose');

// PhonePe configuration
const PHONEPE_CONFIG = {
  merchantId: process.env.PHONEPE_MERCHANT_ID || 'TEST-M23F0NKGHBG0A_25060',
  keyIndex: 1,
  saltKey: process.env.PHONEPE_SALT_KEY || 'MDljNDEzZTUtNTczYS00MDUyLWIzMDQtODBlN2MxMjM0Nzdk',
  baseUrl: process.env.PHONEPE_BASE_URL || 'https://api-preprod.phonepe.com/apis/pg-sandbox',
  redirectUrl: process.env.PHONEPE_REDIRECT_URL || 'http://localhost:3000/wallet/payment-success',
  callbackUrl: process.env.PHONEPE_CALLBACK_URL || 'http://localhost:5000/api/wallet/phonepe-webhook'
};

// Get wallet balance
const getWalletBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        balancePaise: user.walletBalancePaise,
        balanceRupees: user.getWalletBalanceInRupees(),
        userId: user._id
      }
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error fetching wallet balance',
      error: error.message
    });
  }
};

// Get wallet transactions
const getWalletTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const transactions = await WalletTransaction.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('relatedOrderId', 'gameId amount');

    const totalTransactions = await WalletTransaction.countDocuments({ userId: req.user.userId });

    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        transactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalTransactions / limit),
          totalTransactions,
          hasNext: skip + transactions.length < totalTransactions,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error fetching wallet transactions',
      error: error.message
    });
  }
};

// Helper function to generate PhonePe signature
const generatePhonePeSignature = (payload) => {
  const bufferObj = Buffer.from(payload, 'utf8');
  const base64String = bufferObj.toString('base64');
  const checksum = crypto.createHash('sha256').update(base64String + '/pg/v1/pay' + PHONEPE_CONFIG.saltKey).digest('hex');
  return checksum + '###' + PHONEPE_CONFIG.keyIndex;
};

// Helper function to verify PhonePe signature
const verifyPhonePeSignature = (receivedSignature, payload) => {
  const expectedSignature = crypto.createHash('sha256').update(payload + PHONEPE_CONFIG.saltKey).digest('hex');
  return receivedSignature === expectedSignature;
};

// Initiate deposit (stub implementation first, then PhonePe)
const initiateDeposit = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { amount, isStub = false } = req.body; // isStub for testing

    // Validate amount
    if (!amount || amount < 1) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Amount must be at least ₹1'
      });
    }

    const amountPaise = Math.round(amount * 100);
    const user = await User.findById(req.user.userId).session(session);

    if (!user) {
      await session.abortTransaction();
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate transaction ID
    const transactionId = WalletTransaction.generateTransactionId();

    if (isStub) {
      // STUB IMPLEMENTATION - For testing without PhonePe
      const transaction = new WalletTransaction({
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

      await transaction.save({ session });
      await user.addToWallet(amountPaise);
      await session.commitTransaction();

      return res.status(StatusCodes.OK).json({
        success: true,
        message: 'Deposit successful (STUB)',
        data: {
          transactionId,
          amount: amount,
          newBalance: user.getWalletBalanceInRupees()
        }
      });
    }

    // REAL PHONEPE INTEGRATION
    const phonepeTransactionId = 'TXN_' + Date.now();
    
    // Create pending transaction
    const transaction = new WalletTransaction({
      userId: user._id,
      transactionId,
      phonepeTransactionId,
      type: 'DEPOSIT',
      status: 'PENDING',
      amountPaise,
      description: `Wallet deposit of ₹${amount}`,
      paymentMethod: 'UPI',
      balanceAfterTransaction: user.walletBalancePaise, // Will be updated on success
      metadata: {
        phonepeTransactionId,
        initiatedAt: new Date()
      }
    });

    await transaction.save({ session });
    await session.commitTransaction();

    // Prepare PhonePe payment request
    const paymentPayload = {
      merchantId: PHONEPE_CONFIG.merchantId,
      merchantTransactionId: phonepeTransactionId,
      merchantUserId: user._id.toString(),
      amount: amountPaise,
      redirectUrl: `${PHONEPE_CONFIG.redirectUrl}?transactionId=${transactionId}`,
      redirectMode: 'REDIRECT',
      callbackUrl: PHONEPE_CONFIG.callbackUrl,
      paymentInstrument: {
        type: 'PAY_PAGE'
      }
    };

    // Generate signature and make API call
    const payloadString = JSON.stringify(paymentPayload);
    const signature = generatePhonePeSignature(payloadString);
    const base64Payload = Buffer.from(payloadString).toString('base64');

    // In a real implementation, you would make an HTTP request to PhonePe
    // For now, we'll return the payment URL structure
    const phonepePaymentUrl = `${PHONEPE_CONFIG.baseUrl}/pg/v1/pay`;

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Payment initiated successfully',
      data: {
        transactionId,
        phonepeTransactionId,
        paymentUrl: phonepePaymentUrl,
        paymentData: {
          request: base64Payload,
          signature: signature
        },
        // For frontend to redirect to PhonePe
        redirectToPhonePe: true
      }
    });

  } catch (error) {
    await session.abortTransaction();
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error initiating deposit',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// PhonePe webhook handler
const handlePhonePeWebhook = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { response } = req.body;
    
    if (!response) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Invalid webhook payload'
      });
    }

    // Decode the response
    const decodedResponse = JSON.parse(Buffer.from(response, 'base64').toString());
    const { transactionId, code, message, data } = decodedResponse;

    // Find the transaction
    const transaction = await WalletTransaction.findOne({
      phonepeTransactionId: transactionId,
      status: 'PENDING'
    }).session(session);

    if (!transaction) {
      await session.abortTransaction();
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    const user = await User.findById(transaction.userId).session(session);

    if (code === 'PAYMENT_SUCCESS') {
      // Update transaction status
      transaction.status = 'SUCCESS';
      transaction.balanceAfterTransaction = user.walletBalancePaise + transaction.amountPaise;
      transaction.metadata = {
        ...transaction.metadata,
        phonepeResponse: decodedResponse,
        completedAt: new Date()
      };

      await transaction.save({ session });
      await user.addToWallet(transaction.amountPaise);
      
      await session.commitTransaction();

      res.status(StatusCodes.OK).json({
        success: true,
        message: 'Payment processed successfully'
      });
    } else {
      // Payment failed
      transaction.status = 'FAILED';
      transaction.metadata = {
        ...transaction.metadata,
        phonepeResponse: decodedResponse,
        failedAt: new Date()
      };

      await transaction.save({ session });
      await session.commitTransaction();

      res.status(StatusCodes.OK).json({
        success: true,
        message: 'Payment failed, transaction updated'
      });
    }

  } catch (error) {
    await session.abortTransaction();
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error processing webhook',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// Spend from wallet (for game purchases)
const spendFromWallet = async (userId, amountPaise, orderId, description) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findById(userId).session(session);
    
    if (!user) {
      throw new Error('User not found');
    }

    if (user.walletBalancePaise < amountPaise) {
      throw new Error('Insufficient wallet balance');
    }

    // Create debit transaction
    const transaction = new WalletTransaction({
      userId: user._id,
      transactionId: WalletTransaction.generateTransactionId(),
      type: 'DEBIT',
      status: 'SUCCESS',
      amountPaise,
      description,
      relatedOrderId: orderId,
      balanceAfterTransaction: user.walletBalancePaise - amountPaise
    });

    await transaction.save({ session });
    await user.deductFromWallet(amountPaise);
    
    await session.commitTransaction();
    return transaction;

  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// Refund to wallet
const refundToWallet = async (userId, amountPaise, orderId, description) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findById(userId).session(session);
    
    if (!user) {
      throw new Error('User not found');
    }

    // Create refund transaction
    const transaction = new WalletTransaction({
      userId: user._id,
      transactionId: WalletTransaction.generateTransactionId(),
      type: 'REFUND',
      status: 'SUCCESS',
      amountPaise,
      description,
      relatedOrderId: orderId,
      balanceAfterTransaction: user.walletBalancePaise + amountPaise
    });

    await transaction.save({ session });
    await user.addToWallet(amountPaise);
    
    await session.commitTransaction();
    return transaction;

  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// Add this to walletController.js
const creditWallet = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, amount, reason } = req.body;
    
    if (!userId || !amount || amount <= 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Valid userId and amount required'
      });
    }

    const amountPaise = Math.round(amount * 100);
    const user = await User.findById(userId).session(session);
    
    if (!user) {
      await session.abortTransaction();
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'User not found'
      });
    }

    const transaction = new WalletTransaction({
      userId: user._id,
      transactionId: WalletTransaction.generateTransactionId(),
      type: 'CREDIT',
      status: 'SUCCESS',
      amountPaise,
      description: reason || 'Manual credit by admin',
      balanceAfterTransaction: user.walletBalancePaise + amountPaise,
      metadata: { creditedBy: req.user.userId }
    });

    await transaction.save({ session });
    await user.addToWallet(amountPaise);
    await session.commitTransaction();

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Wallet credited successfully',
      data: {
        transactionId: transaction.transactionId,
        newBalance: user.getWalletBalanceInRupees()
      }
    });

  } catch (error) {
    await session.abortTransaction();
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error crediting wallet',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

module.exports = {
  getWalletBalance,
  getWalletTransactions,
  initiateDeposit,
  handlePhonePeWebhook,
  spendFromWallet,
  refundToWallet,
  creditWallet
};