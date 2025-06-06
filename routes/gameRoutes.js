// routes/gameRoutes.js
const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');
const { authenticateUser } = require('../middleware/authMiddleware'); // Assuming you have auth middleware
// const validateGame = require('../middleware/validateGame');
const rateLimit = require('express-rate-limit');

const verifyLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 10,              // limit each IP to 10 requests per minute
  message: 'Too many verify attempts, please wait 1 minute.'
});

// Public routes
router.get('/', gameController.getAllGames);
router.get('/:id', gameController.getGameById);
router.post('/validate-user', authenticateUser, verifyLimiter, gameController.validateGameUser);

// Admin routes (protected)
router.post('/', authenticateUser, gameController.createGame);
router.put('/:id', authenticateUser, gameController.updateGame);
router.delete('/:id', authenticateUser, gameController.deleteGame);

// Pack management routes
router.post('/:id/packs', authenticateUser, gameController.addPackToGame);
router.put('/:id/packs/:packId', authenticateUser, gameController.updatePack);
router.delete('/:id/packs/:packId', authenticateUser, gameController.deletePack);


router.get('/api-games/smileone', authenticateUser, gameController.getApiGames);
router.get('/api-servers/:product', authenticateUser, gameController.getApiServers);
router.get('/api-packs/:product', authenticateUser, gameController.getApiPacks);

// API integration routes
router.get('/api-products/:provider', authenticateUser, gameController.getApiProducts);

// ...existing code...
router.post('/verify-userid', authenticateUser, gameController.validateGameUser);
// ...existing code...
module.exports = router;