// models/Order.js - Fixed schema
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    unique: true,
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  game: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game',
    required: true
  },
  pack: {
    packId: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    price: {
      type: Number,
      required: true
    },
    costPrice: {
      type: Number,
      required: true
    }
  },
  gameUserInfo: {
    userId: {
      type: String,
      required: true
    },
    serverId: {
      type: String
    },
    username: {
      type: String
    }
  },
  paymentInfo: {
    method: {
      type: String,
      enum: ['wallet', 'phonepe'],
      required: true
    },
    transactionId: String,
    walletTransactionId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'WalletTransaction' 
    },
    phonepeOrderId: String,
    amount: { 
      type: Number, 
      required: true 
    },
    currency: { 
      type: String, 
      default: 'INR' 
    }
  },
  apiOrder: {
  provider: {
    type: String,
    enum: ['smile.one', 'yokcash', 'hopestore', 'voucher'], // Add 'voucher'
    required: true
  },
    apiOrderId: {
      type: String
    },
    apiResponse: {
      type: mongoose.Schema.Types.Mixed
    }
  },
  status: {
    type: String,
    enum: ['pending', 'awaiting_payment', 'paid', 'processing', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  profit: {
    type: Number,
    default: 0
  },
  notes: {
    type: String
  },
  completedAt: {
    type: Date
  },
  failureReason: {
    type: String
  },
  refundInfo: {
    refundedAt: Date,
    reason: String,
    refundedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }
}, {
  timestamps: true
});

// Generate unique order ID
orderSchema.pre('validate', async function(next) {
  if (!this.orderId) {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.orderId = `ORD-${timestamp}-${random}`;
  }
  next();
});

// Index for better query performance
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ orderId: 1 });

module.exports = mongoose.model('Order', orderSchema);