// controllers/leaderboardController.js
const Order = require('../models/Order');
const User = require('../models/User');
const { StatusCodes } = require('http-status-codes');

// Helper function to get start and end of current week (Monday to Sunday)
const getCurrentWeekRange = () => {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Adjust for Monday start
  
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - daysFromMonday);
  startOfWeek.setHours(0, 0, 0, 0);
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  
  return { startOfWeek, endOfWeek };
};

// Helper function to get next week reset time
const getNextWeekResetTime = () => {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek; // Days until next Monday
  
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  nextMonday.setHours(0, 0, 0, 0);
  
  return nextMonday;
};

// Get active leaderboard (current week)
const LeaderboardController = {
getActiveLeaderboard : async (req, res) => {
  try {
    const { startOfWeek, endOfWeek } = getCurrentWeekRange();

    // Aggregate orders by user for the current week
    const leaderboard = await Order.aggregate([
      {
        // Match orders from current week that are completed
        $match: {
          createdAt: {
            $gte: startOfWeek,
            $lte: endOfWeek
          },
          status: 'completed' // Only count completed orders
        }
      },
      {
        // Group by user and sum the payment amounts
        $group: {
          _id: '$user',
          totalSpent: { $sum: '$paymentInfo.amount' },
          orderCount: { $sum: 1 }
        }
      },
      {
        // Sort by total spent descending
        $sort: { totalSpent: -1 }
      },
      {
        // Limit to top 50 users
        $limit: 50
      },
      {
        // Join with user data
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        // Unwind user array
        $unwind: '$user'
      },
      {
        // Project final structure
        $project: {
          userId: '$_id',
          name: '$user.name',
          email: '$user.email',
          totalSpent: 1,
          orderCount: 1,
          _id: 0
        }
      }
    ]);

    // Add rank to each user
    const rankedLeaderboard = leaderboard.map((user, index) => ({
      ...user,
      rank: index + 1
    }));

    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        leaderboard: rankedLeaderboard,
        weekRange: {
          start: startOfWeek,
          end: endOfWeek
        },
        totalUsers: rankedLeaderboard.length
      }
    });
  } catch (error) {
    console.error('Error fetching active leaderboard:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error fetching leaderboard data',
      error: error.message
    });
  }
},

// Get leaderboard reset time
getLeaderboardResetTime : async (req, res) => {
  try {
    const nextResetTime = getNextWeekResetTime();
    const now = new Date();
    const timeUntilReset = nextResetTime - now;

    // Calculate days, hours, minutes
    const days = Math.floor(timeUntilReset / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeUntilReset % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeUntilReset % (1000 * 60 * 60)) / (1000 * 60));

    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        nextResetTime: nextResetTime,
        timeUntilReset: timeUntilReset,
        countdown: {
          days,
          hours,
          minutes
        },
        countdownText: `${days}d ${hours}h ${minutes}m`
      }
    });
  } catch (error) {
    console.error('Error fetching reset time:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error fetching reset time',
      error: error.message
    });
  }
},

// Get past week leaderboards (for "Past Reward" tab)
getPastLeaderboards : async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    // Get previous weeks data - you can implement this based on your needs
    // For now, return empty array as past rewards would need historical tracking
    
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
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error fetching past leaderboard data',
      error: error.message
    });
  }
},

// Get current user's leaderboard position
getUserPosition : async (req, res) => {
  try {
    const userId = req.user.userId;
    const { startOfWeek, endOfWeek } = getCurrentWeekRange();

    // Get user's total spent this week
    const userStats = await Order.aggregate([
      {
        $match: {
          user: userId,
          createdAt: {
            $gte: startOfWeek,
            $lte: endOfWeek
          },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalSpent: { $sum: '$paymentInfo.amount' },
          orderCount: { $sum: 1 }
        }
      }
    ]);

    const userTotalSpent = userStats.length > 0 ? userStats[0].totalSpent : 0;
    const userOrderCount = userStats.length > 0 ? userStats[0].orderCount : 0;

    // Get user's rank by counting users with higher spending
    const usersAbove = await Order.aggregate([
      {
        $match: {
          createdAt: {
            $gte: startOfWeek,
            $lte: endOfWeek
          },
          status: 'completed'
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
          totalSpent: { $gt: userTotalSpent }
        }
      },
      {
        $count: 'count'
      }
    ]);

    const userRank = usersAbove.length > 0 ? usersAbove[0].count + 1 : 1;

    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        userId: userId,
        rank: userTotalSpent > 0 ? userRank : null,
        totalSpent: userTotalSpent,
        orderCount: userOrderCount,
        weekRange: {
          start: startOfWeek,
          end: endOfWeek
        }
      }
    });
  } catch (error) {
    console.error('Error fetching user position:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error fetching user position',
      error: error.message
    });
  }
}
};
module.exports = LeaderboardController;
