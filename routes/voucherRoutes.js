const express = require('express');
const router = express.Router();

const {
  createVouchers,
  getVouchers,
  redeemVoucher,
  updateVoucher,
  deleteVoucher,
  getAvailableVouchers,
  logVoucherRequest
} = require('../controllers/voucherController');

// Apply logging middleware to all voucher routes
router.use(logVoucherRequest);

// Admin routes - Create and manage vouchers
router.post('/', createVouchers); // POST /api/v1/vouchers - Create vouchers (bulk upload)
router.get('/', getVouchers); // GET /api/v1/vouchers - Get vouchers (admin only)
router.put('/:voucherId', updateVoucher); // PUT /api/v1/vouchers/:voucherId - Update voucher (admin only)
router.delete('/:voucherId', deleteVoucher); // DELETE /api/v1/vouchers/:voucherId - Delete voucher (admin only)

// Public routes for authenticated users
router.get('/available', getAvailableVouchers); // GET /api/v1/vouchers/available - Get available vouchers for purchase
router.post('/:voucherId/redeem', redeemVoucher); // POST /api/v1/vouchers/:voucherId/redeem - Redeem voucher

module.exports = router;