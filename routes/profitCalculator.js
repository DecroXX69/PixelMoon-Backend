const express = require('express');
const router = express.Router();
const {
  getAllProfitCalculations,
  createProfitCalculation,
  updateProfitCalculation,
  deleteProfitCalculation
} = require('../controllers/profitCalculator');
const { authenticateUser, authorizeRoles } = require('../middleware/authMiddleware');

router.get('/', authenticateUser, authorizeRoles('admin'), getAllProfitCalculations);
router.post('/', authenticateUser,authorizeRoles('admin'), createProfitCalculation);
router.put('/:id', authenticateUser, authorizeRoles('admin'), updateProfitCalculation);
router.delete('/:id', authenticateUser, authorizeRoles('admin'), deleteProfitCalculation);

module.exports = router;