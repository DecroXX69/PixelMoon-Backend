// controllers/authController.js - Updated with admin functionality
const User = require('../models/User');
const { StatusCodes } = require('http-status-codes');
const { BadRequestError, UnauthenticatedError } = require('../errors');

const register = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    throw new BadRequestError('Please provide name, email, and password');
  }

  // Check if this is the first user (make them admin)
  const userCount = await User.countDocuments();
  const role = userCount === 0 ? 'admin' : 'user';

  const user = await User.create({ 
    name, 
    email, 
    password,
    role 
  });

  const token = user.createJWT();
  
  res.status(StatusCodes.CREATED).json({
    user: {
      name: user.name,
      email: user.email,
      role: user.role,
      balance: user.balance,
    },
    token,
  });
};

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new BadRequestError('Please provide email and password');
  }

  const user = await User.findOne({ email });

  if (!user) {
    throw new UnauthenticatedError('Invalid Credentials');
  }

  const isPasswordCorrect = await user.comparePassword(password);

  if (!isPasswordCorrect) {
    throw new UnauthenticatedError('Invalid Credentials');
  }

  if (!user.isActive) {
    throw new UnauthenticatedError('Account is deactivated');
  }

  const token = user.createJWT();

  res.status(StatusCodes.OK).json({
    user: {
      name: user.name,
      email: user.email,
      role: user.role,
      balance: user.balance,
    },
    token,
  });
};

const getCurrentUser = async (req, res) => {
  const user = await User.findById(req.user.userId).select('-password');
  res.status(StatusCodes.OK).json({ user });
};

// Admin function to promote user to reseller
const promoteToReseller = async (req, res) => {
  const { userId } = req.params;
  
  if (req.user.role !== 'admin') {
    throw new UnauthenticatedError('Access denied. Admin only.');
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { role: 'reseller' },
    { new: true }
  ).select('-password');

  if (!user) {
    throw new BadRequestError('User not found');
  }

  res.status(StatusCodes.OK).json({
    message: 'User promoted to reseller successfully',
    user
  });
};

// Admin function to create admin account manually
const createAdmin = async (req, res) => {
  const { name, email, password, adminSecret } = req.body;

  // Check admin secret (you can set this in your .env file)
  if (adminSecret !== process.env.ADMIN_SECRET) {
    throw new UnauthenticatedError('Invalid admin secret');
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new BadRequestError('User with this email already exists');
  }

  const user = await User.create({ 
    name, 
    email, 
    password,
    role: 'admin'
  });

  const token = user.createJWT();
  
  res.status(StatusCodes.CREATED).json({
    user: {
      name: user.name,
      email: user.email,
      role: user.role,
      balance: user.balance,
    },
    token,
  });
};

module.exports = {
  register,
  login,
  getCurrentUser,
  promoteToReseller,
  createAdmin,
};