const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  imageUrl: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(v);
      },
      message: 'Please provide a valid image URL'
    }
  },
  altText: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  link: {
    type: String,
    required: true,
    trim: true
  },
  order: {
    type: Number,
    required: true,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  title: {
    type: String,
    trim: true,
    maxlength: 50
  },
  category: {
    type: String,
    enum: ['games', 'giftcards', 'promotions'],
    default: 'games'
  }
}, {
  timestamps: true
});

// Index for efficient queries
bannerSchema.index({ order: 1, isActive: 1 });

bannerSchema.pre('save', function(next) {
  if (!this.order) {
    this.order = Date.now(); // Fallback order
  }
  next();
});

module.exports = mongoose.model('Banner', bannerSchema);