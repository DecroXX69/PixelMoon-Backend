const ProfitCalculator = require('../models/ProfitCalculator');
const Order = require('../models/Order');

// Get all profit calculations with order counts
const getAllProfitCalculations = async (req, res) => {
  try {
    const calculations = await ProfitCalculator.find({ isActive: true });
    
    // Get order counts for each product
    const calculationsWithOrders = await Promise.all(
      calculations.map(async (calc) => {
        const orderCount = await Order.countDocuments({ 
          productName: calc.productName,
          status: 'completed' // Adjust based on your order status field
        });
        
        return {
          ...calc.toJSON(),
          ordersCount: orderCount
        };
      })
    );
    
    res.json({ success: true, data: calculationsWithOrders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create new profit calculation
const createProfitCalculation = async (req, res) => {
  try {
    const calculationData = {
      ...req.body,
      lastEditedBy: req.user.name || req.user.email // Assuming user info is in req.user
    };
    
    const calculation = new ProfitCalculator(calculationData);
    await calculation.save();
    
    res.status(201).json({ success: true, data: calculation });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Update profit calculation
const updateProfitCalculation = async (req, res) => {
  try {
    const updateData = {
      ...req.body,
      lastEditedBy: req.user.name || req.user.email
    };
    
    const calculation = await ProfitCalculator.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!calculation) {
      return res.status(404).json({ success: false, message: 'Calculation not found' });
    }
    
    res.json({ success: true, data: calculation });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Delete profit calculation
const deleteProfitCalculation = async (req, res) => {
  try {
    const calculation = await ProfitCalculator.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    
    if (!calculation) {
      return res.status(404).json({ success: false, message: 'Calculation not found' });
    }
    
    res.json({ success: true, message: 'Calculation deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getAllProfitCalculations,
  createProfitCalculation,
  updateProfitCalculation,
  deleteProfitCalculation
};