// controllers/gameController.js
const Game = require('../models/Game');
const apiService = require('../services/apiService');

// Admin Controllers
const createGame = async (req, res) => {
  try {
    const { name, description, image, apiProvider, apiGameId, region, packs } = req.body;
    
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    // Validate required fields
    if (!name || !description || !image || !apiProvider || !apiGameId || !region) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Check if game with same name already exists
    const existingGame = await Game.findOne({ name, apiProvider });
    if (existingGame) {
      return res.status(400).json({ message: 'Game with this name already exists for this API provider' });
    }

    const game = new Game({
      name,
      description,
      image,
      apiProvider,
      apiGameId,
      region,
      packs: packs || [],
      createdBy: req.user._id
    });

    await game.save();
    res.status(201).json({ message: 'Game created successfully', game });
  } catch (error) {
    console.error('Create game error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const updateGame = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    const game = await Game.findByIdAndUpdate(id, updateData, { new: true });
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    res.json({ message: 'Game updated successfully', game });
  } catch (error) {
    console.error('Update game error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const deleteGame = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    const game = await Game.findByIdAndDelete(id);
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    res.json({ message: 'Game deleted successfully' });
  } catch (error) {
    console.error('Delete game error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const addPackToGame = async (req, res) => {
  try {
    const { id } = req.params;
    const { packId, name, description, amount, retailPrice, resellerPrice, costPrice } = req.body;

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    const game = await Game.findById(id);
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    // Check if pack ID already exists
    const existingPack = game.packs.find(pack => pack.packId === packId);
    if (existingPack) {
      return res.status(400).json({ message: 'Pack ID already exists for this game' });
    }

    const newPack = {
      packId,
      name,
      description,
      amount,
      retailPrice,
      resellerPrice,
      costPrice
    };

    game.packs.push(newPack);
    await game.save();

    res.json({ message: 'Pack added successfully', game });
  } catch (error) {
    console.error('Add pack error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const updatePack = async (req, res) => {
  try {
    const { id, packId } = req.params;
    const updateData = req.body;

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    const game = await Game.findById(id);
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    const packIndex = game.packs.findIndex(pack => pack.packId === packId);
    if (packIndex === -1) {
      return res.status(404).json({ message: 'Pack not found' });
    }

    // Update pack data
    Object.assign(game.packs[packIndex], updateData);
    await game.save();

    res.json({ message: 'Pack updated successfully', game });
  } catch (error) {
    console.error('Update pack error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const deletePack = async (req, res) => {
  try {
    const { id, packId } = req.params;

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    const game = await Game.findById(id);
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    game.packs = game.packs.filter(pack => pack.packId !== packId);
    await game.save();

    res.json({ message: 'Pack deleted successfully', game });
  } catch (error) {
    console.error('Delete pack error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Public Controllers
const getAllGames = async (req, res) => {
  try {
    const { category, apiProvider, search } = req.query;
    let query = { isActive: true };

    if (category) {
      query.category = category;
    }

    if (apiProvider) {
      query.apiProvider = apiProvider;
    }

    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const games = await Game.find(query)
      .select('name description image apiProvider region category packs')
      .sort({ createdAt: -1 });

    res.json({ games });
  } catch (error) {
    console.error('Get games error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getGameById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const game = await Game.findOne({ _id: id, isActive: true })
      .populate('createdBy', 'name email');

    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    res.json({ game });
  } catch (error) {
    console.error('Get game by ID error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const validateGameUser = async (req, res) => {
  try {
    const { gameId, userId, serverId } = req.body;
    
    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    const validationResult = await apiService.validateUser(
      game.apiProvider,
      game.apiGameId,
      userId,
      serverId
    );

    res.json({ 
      valid: true, 
      userInfo: validationResult,
      message: 'User validated successfully' 
    });
  } catch (error) {
    console.error('User validation error:', error);
    res.status(400).json({ 
      valid: false, 
      message: error.message || 'Failed to validate user' 
    });
  }
};

// Get available products from third-party APIs
const getApiProducts = async (req, res) => {
  try {
    const { provider } = req.params;

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    const products = await apiService.getProducts(provider);
    res.json({ products });
  } catch (error) {
    console.error('Get API products error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  createGame,
  updateGame,
  deleteGame,
  addPackToGame,
  updatePack,
  deletePack,
  getAllGames,
  getGameById,
  validateGameUser,
  getApiProducts
};