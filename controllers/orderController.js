// controllers/orderController.js
const Order = require('../models/Order');
const Game = require('../models/Game');
const APIService = require('../services/apiService');
const { StatusCodes } = require('http-status-codes');
const { BadRequestError, NotFoundError, UnauthorizedError } = require('../errors');

//
// 1) createOrder: creates a new Order doc, calls the third-party API, and saves the API response.
//
exports.createOrder = async (req, res) => {
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

    // 1d) Create an Order document (pending) – we’ll fill apiOrder after
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

    // 3) Update our Order doc with the API’s response
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
};


//
// 2) getOrderStatus: look up an existing Order in our DB, then call the appropriate provider's “status” API.
//
exports.getOrderStatus = async (req, res) => {
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

    // Call the provider’s status endpoint
    let statusRes;
    switch (provider) {
      case 'smile.one': {
        // Smile.one doesn’t have a single “status” endpoint—they return status in the createorder response.
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

    // Optionally update our DB order.status based on statusRes.data.status (e.g. “success” → “completed”)
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
};


//
// 3) listUserOrders (optional): return all orders for the logged-in user
//
exports.listUserOrders = async (req, res) => {
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
};
