const mongoose = require('mongoose');

const profitCalculatorSchema = new mongoose.Schema({
  productName: {
    type: String,
    required: true,
    unique: true
  },
  socNeeded: {
    type: Number,
    required: true
  },
  socCost: {
    type: Number,
    required: true,
    default: 1.55
  },
  sellingPriceReseller: {
    type: Number,
    required: true
  },
  sellingPriceCustomer: {
    type: Number,
    required: true
  },
  lastEditedBy: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Virtual fields for calculations
profitCalculatorSchema.virtual('totalCost').get(function() {
  return parseFloat((this.socNeeded * this.socCost).toFixed(2));
});

profitCalculatorSchema.virtual('resellerProfit').get(function() {
  return parseFloat((this.sellingPriceReseller - (this.socNeeded * this.socCost)).toFixed(2));
});

profitCalculatorSchema.virtual('customerProfit').get(function() {
  return parseFloat((this.sellingPriceCustomer - (this.socNeeded * this.socCost)).toFixed(2));
});

profitCalculatorSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('ProfitCalculator', profitCalculatorSchema);