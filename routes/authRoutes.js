// routes/authRoutes.js - Updated auth routes with user management
const express = require('express');
const router = express.Router();
const { 
  register, 
  login, 
  getCurrentUser, 
  promoteToReseller,
  createAdmin,
  getAllUsers,
  updateUserRole,
  updateProfile,
  deleteUser,
  toggleUserStatus
} = require('../controllers/authController');
const { authenticateUser, authorizeRoles } = require('../middleware/authMiddleware');

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/create-admin', createAdmin); // New route for creating admin
router.patch('/update-profile', authenticateUser, updateProfile);
// Protected routes (require authentication)
router.get('/me', authenticateUser, getCurrentUser);

// Admin-only routes for user management
router.get('/users', authenticateUser, authorizeRoles('admin'), getAllUsers);
router.put('/users/:userId/role', authenticateUser, authorizeRoles('admin'), updateUserRole);

// Legacy route (keeping for backward compatibility)
router.patch('/promote/:userId', authenticateUser, promoteToReseller);

// Add after existing admin routes
router.delete('/users/:userId', authenticateUser, authorizeRoles('admin'), deleteUser);
router.patch('/users/:userId/status', authenticateUser, authorizeRoles('admin'), toggleUserStatus);

module.exports = router;