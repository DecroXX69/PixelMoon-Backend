// models/WalletTransaction.js - Wallet transaction model
const mongoose = require('mongoose');

const WalletTransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  phonepeTransactionId: {
    type: String,
    index: true
  },
  phonepeCheckId: {
    type: String,
    index: true
  },
  type: {
    type: String,
    enum: ['DEPOSIT', 'DEBIT', 'REFUND', 'CREDIT'],
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'SUCCESS', 'FAILED', 'CANCELLED'],
    default: 'PENDING'
  },
  amountPaise: {
    type: Number,
    required: true,
    min: 0
  },
  description: {
    type: String,
    required: true
  },
  // For deposit transactions
  paymentMethod: {
    type: String,
    enum: ['UPI', 'CARD', 'NET_BANKING', 'WALLET'],
    default: 'UPI'
  },
  // For game top-up debits
  relatedOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  // Metadata for debugging
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Balance after this transaction
  balanceAfterTransaction: {
    type: Number,
    required: true
  }
}, {
  timestamps: true,
});

// Compound index for user's transaction history
WalletTransactionSchema.index({ userId: 1, createdAt: -1 });

// Static method to generate unique transaction ID
WalletTransactionSchema.statics.generateTransactionId = function() {
  return 'TXN_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9).toUpperCase();
};

// Helper method to get amount in rupees
WalletTransactionSchema.methods.getAmountInRupees = function() {
  return this.amountPaise / 100;
};

module.exports = mongoose.model('WalletTransaction', WalletTransactionSchema);