// controllers/orderController.js - Updated with wallet integration
const Order = require('../models/Order');
const User = require('../models/User');
const Game = require('../models/Game');
const APIService = require('../services/apiService');
const { spendFromWallet, refundToWallet } = require('./walletController');
const { StatusCodes } = require('http-status-codes');
const { BadRequestError, NotFoundError, UnauthorizedError } = require('../errors');

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
}

const OrderController = {

createOrder: async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      gameId,
      packId,
      gameUserInfo,   // { userId: inGameUserId, serverId: optional }
      paymentInfo,    // { method: 'wallet'|'phonepe'|'other', transactionId, amount, currency }
      provider,       // 'smile.one' | 'yokcash' | 'hopestore'
      contact         // for Yokcash/Hopestore: phone number
    } = req.body;

    // 1a) Validate required fields
    if (!gameId || !packId || !gameUserInfo?.userId || !paymentInfo?.method || !paymentInfo?.amount || !provider) {
      throw new BadRequestError('Missing required fields');
    }
    const inGameUserId = gameUserInfo.userId;
    const serverId = gameUserInfo.serverId || '';

    // 1b) Fetch the Game
    const game = await Game.findById(gameId);
    if (!game) throw new NotFoundError('Game not found');

    if ((provider === 'yokcash' || provider === 'hopestore')) {
  if (!contact) {
    throw new BadRequestError('Contact is required for this provider');
  }
  if (!contact.startsWith('62') && !contact.startsWith('0000')) {
    throw new BadRequestError('Contact must start with country code 62 (Indonesia) or 0000 (International)');
  }
}
    // 1c) Find the Pack inside this game
    const pack = game.packs.find(p => p.packId === packId);
    if (!pack) throw new NotFoundError('Pack not found');

    // 1d) Validate payment amount matches pack price
    const expectedAmount = pack.price || pack.amount;
    if (paymentInfo.amount !== expectedAmount) {
      throw new BadRequestError(`Payment amount mismatch. Expected: ${expectedAmount}, Got: ${paymentInfo.amount}`);
    }

    // 1e) Create an Order document (pending)
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
        transactionId: paymentInfo.transactionId || '', 
        amount: paymentInfo.amount,
        currency: paymentInfo.currency || 'INR'
      },
      apiOrder: {
        provider: provider,
        apiOrderId: '',
        apiResponse: {}
      },
      status: 'pending'
    });
    await newOrder.save();

    // 2) Handle wallet payment first if method is wallet
    if (paymentInfo.method === 'wallet') {
      try {
        const amountPaise = Math.round(paymentInfo.amount * 100);
        const walletTransaction = await spendFromWallet(
          userId, 
          amountPaise, 
          newOrder._id, 
          `Game purchase: ${game.name} - ${pack.name}`
        );

        // Update order with wallet transaction info
        newOrder.paymentInfo.transactionId = walletTransaction.transactionId;
        newOrder.paymentInfo.walletTransactionId = walletTransaction._id;
        newOrder.status = 'paid'; // Mark as paid since wallet deduction succeeded
        await newOrder.save();

      } catch (walletError) {
        // Wallet payment failed
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

    // 3) Call the third-party API (only if payment succeeded or non-wallet)
    if (newOrder.status === 'paid' || paymentInfo.method !== 'wallet') {
      let apiResponse, apiOrderId;
      try {
        switch (provider) {
          case 'smile.one': {
            const payload = {
              product: game.apiGameId,
              productid: pack.packId,
              userid: inGameUserId,
              zoneid: serverId || '',
              orderid: newOrder.orderId
            };
            apiResponse = await APIService.processSmileoneOrder(payload);
            apiOrderId = apiResponse.order_id;
            break;
          }
          case 'yokcash': {
            const service_id = pack.packId;
            const target = serverId ? `${inGameUserId}|${serverId}` : `${inGameUserId}`;
            const body = {
              service_id,
              target,
              contact: contact || '',
              idtrx: newOrder.orderId 
            };
            
            apiResponse = await APIService.processYokcashOrder(body);
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
              idtrx: newOrder.orderId 
            };

            apiResponse = await APIService.processHopestoreOrder(body);
            apiOrderId = apiResponse.data?.id || '';
            break;
          }
          default:
            throw new BadRequestError('Invalid API provider');
        }

        // 4) Update order with API response
        newOrder.apiOrder.apiOrderId = apiOrderId;
        newOrder.apiOrder.apiResponse = apiResponse;
        
        // Set final status based on API response
        if (apiResponse.status === true || apiResponse.status === 200) {
          newOrder.status = paymentInfo.method === 'wallet' ? 'processing' : 'processing';
        } else {
          newOrder.status = 'failed';
          newOrder.failureReason = apiResponse.message || 'API call failed';
          
          // Refund wallet if payment was from wallet
          if (paymentInfo.method === 'wallet') {
            try {
              await refundToWallet(
                userId, 
                Math.round(paymentInfo.amount * 100), 
                newOrder._id, 
                `Refund for failed order: ${game.name} - ${pack.name}`
              );
            } catch (refundError) {
              console.error('Refund failed:', refundError);
            }
          }
        }

      } catch (apiError) {
        console.error('API call failed:', apiError);
        newOrder.status = 'failed';
        newOrder.failureReason = apiError.message || 'Third-party API failed';
        
        // Refund wallet if payment was from wallet
        if (paymentInfo.method === 'wallet') {
          try {
            await refundToWallet(
              userId, 
              Math.round(paymentInfo.amount * 100), 
              newOrder._id, 
              `Refund for API failure: ${game.name} - ${pack.name}`
            );
          } catch (refundError) {
            console.error('Refund failed:', refundError);
          }
        }
      }
      // After successful order creation in createOrder:
newOrder.profit = newOrder.pack.price - newOrder.pack.costPrice;


      await newOrder.save();
    }

    // 5) Return response
    res.status(StatusCodes.CREATED).json({
      success: true,
      order: newOrder,
      message: newOrder.status === 'failed' ? 'Order failed' : 'Order created successfully'
    });

  } catch (error) {
    console.error('Error creating order:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error creating order',
      error: error.message
    });
  }
},

// Refund order (admin function)
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

    // Only refund completed or failed orders
    if (!['completed', 'failed'].includes(order.status)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Order cannot be refunded in current status'
      });
    }

    // Process refund if original payment was from wallet
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
      // For non-wallet payments, just mark as refunded (manual process)
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

getOrderStatus: async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({ orderId });
    if (!order) throw new NotFoundError('Order not found');

    if (order.user.toString() !== req.user.userId) {
      throw new UnauthorizedError('Not authorized to view this order');
    }

    const provider = order.apiOrder.provider;
    const externalId = order.apiOrder.apiOrderId;
    if (!externalId) {
      throw new BadRequestError('No external order ID saved for this order');
    }

    let statusRes;
    switch (provider) {
      case 'smile.one': {
        statusRes = {
          status: true,
          msg: 'Use stored API response for Smile.one',
          data: order.apiOrder.apiResponse
        };
        break;
      }
     // Add in getOrderStatus controller
case 'yokcash':
  statusRes = await APIService.getYokcashOrderStatus(externalId);
  break;
      case 'hopestore': {
        statusRes = await APIService.getHopestoreOrderStatus(externalId);
        break;
      }
      default:
        throw new BadRequestError('Invalid provider on order');
    }

    const remoteStatus = statusRes.data?.status?.toLowerCase();
if (remoteStatus === 'success') {
      order.status = 'completed';
      order.completedAt = new Date();
    } else if (remoteStatus === 'pending') {
      order.status = 'processing';
    } else if (remoteStatus === 'failed' || remoteStatus === 'error') {
      order.status = 'failed';
      order.failureReason = statusRes.msg || 'Remote failure';
      
      // Auto-refund wallet payments on failure
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
      {
        $sort: { totalSpent: -1 }
      },
      {
        $limit: 50
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userDetails'
        }
      },
      {
        $unwind: '$userDetails'
      },
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
      {
        $group: {
          _id: '$user'
        }
      },
      {
        $count: 'totalUsers'
      }
    ]);

    const totalUsers = totalUsersResult[0]?.totalUsers || 0;

    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        leaderboard: leaderboardWithRank,
        weekRange: {
          start: startOfWeek,
          end: endOfWeek
        },
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
        countdown: {
          days,
          hours,
          minutes
        },
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
          weekRange: {
            start: startOfWeek,
            end: endOfWeek
          }
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
      {
        $count: 'usersAhead'
      }
    ]);

    const rank = (rankResult[0]?.usersAhead || 0) + 1;

    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        userId,
        rank,
        totalSpent,
        orderCount,
        weekRange: {
          start: startOfWeek,
          end: endOfWeek
        }
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