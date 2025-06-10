// controllers/orderController.js
const Order = require('../models/Order');
const User = require('../models/User');
const Game = require('../models/Game');
const APIService = require('../services/apiService');
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
//
// 1) createOrder: creates a new Order doc, calls the third-party API, and saves the API response.
//
createOrder : async (req, res) => {
  try {
    const userId = req.user.userId;  // from authenticateUser middleware
    const {
      gameId,
      packId,
      gameUserInfo,   // { userId: inGameUserId, serverId: optional }
      paymentInfo,    // { method, transactionId, amount, currency }
      provider,       // 'smile.one' | 'yokcash' | 'hopestore'
      contact         // for Yokcash/Hopestore: phone number, e.g. '62815xxxxxx'
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

    // 1c) Find the Pack inside this game
    const pack = game.packs.find(p => p.packId === packId);
    if (!pack) throw new NotFoundError('Pack not found');

    // 1d) Create an Order document (pending) – we'll fill apiOrder after
    const newOrder = new Order({
      user: userId,
      game: gameId,
      pack: {
        packId:      pack.packId,
        name:        pack.name,
        amount:      pack.amount,
        price:       paymentInfo.amount,
        costPrice:   pack.costPrice
      },
      gameUserInfo: {
        userId: inGameUserId,
        serverId: serverId
      },
      paymentInfo: {
        method:        paymentInfo.method,
        transactionId: paymentInfo.transactionId || '', 
        amount:        paymentInfo.amount,
        currency:      paymentInfo.currency || 'INR'
      },
      apiOrder: {
        provider: provider,
        apiOrderId: '',
        apiResponse: {}
      },
      status: 'pending'
    });
    await newOrder.save();

    // 2) Call the third-party API depending on provider
    let apiResponse, apiOrderId;
    switch (provider) {
      case 'smile.one': {
        // Smile.one createorder expects URL-encoded form with uid, email, product, productid, userid, zoneid, time, sign, orderid
        const payload = {
          product:   game.apiGameId,    // e.g., 'mobilelegends'
          productid: pack.packId,
          userid:    inGameUserId,
          zoneid:    serverId || '',
          orderid:   newOrder.orderId  // use our generated orderId as external reference
        };
        apiResponse = await APIService.processSmileoneOrder(payload);
        apiOrderId = apiResponse.order_id; // Smile.one returns {status:200, order_id: '...' }
        break;
      }
      case 'yokcash': {
        // Yokcash /order requires URL-encoded: api_key, service_id, target, contact, idtrx
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
        // Hopestore /order: api_key, service_id, target, contact, idtrx
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

    // 3) Update our Order doc with the API's response
    newOrder.apiOrder.apiOrderId = apiOrderId;
    newOrder.apiOrder.apiResponse = apiResponse;
    newOrder.status = apiResponse.status === true || apiResponse.status === 200 
                       ? 'processing' 
                       : 'failed';
    await newOrder.save();

    // 4) Return success
    res.status(StatusCodes.CREATED).json({
      success: true,
      order: newOrder
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

//
// 2) getOrderStatus: look up an existing Order in our DB, then call the appropriate provider's "status" API.
//
getOrderStatus : async (req, res) => {
  try {
    const { orderId } = req.params; // our internal Order.orderId
    const order = await Order.findOne({ orderId });
    if (!order) throw new NotFoundError('Order not found');

    // Ensure the logged-in user owns this order (unless you want admins to see all):
    if (order.user.toString() !== req.user.userId) {
      throw new UnauthorizedError('Not authorized to view this order');
    }

    const provider = order.apiOrder.provider;
    const externalId = order.apiOrder.apiOrderId;
    if (!externalId) {
      throw new BadRequestError('No external order ID saved for this order');
    }

    // Call the provider's status endpoint
    let statusRes;
    switch (provider) {
      case 'smile.one': {
        // Smile.one doesn't have a single "status" endpoint—they return status in the createorder response.
        // So for Smile.one, we can just echo back what we stored:
        statusRes = {
          status: true,
          msg: 'Use stored API response for Smile.one',
          data: order.apiOrder.apiResponse
        };
        break;
      }
      case 'yokcash': {
        statusRes = await APIService.getYokcashOrderStatus(externalId);
        break;
      }
      case 'hopestore': {
        statusRes = await APIService.getHopestoreOrderStatus(externalId);
        break;
      }
      default:
        throw new BadRequestError('Invalid provider on order');
    }

    // Optionally update our DB order.status based on statusRes.data.status (e.g. "success" → "completed")
    const remoteStatus = statusRes.data?.status;
    if (remoteStatus === 'success' || remoteStatus === 'Success') {
      order.status = 'completed';
      order.completedAt = new Date();
    } else if (remoteStatus === 'pending') {
      order.status = 'processing';
    } else if (remoteStatus === 'failed' || remoteStatus === 'error') {
      order.status = 'failed';
      order.failureReason = statusRes.msg || 'Remote failure';
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

//
// 3) listUserOrders (optional): return all orders for the logged-in user
//
listUserOrders : async (req, res) => {
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

//
// 4) LEADERBOARD METHODS
//

// Helper function to get week boundaries (Monday 00:00 to Sunday 23:59)


getActiveLeaderboard : async (req, res) => {
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

    // Add rank to each user
    const leaderboardWithRank = leaderboard.map((user, index) => ({
      ...user,
      rank: index + 1
    }));

    // Get total users count for this week
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

getLeaderboardResetTime : async (req, res) => {
  try {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    
    // Calculate next Monday at 00:00
    const daysUntilNextMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    const nextResetTime = new Date(now);
    nextResetTime.setDate(now.getDate() + daysUntilNextMonday);
    nextResetTime.setHours(0, 0, 0, 0);
    
    // Calculate time difference in milliseconds
    const timeUntilReset = nextResetTime.getTime() - now.getTime();
    
    // Convert to days, hours, minutes
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

getPastLeaderboards : async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    // Stub implementation - return empty array for now
    // You can implement historical leaderboard storage later
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

getUserPosition : async (req, res) => {
  try {
    const userId = req.user.userId;
    const { startOfWeek, endOfWeek } = getWeekBoundaries();

    // Get user's stats for this week
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

    // Calculate user's rank by counting users with higher totalSpent
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
