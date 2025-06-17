// models/Game.js
const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  image: {
    type: String,
    required: true
  },
  apiProvider: {
    type: String,
    enum: ['smile.one', 'yokcash', 'hopestore'],
    required: true
  },
  apiGameId: {
    type: String,
    required: true // This is the game ID used by the third-party API
  },
  region: {
    type: String,
    required: true
  },
  category: {
    type: String,
    default: 'Mobile Games'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  packs: [{
  packId: {
    type: String,
    required: true,
    set: v => v.trim()
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  image: {
    type: String,
    default: null // Pack image is optional
  },
  amount: {
    type: Number,
    required: true
  },
  retailPrice: {
    type: Number,
    required: true
  },
  resellerPrice: {
    type: Number,
    required: true
  },
  costPrice: {
    type: Number,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for better query performance
gameSchema.index({ name: 1, apiProvider: 1 });
gameSchema.index({ isActive: 1 });

module.exports = mongoose.model('Game', gameSchema);