// controllers/gameController.js
const Game = require('../models/Game');
const Order = require('../models/Order');
const APIService = require('../services/apiService');
const { StatusCodes } = require('http-status-codes');
const { BadRequestError, NotFoundError } = require('../errors');

const VALID_PROVIDERS = ['smile.one', 'yokcash', 'hopestore'];

// Get all games (public)
const getAllGames = async (req, res) => {
  try {
    const games = await Game.find({ isActive: true })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    
    res.status(StatusCodes.OK).json({
      success: true,
      count: games.length,
      games
    });
  } catch (error) {
    console.error('Error fetching games:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error fetching games',
      error: error.message
    });
  }
};

// Get single game by ID
const getGameById = async (req, res) => {
  try {
    const { id } = req.params;
    const game = await Game.findById(id).populate('createdBy', 'name email');
    
    if (!game) {
      throw new NotFoundError('Game not found');
    }
    
    res.status(StatusCodes.OK).json({
      success: true,
      game
    });
  } catch (error) {
    console.error('Error fetching game:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error fetching game',
      error: error.message
    });
  }
};

// Create new game (admin only)
// Create new game (admin only)
const createGame = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { name, description, image, region, category, packs } = req.body;

    // Validate required fields (removed apiProvider and apiGameId)
    if (!name || !description || !image || !region) {
      throw new BadRequestError('Please provide all required fields');
    }

    // Check if game already exists with same name
    const existingGame = await Game.findOne({ 
      name: { $regex: new RegExp(name, 'i') }
    });

    if (existingGame) {
      throw new BadRequestError('Game with this name already exists');
    }

    // Validate packs if provided
    if (packs && packs.length > 0) {
      for (const pack of packs) {
        if (!pack.provider || !pack.packId) {
          throw new BadRequestError('Each pack must have a provider and packId');
        }
      }
    }

    const gameData = {
      name: name.trim(),
      description: description.trim(),
      image,
      region,
      category: category || 'Mobile Games',
      packs: packs || [],
      createdBy: req.user.userId
    };

    const game = await Game.create(gameData);
    await game.populate('createdBy', 'name email');

    res.status(StatusCodes.CREATED).json({
      success: true,
      message: 'Game created successfully',
      game
    });
  } catch (error) {
    console.error('Error creating game:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error creating game',
      error: error.message
    });
  }
};
// Get products for a specific provider (for dropdown population)
// Get products for a specific provider
const getProviderProducts = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false, message: 'Access denied. Admin only.'
      });
    }

    const { provider } = req.params;
    let products = [];
    
    switch (provider) {
      case 'smile.one':
        const games = await APIService.getSmileoneGames();
        products = games.map(game => ({
          id: game.name,
          name: game.name,
          displayName: game.name
        }));
        break;
        
      case 'yokcash':
        const yokResult = await APIService.getYokcashProducts();
        if (yokResult.status && yokResult.data) {
          const categories = [...new Set(yokResult.data.map(item => item.kategori).filter(Boolean))];
          products = categories.map(cat => ({
            id: cat.toLowerCase().replace(/\s+/g, '-'),
            name: cat,
            displayName: cat
          }));
        }
        break;
        
      case 'hopestore':
        const hopeResult = await APIService.getHopestoreProducts();
        if (hopeResult.status && hopeResult.data) {
          const categories = [...new Set(hopeResult.data.map(item => item.kategori).filter(Boolean))];
          products = categories.map(cat => ({
            id: cat.toLowerCase().replace(/\s+/g, '-'),
            name: cat,
            displayName: cat
          }));
        }
        break;
        
      default:
        throw new BadRequestError('Invalid provider');
    }
    
    res.status(StatusCodes.OK).json({ success: true, products });
  } catch (error) {
    console.error('Error fetching provider products:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false, message: 'Error fetching products', error: error.message
    });
  }
};

// Get packs for a specific provider and product
const getProviderPacks = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false, message: 'Access denied. Admin only.'
      });
    }

    const { provider, productId } = req.params;
    let packs = [];
    
    switch (provider) {
   case 'smile.one':
  const smileResult = await APIService.getSmileonePacks(productId);
  packs = smileResult.data?.product || smileResult || [];
  break;
      case 'yokcash':
        const yokResult = await APIService.getYokcashProducts();
        if (yokResult.status && yokResult.data) {
          const targetCategory = productId.replace(/-/g, ' ');
          packs = yokResult.data.filter(item => 
            item.kategori && item.kategori.toLowerCase().includes(targetCategory.toLowerCase())
          );
        }
        break;
        
      case 'hopestore':
        const hopeResult = await APIService.getHopestoreProducts();
        if (hopeResult.status && hopeResult.data) {
          const targetCategory = productId.replace(/-/g, ' ');
          packs = hopeResult.data.filter(item => 
            item.kategori && item.kategori.toLowerCase().includes(targetCategory.toLowerCase())
          );
        }
        break;
        
      default:
        throw new BadRequestError('Invalid provider');
    }
    
    res.status(StatusCodes.OK).json({ success: true, packs });
  } catch (error) {
    console.error('Error fetching provider packs:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false, message: 'Error fetching packs', error: error.message
    });
  }
};

// Update game (admin only)
const updateGame = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { id } = req.params;
    const updateData = req.body;

    const game = await Game.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email');

    if (!game) {
      throw new NotFoundError('Game not found');
    }

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Game updated successfully',
      game
    });
  } catch (error) {
    console.error('Error updating game:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error updating game',
      error: error.message
    });
  }
};

// Delete game (admin only)
const deleteGame = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { id } = req.params;
    const game = await Game.findByIdAndDelete(id);

    if (!game) {
      throw new NotFoundError('Game not found');
    }

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Game deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting game:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error deleting game',
      error: error.message
    });
  }
};

// Add pack to game (admin only)
const addPackToGame = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { id } = req.params;
    const { packId, name, description, image, amount, retailPrice, resellerPrice, costPrice, isActive, provider } = req.body;

    if (!provider || !VALID_PROVIDERS.includes(provider)) {
      throw new BadRequestError('Pack provider is required and must be valid');
    }

    const game = await Game.findById(id);
    if (!game) {
      throw new NotFoundError('Game not found');
    }

    const packData = {
      packId,
      name,
      description,
      image: image || null,
      amount,
      retailPrice,
      resellerPrice,
      costPrice,
      isActive: isActive !== undefined ? isActive : true,
      provider
    };

    game.packs.push(packData);
    await game.save();

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Pack added successfully',
      game
    });
  } catch (error) {
    console.error('Error adding pack:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error adding pack',
      error: error.message
    });
  }
};

// Update pack in game (admin only)
const updatePack = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { id, packId } = req.params;
    const updateData = req.body;

    if (updateData.provider && !VALID_PROVIDERS.includes(updateData.provider)) {
      throw new BadRequestError('Pack provider must be valid');
    }

    const game = await Game.findById(id);
    if (!game) {
      throw new NotFoundError('Game not found');
    }

    const packIndex = game.packs.findIndex(pack => pack.packId === packId);
    if (packIndex === -1) {
      throw new NotFoundError('Pack not found');
    }

    game.packs[packIndex] = { 
      ...game.packs[packIndex].toObject(), 
      ...updateData,
      image: updateData.image !== undefined ? updateData.image : game.packs[packIndex].image
    };
    
    await game.save();

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Pack updated successfully',
      game
    });
  } catch (error) {
    console.error('Error updating pack:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error updating pack',
      error: error.message
    });
  }
};

// Delete pack from game (admin only)
const deletePack = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { id, packId } = req.params;

    const game = await Game.findById(id);
    if (!game) {
      throw new NotFoundError('Game not found');
    }

    game.packs = game.packs.filter(pack => pack.packId !== packId);
    await game.save();

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Pack deleted successfully',
      game
    });
  } catch (error) {
    console.error('Error deleting pack:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error deleting pack',
      error: error.message
    });
  }
};

// Get API games from Smile.one
const getApiGames = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const games = await APIService.getSmileoneGames();
    
    res.status(StatusCodes.OK).json({
      success: true,
      games: games || []
    });
  } catch (error) {
    console.error('Error fetching API games:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error fetching API games',
      error: error.message
    });
  }
};

// Get API servers for a specific product
const getApiServers = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { product } = req.params;
    
    if (!product) {
      throw new BadRequestError('Product parameter is required');
    }

    const servers = await APIService.getSmileoneServers(product);
    
    res.status(StatusCodes.OK).json({
      success: true,
      servers: servers || []
    });
  } catch (error) {
    console.error('Error fetching API servers:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error fetching API servers',
      error: error.message
    });
  }
};

// Get API packs for a specific product
const getApiPacks = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { product } = req.params;
    
    if (!product) {
      throw new BadRequestError('Product parameter is required');
    }

    const packs = await APIService.getSmileonePacks(product);
    
    res.status(StatusCodes.OK).json({
      success: true,
      packs: packs || []
    });
  } catch (error) {
    console.error('Error fetching API packs:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error fetching API packs',
      error: error.message
    });
  }
};

// Get products from different API providers
const getApiProducts = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { provider } = req.params;
    const { productSlug } = req.query;

    const products = await APIService.getProducts(provider, productSlug);
    
    res.status(StatusCodes.OK).json({
      success: true,
      products: products || []
    });
  } catch (error) {
    console.error('Error fetching API products:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error fetching API products',
      error: error.message
    });
  }
};

// Validate game user across different providers
const validateGameUser = async (req, res) => {
  try {
    const { gameId, userId, serverId } = req.body;
    
    if (!gameId || !userId) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: 'Game ID and User ID are required'
      });
    }

    // Get game to determine provider
    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({
        success: false,
        valid: false,
        message: 'Game not found'
      });
    }

    const provider = game.apiProvider; // Assuming you have this field

    if (provider === 'smile.one') {
      const validationResult = await APIService.validateUser(provider, game.apiGameId, userId, serverId);
      
      const isValid = validationResult?.status === 200;
      
      res.status(200).json({
        success: true,
        valid: isValid,
        data: isValid ? {
          userId: userId,
          username: validationResult.username || 'Unknown',
          zone: validationResult.zone
        } : null,
        message: isValid ? 'User validated successfully' : 'User validation failed'
      });
    } else {
      // For Yokcash/Hopestore - no validation, just return success
      res.status(200).json({
        success: true,
        valid: true,
        data: {
          userId: userId,
          username: 'User', // Generic username
          zone: serverId || 'N/A'
        },
        message: 'User validated successfully'
      });
    }
  } catch (error) {
    console.error('Error validating user:', error);
    res.status(200).json({
      success: false,
      valid: false,
      message: 'User validation failed',
      error: error.message
    });
  }
};

const getAvailableVouchers = async (req, res) => {
  try {
    const vouchers = await Voucher.aggregate([
      { $match: { status: 'active' } },
      {
        $group: {
          _id: { type: '$type', denomination: '$denomination' },
          count: { $sum: 1 },
          price: { $first: '$price' },
          sampleId: { $first: '$_id' }
        }
      },
      {
        $project: {
          _id: '$sampleId',
          name: { $concat: [{ $toString: '$_id.denomination' }, ' ', { $toUpper: '$_id.type' }, ' Voucher'] },
          type: '$_id.type',
          denomination: '$_id.denomination',
          retailPrice: '$price',
          resellerPrice: { $multiply: ['$price', 0.95] },
          availableCount: '$count',
          category: 'Game Vouchers',
          image: 'https://via.placeholder.com/300x200/4f46e5/ffffff?text=Voucher'
        }
      }
    ]);

    res.json({ success: true, vouchers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getAllGames,
  getGameById,
  createGame,
  updateGame,
  deleteGame,
  addPackToGame,
  updatePack,
  deletePack,
  getApiGames,
  getApiServers,
  getApiPacks,
  getApiProducts,
  validateGameUser,
  getProviderProducts,
  getProviderPacks,
  getAvailableVouchers
};