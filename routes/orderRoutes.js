// routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const { authenticateUser, authorizeRoles } = require('../middleware/authMiddleware');
const orderController = require('../controllers/orderController');

// Create a new order (for any provider)
router.post('/', authenticateUser, orderController.createOrder);

// Check order status by our internal orderId
router.get('/:orderId/status', authenticateUser, orderController.getOrderStatus);

// (Optional) List all orders for the logged-in user
router.get('/', authenticateUser, orderController.listUserOrders);

// In routes/order.js, add this route
router.post('/refund/:orderId', authenticateUser, authorizeRoles('admin'), orderController.refundOrder);
// In your routes file:
router.post('/orders/complete-phonepe', authenticateUser, orderController.completePhonePeOrder);

module.exports = router;
