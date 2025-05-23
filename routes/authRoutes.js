// routes/authRoutes.js - Updated auth routes
const express = require('express');
const router = express.Router();
const { 
  register, 
  login, 
  getCurrentUser, 
  promoteToReseller,
  createAdmin 
} = require('../controllers/authController');
const { authenticateUser } = require('../middleware/authMiddleware');

router.post('/register', register);
router.post('/login', login);
router.post('/create-admin', createAdmin); // New route for creating admin
router.get('/me', authenticateUser, getCurrentUser);
router.patch('/promote/:userId', authenticateUser, promoteToReseller);

module.exports = router;