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
  // Remove apiProvider and apiGameId from here
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
      default: null
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
    provider: {
      type: String,
      enum: ['smile.one', 'yokcash', 'hopestore'],
      required: true
    },
    productId: {
      type: String,
      required: true // This replaces apiGameId at pack level
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

// Update index
gameSchema.index({ name: 1 });
gameSchema.index({ isActive: 1 });

module.exports = mongoose.model('Game', gameSchema);