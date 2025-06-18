// controllers/orderController.js - Integrated with wallet & PhonePe flows
const Order = require('../models/Order');
const User = require('../models/User');
const Game = require('../models/Game');
const APIService = require('../services/apiService');
const phonepeService = require('../services/phonepeService');
const { spendFromWallet, refundToWallet } = require('./walletController');
const { StatusCodes } = require('http-status-codes');
const { BadRequestError, NotFoundError, UnauthorizedError } = require('../errors');

// Utility to compute week boundaries (used in leaderboard endpoints)
const getWeekBoundaries = (date = new Date()) => {
  const now = new Date(date);
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // If Sunday, go back 6 days
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() + daysToMonday);
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  return { startOfWeek, endOfWeek };
};

// Helper function to call the third-party game top-up API and update order accordingly
async function processThirdPartyAPI(order, game, pack, provider, contact, inGameUserId, serverId, userId, paymentInfo) {
  try {
    let apiResponse, apiOrderId;

    switch (provider) {
      case 'smile.one': {
        const payload = {
          product: game.apiGameId,
          productid: pack.packId,
          userid: inGameUserId,
          zoneid: serverId || '',
          orderid: order.orderId
        };
        console.log('Calling Smile.one with payload:', payload);
        apiResponse = await APIService.processSmileoneOrder(payload);
        console.log('Smile.one response:', apiResponse);
        apiOrderId = apiResponse.order_id || apiResponse.data?.order_id || '';
        break;
      }
      case 'yokcash': {
        const service_id = pack.packId;
        const target = serverId ? `${inGameUserId}|${serverId}` : `${inGameUserId}`;
        const body = {
          service_id,
          target,
          contact: contact || '',
          idtrx: order.orderId
        };
        console.log('Calling Yokcash with body:', body);
        apiResponse = await APIService.processYokcashOrder(body);
        console.log('Yokcash response:', apiResponse);
        apiOrderId = apiResponse.data?.id || '';
        break;
      }
      case 'hopestore': {
        const service_id = pack.packId;
        const target = serverId ? `${inGameUserId}|${serverId}` : `${inGameUserId}`;
        const body = {
          service_id,
          target,
          contact: contact || '',
          idtrx: order.orderId
        };
        console.log('Calling Hopestore with body:', body);
        apiResponse = await APIService.processHopestoreOrder(body);
        console.log('Hopestore response:', apiResponse);
        apiOrderId = apiResponse.data?.id || '';
        break;
      }
      default:
        throw new BadRequestError('Invalid API provider');
    }

    // Update order with API response
    order.apiOrder.apiOrderId = apiOrderId;
    order.apiOrder.apiResponse = apiResponse;

    // Determine success: treat any 2xx or explicit success flag as success
    const statusCode = apiResponse.statusCode ?? apiResponse.status;
    const isSuccess = apiResponse.success === true || (typeof statusCode === 'number' && statusCode >= 200 && statusCode < 300);

    if (isSuccess && apiOrderId) {
      // Mark as processing (or directly completed if API is synchronous immediate)
      order.status = 'processing';
      // Optionally, if the API immediately confirms completion, you can set:
      // order.status = 'completed'; order.completedAt = new Date();
    } else {
      // Failure branch
      order.status = 'failed';
      order.failureReason = apiResponse.message || `Unexpected API response: ${JSON.stringify(apiResponse)}`;
      // If wallet payment, refund
      if (paymentInfo.method === 'wallet') {
        try {
          await refundToWallet(
            userId,
            Math.round(paymentInfo.amount * 100),
            order._id,
            `Refund for failed order: ${game.name} - ${pack.name}`
          );
          console.log('Refunded wallet for failed top-up');
          order.status = 'refunded';
        } catch (refundErr) {
          console.error('Wallet refund failed:', refundErr);
          // order remains 'failed'; you may record refundErr in metadata if desired
        }
      }
      // If direct PhonePe payment, consider initiating PhonePe refund here if desired
    }

    // Calculate profit
    order.profit = order.pack.price - order.pack.costPrice;
    await order.save();

  } catch (apiError) {
    console.error('API call failed:', apiError);
    order.status = 'failed';
    order.failureReason = apiError.message || 'Third-party API failed';
    if (paymentInfo.method === 'wallet') {
      try {
        await refundToWallet(
          userId,
          Math.round(paymentInfo.amount * 100),
          order._id,
          `Refund for API failure: ${game.name} - ${pack.name}`
        );
        order.status = 'refunded';
      } catch (refundError) {
        console.error('Refund failed:', refundError);
      }
    }
    await order.save();
    throw apiError;
  }
}

const OrderController = {
  // Create order: handles wallet or direct PhonePe payment initiation
  createOrder: async (req, res) => {
    try {
      const userId = req.user.userId;
      const { gameId, packId, gameUserInfo, paymentInfo, provider, contact } = req.body;

      // 1a) Validate required fields
      if (!gameId || !packId || !gameUserInfo?.userId || !paymentInfo?.method || !paymentInfo?.amount || !provider) {
        throw new BadRequestError('Missing required fields');
      }
      const inGameUserId = gameUserInfo.userId;
      const serverId = gameUserInfo.serverId || '';

      // 1b) Fetch the Game
      const game = await Game.findById(gameId);
      if (!game) throw new NotFoundError('Game not found');

      // 1c) Validate contact for specific providers
      if ((provider === 'yokcash' || provider === 'hopestore')) {
        if (!contact) {
          throw new BadRequestError('Contact is required for this provider');
        }
        if (!contact.startsWith('62') && !contact.startsWith('0000')) {
          throw new BadRequestError('Contact must start with country code 62 (Indonesia) or 0000 (International)');
        }
      }

      // 1d) Find the Pack inside this game
      const pack = game.packs.find(p => p.packId === packId);
      if (!pack) throw new NotFoundError('Pack not found');

      // 1e) Validate payment amount matches pack price
      // Ensure pack.price is the INR price stored in your Game model
      const expectedAmount = pack.price || pack.amount;
      if (paymentInfo.amount !== expectedAmount) {
        throw new BadRequestError(`Payment amount mismatch. Expected: ${expectedAmount}, Got: ${paymentInfo.amount}`);
      }

      // 1f) Create an Order document with initial status
      // For direct PhonePe payment: status 'pending_payment' or 'awaiting_payment'
      const initialStatus = paymentInfo.method === 'phonepe' ? 'awaiting_payment' : 'pending';
      const newOrder = new Order({
        user: userId,
        game: gameId,
        pack: {
          packId: pack.packId,
          name: pack.name,
          amount: pack.amount,
          price: paymentInfo.amount,
          costPrice: pack.costPrice
        },
        gameUserInfo: {
          userId: inGameUserId,
          serverId: serverId
        },
        paymentInfo: {
          method: paymentInfo.method,
          transactionId: '', // to fill after initiation
          amount: paymentInfo.amount,
          currency: paymentInfo.currency || 'INR'
        },
        apiOrder: {
          provider: provider,
          apiOrderId: '',
          apiResponse: {}
        },
        status: initialStatus,
        profit: paymentInfo.amount - pack.costPrice
      });
      await newOrder.save();
      console.log('Order created:', newOrder._id, 'status:', newOrder.status);

      // 2) Handle WALLET payment
      if (paymentInfo.method === 'wallet') {
        try {
          const amountPaise = Math.round(paymentInfo.amount * 100);
          const walletTxn = await spendFromWallet(
            userId,
            amountPaise,
            newOrder._id,
            `Game purchase: ${game.name} - ${pack.name}`
          );
          console.log('Wallet spend succeeded:', walletTxn.transactionId);

          // Update order with wallet transaction info
          newOrder.paymentInfo.transactionId = walletTxn.transactionId;
          newOrder.paymentInfo.walletTransactionId = walletTxn._id;
          newOrder.status = 'paid'; // Mark as paid; now call third-party API
          await newOrder.save();

          // Proceed to API call after successful wallet payment
          await processThirdPartyAPI(
            newOrder, game, pack, provider, contact, inGameUserId, serverId, userId, paymentInfo
          );

          return res.status(StatusCodes.CREATED).json({
            success: true,
            order: newOrder,
            message: 'Order processed via wallet'
          });
        } catch (walletError) {
          console.error('Wallet payment failed:', walletError);
          newOrder.status = 'failed';
          newOrder.failureReason = walletError.message;
          await newOrder.save();
          return res.status(StatusCodes.BAD_REQUEST).json({
            success: false,
            message: walletError.message,
            order: newOrder
          });
        }
      }

      // 3) Handle direct PhonePe PAYMENT FLOW
      if (paymentInfo.method === 'phonepe') {
        try {
          const amountPaise = Math.round(paymentInfo.amount * 100);
          // Initiate PhonePe payment using order.orderId as merchantOrderId
          const { merchantOrderId, checkoutUrl } = await phonepeService.initiatePayment(amountPaise, newOrder.orderId);
          console.log('PhonePe initiation:', merchantOrderId, checkoutUrl);

          // Update order with PhonePe details
          newOrder.paymentInfo.transactionId = merchantOrderId;
          // (Optionally also store phonepeOrderId field if you have one in schema)
          newOrder.paymentInfo.phonepeOrderId = merchantOrderId;
          newOrder.status = 'awaiting_payment'; // or 'pending_payment'
          await newOrder.save();

          // Return checkout URL for frontend to redirect
          return res.status(StatusCodes.CREATED).json({
            success: true,
            order: newOrder,
            checkoutUrl,
            merchantOrderId,
            message: 'Order created, redirect to PhonePe payment'
          });
        } catch (phonepeError) {
          console.error('PhonePe initiation failed:', phonepeError);
          newOrder.status = 'failed';
          newOrder.failureReason = phonepeError.message;
          await newOrder.save();
          return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Failed to initiate PhonePe payment',
            error: phonepeError.message
          });
        }
      }

      // 4) Unsupported payment method
      throw new BadRequestError('Invalid payment method');

    } catch (error) {
      console.error('Error creating order:', error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Error creating order',
        error: error.message
      });
    }
  },

  // Optional endpoint: complete PhonePe order by polling/getPaymentStatus
  // Alternatively, use your webhook to trigger similar logic automatically.
  completePhonePeOrder: async (req, res) => {
    try {
      const { orderId, merchantOrderId, contact } = req.body;
      const order = await Order.findOne({ orderId }).populate('game');
      if (!order) {
        return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: 'Order not found' });
      }
      // Verify payment status with PhonePe
      const paymentStatus = await phonepeService.getPaymentStatus(merchantOrderId);
      if (paymentStatus.state === 'checkout.order.completed') {
        // Payment successful
        order.status = 'paid';
        order.paymentInfo.transactionId = merchantOrderId;
        await order.save();

        // Process third-party API top-up
        const game = order.game;
        const pack = game.packs.find(p => p.packId === order.pack.packId);
        await processThirdPartyAPI(
          order,
          game,
          pack,
          order.apiOrder.provider,
          contact || '',
          order.gameUserInfo.userId,
          order.gameUserInfo.serverId,
          order.user,
          order.paymentInfo
        );
        return res.status(StatusCodes.OK).json({
          success: true,
          order: order,
          message: 'Payment completed and order processed'
        });
      } else {
        // Payment not successful
        order.status = 'failed';
        order.failureReason = 'Payment failed or cancelled';
        await order.save();
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: 'Payment failed',
          order
        });
      }
    } catch (error) {
      console.error('Error completing PhonePe order:', error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Error completing order',
        error: error.message
      });
    }
  },

  // Refund order (admin)
  refundOrder: async (req, res) => {
    try {
      const { orderId } = req.params;
      const { reason } = req.body;
      const order = await Order.findOne({ orderId }).populate('user');
      if (!order) throw new NotFoundError('Order not found');

      if (order.status === 'refunded') {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: 'Order already refunded'
        });
      }
      if (!['completed', 'failed'].includes(order.status)) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: 'Order cannot be refunded in current status'
        });
      }

      if (order.paymentInfo.method === 'wallet') {
        try {
          await refundToWallet(
            order.user._id,
            Math.round(order.paymentInfo.amount * 100),
            order._id,
            `Refund: ${reason || 'Order refund'}`
          );
          order.status = 'refunded';
          order.refundInfo = {
            refundedAt: new Date(),
            reason: reason || 'Manual refund',
            refundedBy: req.user.userId
          };
          await order.save();
          res.status(StatusCodes.OK).json({
            success: true,
            message: 'Order refunded successfully',
            order
          });
        } catch (refundError) {
          res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Refund processing failed',
            error: refundError.message
          });
        }
      } else {
        // Non-wallet: mark as refunded; actual refund to user must be handled externally
        order.status = 'refunded';
        order.refundInfo = {
          refundedAt: new Date(),
          reason: reason || 'Manual refund - non-wallet payment',
          refundedBy: req.user.userId
        };
        await order.save();
        res.status(StatusCodes.OK).json({
          success: true,
          message: 'Order marked as refunded (manual process required for non-wallet payments)',
          order
        });
      }
    } catch (error) {
      console.error('Error refunding order:', error);
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Error processing refund',
        error: error.message
      });
    }
  },

  // Get order status and optionally reconcile with provider
  getOrderStatus: async (req, res) => {
    try {
      const { orderId } = req.params;
      const order = await Order.findOne({ orderId });
      if (!order) throw new NotFoundError('Order not found');
      if (order.user.toString() !== req.user.userId) throw new UnauthorizedError('Not authorized to view this order');

      const provider = order.apiOrder.provider;
      const externalId = order.apiOrder.apiOrderId;
      if (!externalId) throw new BadRequestError('No external order ID saved for this order');

      let statusRes;
      switch (provider) {
        case 'smile.one':
          // If Smile.one doesn’t provide a status endpoint, you can return stored response
          statusRes = {
            status: true,
            msg: 'Use stored API response for Smile.one',
            data: order.apiOrder.apiResponse
          };
          break;
        case 'yokcash':
          statusRes = await APIService.getYokcashOrderStatus(externalId);
          break;
        case 'hopestore':
          statusRes = await APIService.getHopestoreOrderStatus(externalId);
          break;
        default:
          throw new BadRequestError('Invalid provider on order');
      }

      // Optionally reconcile status
      const remoteStatus = statusRes.data?.status?.toLowerCase();
      if (remoteStatus === 'success') {
        order.status = 'completed';
        order.completedAt = new Date();
      } else if (remoteStatus === 'pending') {
        order.status = 'processing';
      } else if (remoteStatus === 'failed' || remoteStatus === 'error') {
        order.status = 'failed';
        order.failureReason = statusRes.msg || 'Remote failure';
        if (order.paymentInfo.method === 'wallet' && order.status !== 'refunded') {
          try {
            await refundToWallet(
              order.user,
              Math.round(order.paymentInfo.amount * 100),
              order._id,
              'Auto-refund for failed order'
            );
            order.status = 'refunded';
          } catch (refundError) {
            console.error('Auto-refund failed:', refundError);
          }
        }
      }
      await order.save();

      res.status(StatusCodes.OK).json({
        success: true,
        providerStatus: statusRes
      });
    } catch (error) {
      console.error('Error fetching order status:', error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Error fetching order status',
        error: error.message
      });
    }
  },

  // List user orders
  listUserOrders: async (req, res) => {
    try {
      const userId = req.user.userId;
      const orders = await Order.find({ user: userId })
        .populate('game', 'name apiProvider')
        .sort({ createdAt: -1 });
      res.status(StatusCodes.OK).json({
        success: true,
        count: orders.length,
        orders
      });
    } catch (error) {
      console.error('Error listing user orders:', error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Error retrieving orders',
        error: error.message
      });
    }
  },

  // Leaderboard: total spent during current week
  getActiveLeaderboard: async (req, res) => {
    try {
      const { startOfWeek, endOfWeek } = getWeekBoundaries();
      const leaderboard = await Order.aggregate([
        {
          $match: {
            status: 'completed',
            createdAt: { $gte: startOfWeek, $lte: endOfWeek }
          }
        },
        {
          $group: {
            _id: '$user',
            totalSpent: { $sum: '$paymentInfo.amount' },
            orderCount: { $sum: 1 }
          }
        },
        { $sort: { totalSpent: -1 } },
        { $limit: 50 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'userDetails'
          }
        },
        { $unwind: '$userDetails' },
        {
          $project: {
            userId: '$_id',
            name: '$userDetails.name',
            email: '$userDetails.email',
            totalSpent: 1,
            orderCount: 1
          }
        }
      ]);
      const leaderboardWithRank = leaderboard.map((user, index) => ({
        ...user,
        rank: index + 1
      }));
      const totalUsersResult = await Order.aggregate([
        {
          $match: {
            status: 'completed',
            createdAt: { $gte: startOfWeek, $lte: endOfWeek }
          }
        },
        { $group: { _id: '$user' } },
        { $count: 'totalUsers' }
      ]);
      const totalUsers = totalUsersResult[0]?.totalUsers || 0;
      res.status(StatusCodes.OK).json({
        success: true,
        data: {
          leaderboard: leaderboardWithRank,
          weekRange: { start: startOfWeek, end: endOfWeek },
          totalUsers
        }
      });
    } catch (error) {
      console.error('Error fetching active leaderboard:', error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },

  // Time until next leaderboard reset (next Monday 00:00)
  getLeaderboardResetTime: async (req, res) => {
    try {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const daysUntilNextMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
      const nextResetTime = new Date(now);
      nextResetTime.setDate(now.getDate() + daysUntilNextMonday);
      nextResetTime.setHours(0, 0, 0, 0);
      const timeUntilReset = nextResetTime.getTime() - now.getTime();
      const days = Math.floor(timeUntilReset / (1000 * 60 * 60 * 24));
      const hours = Math.floor((timeUntilReset % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((timeUntilReset % (1000 * 60 * 60)) / (1000 * 60));
      const countdownText = `${days}d ${hours}h ${minutes}m`;
      res.status(StatusCodes.OK).json({
        success: true,
        data: {
          nextResetTime,
          timeUntilReset,
          countdown: { days, hours, minutes },
          countdownText
        }
      });
    } catch (error) {
      console.error('Error calculating reset time:', error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },

  // Placeholder for past leaderboards (not implemented)
  getPastLeaderboards: async (req, res) => {
    try {
      const { page = 1, limit = 10 } = req.query;
      res.status(StatusCodes.OK).json({
        success: true,
        data: {
          pastLeaderboards: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            hasMore: false
          }
        }
      });
    } catch (error) {
      console.error('Error fetching past leaderboards:', error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },

  // Get user's position in current week leaderboard
  getUserPosition: async (req, res) => {
    try {
      const userId = req.user.userId;
      const { startOfWeek, endOfWeek } = getWeekBoundaries();
      const userStats = await Order.aggregate([
        {
          $match: {
            user: userId,
            status: 'completed',
            createdAt: { $gte: startOfWeek, $lte: endOfWeek }
          }
        },
        {
          $group: {
            _id: '$user',
            totalSpent: { $sum: '$paymentInfo.amount' },
            orderCount: { $sum: 1 }
          }
        }
      ]);
      if (userStats.length === 0) {
        return res.status(StatusCodes.OK).json({
          success: true,
          data: {
            userId,
            rank: null,
            totalSpent: 0,
            orderCount: 0,
            weekRange: { start: startOfWeek, end: endOfWeek }
          }
        });
      }
      const { totalSpent, orderCount } = userStats[0];
      const rankResult = await Order.aggregate([
        {
          $match: {
            status: 'completed',
            createdAt: { $gte: startOfWeek, $lte: endOfWeek }
          }
        },
        {
          $group: {
            _id: '$user',
            totalSpent: { $sum: '$paymentInfo.amount' }
          }
        },
        {
          $match: {
            totalSpent: { $gt: totalSpent }
          }
        },
        { $count: 'usersAhead' }
      ]);
      const rank = (rankResult[0]?.usersAhead || 0) + 1;
      res.status(StatusCodes.OK).json({
        success: true,
        data: {
          userId,
          rank,
          totalSpent,
          orderCount,
          weekRange: { start: startOfWeek, end: endOfWeek }
        }
      });
    } catch (error) {
      console.error('Error fetching user position:', error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  }
};

module.exports = OrderController;
