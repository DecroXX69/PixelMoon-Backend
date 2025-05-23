// routes/gameRoutes.js
const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');
const { authenticateUser } = require('../middleware/authMiddleware'); // Assuming you have auth middleware

// Public routes
router.get('/', gameController.getAllGames);
router.get('/:id', gameController.getGameById);
router.post('/validate-user', authenticateUser, gameController.validateGameUser);

// Admin routes (protected)
router.post('/', authenticateUser, gameController.createGame);
router.put('/:id', authenticateUser, gameController.updateGame);
router.delete('/:id', authenticateUser, gameController.deleteGame);

// Pack management routes
router.post('/:id/packs', authenticateUser, gameController.addPackToGame);
router.put('/:id/packs/:packId', authenticateUser, gameController.updatePack);
router.delete('/:id/packs/:packId', authenticateUser, gameController.deletePack);

// API integration routes
router.get('/api-products/:provider', authenticateUser, gameController.getApiProducts);

module.exports = router;