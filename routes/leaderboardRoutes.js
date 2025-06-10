// routes/leaderboardRoutes.js
const express = require('express');
const router = express.Router();
const LeaderboardController = require('../controllers/LeaderboardController');
const { authenticateUser } = require('../middleware/authMiddleware');

// Public routes (anyone can view leaderboard)
router.get('/active', LeaderboardController.getActiveLeaderboard);
router.get('/reset-time', LeaderboardController.getLeaderboardResetTime);
router.get('/past', LeaderboardController.getPastLeaderboards);

// Protected routes (require authentication)
router.get('/my-position', authenticateUser, LeaderboardController.getUserPosition);

module.exports = router;