const mongoose = require('mongoose');

const VoucherSchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Voucher code is required'],
    unique: true,
    trim: true,
    maxlength: [100, 'Voucher code cannot exceed 100 characters']
  },
  type: {
    type: String,
    required: [true, 'Voucher type is required'],
    enum: {
      values: ['smileone', 'moo'],
      message: 'Voucher type must be either smileone or moo'
    }
  },
  denomination: {
    type: Number,
    required: [true, 'Denomination is required'],
    min: [1, 'Denomination must be a positive number'],
    validate: {
      validator: function(value) {
        if (this.type === 'smileone') {
          return value >= 1000 && value <= 50000;
        } else if (this.type === 'moo') {
          return value >= 50 && value <= 1500;
        }
        return false;
      },
      message: function(props) {
        const type = this.type;
        if (type === 'smileone') {
          return 'Smile.one voucher denomination must be between 1,000 and 50,000';
        } else if (type === 'moo') {
          return 'MOO voucher denomination must be between 50 and 1,500';
        }
        return 'Invalid denomination for voucher type';
      }
    }
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0.01, 'Price must be greater than 0']
  },
  status: {
    type: String,
    enum: {
      values: ['active', 'redeemed'],
      message: 'Status must be either active or redeemed'
    },
    default: 'active'
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Uploaded by user is required']
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  redeemedAt: {
    type: Date,
    default: null
  },
  redeemedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for better query performance
VoucherSchema.index({ type: 1, status: 1 });
VoucherSchema.index({ denomination: 1 });
VoucherSchema.index({ uploadedBy: 1 });
VoucherSchema.index({ code: 1 }, { unique: true });

// Virtual for formatted price
VoucherSchema.virtual('formattedPrice').get(function() {
  return `$${this.price.toFixed(2)}`;
});

// Instance method to check if voucher is redeemable
VoucherSchema.methods.isRedeemable = function() {
  return this.status === 'active';
};

// Static method to get available vouchers by type and denomination
VoucherSchema.statics.getAvailable = function(type, denomination) {
  return this.find({
    type,
    denomination,
    status: 'active'
  }).sort({ uploadedAt: 1 }); // FIFO - first uploaded, first sold
};

// Static method to validate denomination ranges
VoucherSchema.statics.isValidDenomination = function(type, denomination) {
  if (type === 'smileone') {
    return denomination >= 1000 && denomination <= 50000;
  } else if (type === 'moo') {
    return denomination >= 50 && denomination <= 1500;
  }
  return false;
};

// Pre-save middleware to validate denomination based on type
VoucherSchema.pre('save', function(next) {
  if (this.isModified('type') || this.isModified('denomination')) {
    const isValid = this.constructor.isValidDenomination(this.type, this.denomination);
    if (!isValid) {
      const error = new Error(`Invalid denomination ${this.denomination} for voucher type ${this.type}`);
      return next(error);
    }
  }
  next();
});

module.exports = mongoose.model('Voucher', VoucherSchema);