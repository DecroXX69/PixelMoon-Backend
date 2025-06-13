// models/User.js - Updated User model with wallet functionality
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide name'],
    minlength: 3,
    maxlength: 50,
  },
  email: {
    type: String,
    required: [true, 'Please provide email'],
    match: [
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
      'Please provide a valid email',
    ],
    unique: true,
  },
  password: {
    type: String,
    required: [true, 'Please provide password'],
    minlength: 6,
  },
  role: {
    type: String,
    enum: ['user', 'reseller', 'admin'],
    default: 'user',
  },
  balance: {
    type: Number,
    default: 0,
  },
  // Add wallet balance in paise (1 rupee = 100 paise)
  walletBalancePaise: {
    type: Number,
    default: 0,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  gender: {
    type: String,
    enum: ['male','female','other'],
    default: 'other'
  },
  state: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    match: [/^\d{10}$/, 'Please provide a valid 10-digit phone number'],
    unique: true,
  }
}, {
  timestamps: true,
});

UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

UserSchema.methods.createJWT = function () {
  return jwt.sign(
    { userId: this._id, name: this.name, role: this.role },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_LIFETIME,
    }
  );
};

UserSchema.methods.comparePassword = async function (candidatePassword) {
  const isMatch = await bcrypt.compare(candidatePassword, this.password);
  return isMatch;
};

// Helper methods for wallet operations
UserSchema.methods.getWalletBalanceInRupees = function() {
  return this.walletBalancePaise / 100;
};

UserSchema.methods.addToWallet = async function(amountInPaise) {
  this.walletBalancePaise += amountInPaise;
  return await this.save();
};

UserSchema.methods.deductFromWallet = async function(amountInPaise) {
  if (this.walletBalancePaise < amountInPaise) {
    throw new Error('Insufficient wallet balance');
  }
  this.walletBalancePaise -= amountInPaise;
  return await this.save();
};

module.exports = mongoose.model('User', UserSchema);