const { StatusCodes } = require('http-status-codes');
const Voucher = require('../models/Voucher');
const Game = require('../models/Game');
const { sendVoucherEmail } = require('../utils/email');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');

// Configure multer for CSV file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

/**
 * Middleware to require admin role
 */
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(StatusCodes.FORBIDDEN).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
};

/**
 * Log voucher requests
 */
const logVoucherRequest = (req, res, next) => {
  console.log(`[Voucher API] ${req.method} ${req.originalUrl} by user ${req.user.userId}`);
  next();
};

/**
 * Validate voucher data
 */
const validateVoucherData = (voucher) => {
  const errors = [];
  
  if (!voucher.code || typeof voucher.code !== 'string' || voucher.code.trim().length === 0) {
    errors.push('Code is required and must be a non-empty string');
  }
  
  if (!voucher.type || !['smileone', 'moo'].includes(voucher.type)) {
    errors.push('Type must be either "smileone" or "moo"');
  }
  
  if (!voucher.denomination || typeof voucher.denomination !== 'number' || voucher.denomination <= 0) {
    errors.push('Denomination must be a positive number');
  } else {
    // Validate denomination ranges
    if (voucher.type === 'smileone' && (voucher.denomination < 1000 || voucher.denomination > 50000)) {
      errors.push('Smile.one voucher denomination must be between 1,000 and 50,000');
    } else if (voucher.type === 'moo' && (voucher.denomination < 50 || voucher.denomination > 1500)) {
      errors.push('MOO voucher denomination must be between 50 and 1,500');
    }
  }
  
  if (!voucher.price || typeof voucher.price !== 'number' || voucher.price <= 0) {
    errors.push('Price must be a positive number');
  }
  
  return errors;
};

/**
 * Parse CSV data from buffer
 */
const parseCSVData = (buffer) => {
  return new Promise((resolve, reject) => {
    const results = [];
    const stream = Readable.from(buffer.toString());
    
    stream
      .pipe(csv())
      .on('data', (data) => {
        // Clean up the data and convert types
        const voucher = {
          code: data.code ? data.code.toString().trim() : '',
          type: data.type ? data.type.toString().toLowerCase().trim() : '',
          denomination: data.denomination ? parseFloat(data.denomination) : 0,
          price: data.price ? parseFloat(data.price) : 0
        };
        results.push(voucher);
      })
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
};

/**
 * Create vouchers (bulk upload)
 * POST /api/v1/vouchers
 */
const createVouchers = async (req, res) => {
  try {
    let vouchersData = [];
    
    // Handle CSV file upload
    if (req.file) {
      console.log('[VoucherController] Processing CSV file upload');
      vouchersData = await parseCSVData(req.file.buffer);
    } 
    // Handle JSON payload
    else if (req.body.vouchers && Array.isArray(req.body.vouchers)) {
      console.log('[VoucherController] Processing JSON voucher data');
      vouchersData = req.body.vouchers;
    } else {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Please provide vouchers array in request body or upload a CSV file'
      });
    }

    if (vouchersData.length === 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'No voucher data provided'
      });
    }

    const results = {
      insertedCount: 0,
      duplicates: [],
      invalid: []
    };

    // Process each voucher
    for (let i = 0; i < vouchersData.length; i++) {
      const voucherData = vouchersData[i];
      
      // Validate voucher data
      const validationErrors = validateVoucherData(voucherData);
      if (validationErrors.length > 0) {
        results.invalid.push({
          index: i + 1,
          code: voucherData.code,
          errors: validationErrors
        });
        continue;
      }

      try {
        // Check for existing voucher
        const existingVoucher = await Voucher.findOne({ code: voucherData.code.trim() });
        if (existingVoucher) {
          results.duplicates.push({
            index: i + 1,
            code: voucherData.code,
            message: 'Voucher code already exists'
          });
          continue;
        }

        // Create new voucher
        const newVoucher = new Voucher({
          code: voucherData.code.trim(),
          type: voucherData.type,
          denomination: voucherData.denomination,
          price: voucherData.price,
          uploadedBy: req.user.userId
        });

        await newVoucher.save();
       
        results.insertedCount++;

      } catch (error) {
        console.error(`[VoucherController] Error creating voucher at index ${i + 1}:`, error);
        results.invalid.push({
          index: i + 1,
          code: voucherData.code,
          errors: [error.message]
        });
      }
    }

    console.log(`[VoucherController] Voucher creation completed. Inserted: ${results.insertedCount}, Duplicates: ${results.duplicates.length}, Invalid: ${results.invalid.length}`);

    res.status(StatusCodes.CREATED).json({
      success: true,
      message: `Processed ${vouchersData.length} vouchers`,
      ...results
    });

  } catch (error) {
    console.error('[VoucherController createVouchers error:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to create vouchers',
      error: error.message
    });
  }
};

const createVoucherGame = async (voucher) => {
  try {
    const existingGame = await Game.findOne({ 
      name: `${voucher.type.toUpperCase()} ${voucher.denomination} Voucher`,
      category: 'Game Vouchers' 
    });
    
    if (!existingGame) {
      const newGame = new Game({
        name: `${voucher.type.toUpperCase()} ${voucher.denomination} Voucher`,
        description: `${voucher.type.toUpperCase()} voucher worth ${voucher.denomination}`,
        image: voucher.type === 'smileone' 
          ? 'https://example.com/smileone-voucher.jpg' 
          : 'https://example.com/moo-voucher.jpg',
        region: 'Global',
        category: 'Game Vouchers',
        packs: [{
          packId: `VOUCHER-${voucher.type}-${voucher.denomination}`,
          name: `${voucher.denomination} ${voucher.type.toUpperCase()} Credit`,
          description: `Digital voucher code`,
          amount: voucher.denomination,
          retailPrice: voucher.price,
          resellerPrice: voucher.price * 0.95,
          costPrice: voucher.price * 0.90,
          provider: 'voucher',
          productId: voucher.type,
          isActive: true
        }],
        createdBy: voucher.uploadedBy
      });
      
      await newGame.save();
    }
  } catch (error) {
    console.error('Error creating voucher game:', error);
  }
};

/**
 * Get vouchers with filtering and pagination
 * GET /api/v1/vouchers
 */
const getVouchers = async (req, res) => {
  try {
    const {
      type,
      denomination,
      status,
      page = 1,
      limit = 50
    } = req.query;

    // Build filter object
    const filter = {};
    
    if (type && ['smileone', 'moo'].includes(type)) {
      filter.type = type;
    }
    
    if (denomination) {
      filter.denomination = parseFloat(denomination);
    }
    
    if (status && ['active', 'redeemed'].includes(status)) {
      filter.status = status;
    }

    // Calculate pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit))); // Max 100 per page
    const skip = (pageNum - 1) * limitNum;

    console.log(`[VoucherController] Fetching vouchers with filter:`, filter);

    // Execute query with pagination
    const [vouchers, totalCount] = await Promise.all([
      Voucher.find(filter)
        .populate('uploadedBy', 'username email')
        .populate('redeemedBy', 'username email')
        .sort({ uploadedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Voucher.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalCount / limitNum);

    res.status(StatusCodes.OK).json({
      success: true,
      count: vouchers.length,
      totalCount,
      totalPages,
      currentPage: pageNum,
      limit: limitNum,
      vouchers: vouchers.map(voucher => ({
        _id: voucher._id,
        code: voucher.code,
        type: voucher.type,
        denomination: voucher.denomination,
        price: voucher.price,
        status: voucher.status,
        uploadedAt: voucher.uploadedAt,
        redeemedAt: voucher.redeemedAt,
        uploadedBy: voucher.uploadedBy,
        redeemedBy: voucher.redeemedBy
      }))
    });

  } catch (error) {
    console.error('[VoucherController getVouchers error:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to fetch vouchers',
      error: error.message
    });
  }
};

/**
 * Redeem a voucher
 * POST /api/v1/vouchers/:voucherId/redeem
 */
const redeemVoucher = async (req, res) => {
  try {
    const { voucherId } = req.params;
    const userId = req.user.userId;

    console.log(`[VoucherController] User ${userId} attempting to redeem voucher ${voucherId}`);

    // Find the voucher
    const voucher = await Voucher.findById(voucherId);
    
    if (!voucher) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Voucher not found'
      });
    }

    // Check if voucher is still active
    if (voucher.status !== 'active') {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Voucher has already been redeemed'
      });
    }

    // Update voucher status
    voucher.status = 'redeemed';
    voucher.redeemedAt = new Date();
    voucher.redeemedBy = userId;

    await voucher.save();

    console.log(`[VoucherController] Voucher ${voucherId} redeemed successfully`);

    // Send email to user
    try {
      const user = req.user; // Assuming user data is available in req.user
      await sendVoucherEmail({
        to: user.email,
        username: user.username || user.name || 'Valued Customer',
        code: voucher.code,
        type: voucher.type,
        denomination: voucher.denomination,
        price: voucher.price
      });

      console.log(`[VoucherController] Voucher email sent to ${user.email}`);
    } catch (emailError) {
      console.error('[VoucherController] Failed to send voucher email:', emailError);
      // Don't fail the entire request if email fails
      // The voucher is still redeemed successfully
    }

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Voucher redeemed successfully',
      voucher: {
        _id: voucher._id,
        code: voucher.code,
        type: voucher.type,
        denomination: voucher.denomination,
        price: voucher.price,
        redeemedAt: voucher.redeemedAt
      }
    });

  } catch (error) {
    console.error('[VoucherController redeemVoucher error:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to redeem voucher',
      error: error.message
    });
  }
};

/**
 * Update voucher (admin only)
 * PUT /api/v1/vouchers/:voucherId
 */
const updateVoucher = async (req, res) => {
  try {
    const { voucherId } = req.params;
    const { price, status } = req.body;

    console.log(`[VoucherController] Admin ${req.user.userId} updating voucher ${voucherId}`);

    const voucher = await Voucher.findById(voucherId);
    
    if (!voucher) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Voucher not found'
      });
    }

    // Update allowed fields
    if (price !== undefined) {
      if (typeof price !== 'number' || price <= 0) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: 'Price must be a positive number'
        });
      }
      voucher.price = price;
    }

    if (status !== undefined) {
      if (!['active', 'redeemed'].includes(status)) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: 'Status must be either active or redeemed'
        });
      }
      voucher.status = status;
      
      // If marking as redeemed, set redeemed date
      if (status === 'redeemed' && !voucher.redeemedAt) {
        voucher.redeemedAt = new Date();
      }
    }

    await voucher.save();

    console.log(`[VoucherController] Voucher ${voucherId} updated successfully`);

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Voucher updated successfully',
      voucher: {
        _id: voucher._id,
        code: voucher.code,
        type: voucher.type,
        denomination: voucher.denomination,
        price: voucher.price,
        status: voucher.status,
        uploadedAt: voucher.uploadedAt,
        redeemedAt: voucher.redeemedAt
      }
    });

  } catch (error) {
    console.error('[VoucherController updateVoucher error:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to update voucher',
      error: error.message
    });
  }
};

/**
 * Delete voucher (admin only)
 * DELETE /api/v1/vouchers/:voucherId
 */
const deleteVoucher = async (req, res) => {
  try {
    const { voucherId } = req.params;

    console.log(`[VoucherController] Admin ${req.user.userId} deleting voucher ${voucherId}`);

    const voucher = await Voucher.findById(voucherId);
    
    if (!voucher) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Voucher not found'
      });
    }

    // Prevent deletion of redeemed vouchers for audit trail
    if (voucher.status === 'redeemed') {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Cannot delete redeemed vouchers'
      });
    }

    await Voucher.findByIdAndDelete(voucherId);

    console.log(`[VoucherController] Voucher ${voucherId} deleted successfully`);

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Voucher deleted successfully'
    });

  } catch (error) {
    console.error('[VoucherController deleteVoucher error:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to delete voucher',
      error: error.message
    });
  }
};

/**
 * Get available vouchers for purchase (public endpoint for authenticated users)
 * GET /api/v1/vouchers/available
 */
const getAvailableVouchers = async (req, res) => {
  try {
    const { type, denomination } = req.query;

    const filter = { status: 'active' };
    
    if (type && ['smileone', 'moo'].includes(type)) {
      filter.type = type;
    }
    
    if (denomination) {
      filter.denomination = parseFloat(denomination);
    }

    // Group available vouchers by type and denomination
    const availableVouchers = await Voucher.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            type: '$type',
            denomination: '$denomination'
          },
          count: { $sum: 1 },
          price: { $first: '$price' },
          sampleId: { $first: '$_id' }
        }
      },
      {
        $project: {
          _id: '$sampleId',
          type: '$_id.type',
          denomination: '$_id.denomination',
          price: 1,
          availableCount: '$count'
        }
      },
      { $sort: { type: 1, denomination: 1 } }
    ]);

    res.status(StatusCodes.OK).json({
      success: true,
      count: availableVouchers.length,
      vouchers: availableVouchers
    });

  } catch (error) {
    console.error('[VoucherController getAvailableVouchers error:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to fetch available vouchers',
      error: error.message
    });
  }
};

module.exports = {
  createVouchers: [upload.single('csvFile'), requireAdmin, createVouchers],
  getVouchers: [requireAdmin, getVouchers],
  redeemVoucher,
  updateVoucher: [requireAdmin, updateVoucher],
  deleteVoucher: [requireAdmin, deleteVoucher],
  getAvailableVouchers,
  logVoucherRequest,
  requireAdmin
};