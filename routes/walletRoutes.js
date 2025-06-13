// routes/wallet.js - Updated Wallet routes with correct middleware
const express = require('express');
const router = express.Router();
const {
  getWalletBalance,
  getWalletTransactions,
  initiateDeposit,
  handlePhonePeWebhook,
  creditWallet
} = require('../controllers/walletController');
const { authenticateUser, authorizeRoles } = require('../middleware/authMiddleware');

// Protected routes (require authentication)
router.get('/balance', authenticateUser, getWalletBalance);
router.get('/transactions', authenticateUser, getWalletTransactions);
router.post('/deposit', authenticateUser, initiateDeposit);

// Admin only route for manual wallet credit
router.post('/credit', authenticateUser, authorizeRoles('admin'), creditWallet);

// Public webhook endpoint (PhonePe will call this)
// Note: This should NOT have authentication middleware
router.post('/phonepe-webhook', handlePhonePeWebhook);

module.exports = router;