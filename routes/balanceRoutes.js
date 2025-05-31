const router = require('express').Router();
const { authenticateUser } = require('../middleware/authMiddleware');
const { getBalances } = require('../controllers/balanceController');

router.get('/', authenticateUser, getBalances);
module.exports = router;
