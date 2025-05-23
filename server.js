require('dotenv').config();
require('express-async-errors');

const express = require('express');
const app = express();
const cors = require('cors');
const helmet = require('helmet');
const xss = require('xss-clean');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const connectDB = require('./db/connect');

// Import routes
const authRoutes = require('./routes/authRoutes');
const gameRoutes = require('./routes/gameRoutes');

// Import middleware
const { errorHandlerMiddleware } = require('./errors/index');
const notFoundMiddleware = require('./middleware/not-found');

// Security middleware
app.use(helmet());
app.use(cors());
app.use(xss());
app.use(mongoSanitize());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// Express middleware
app.use(express.json());

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/games', gameRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Game Topup API is running',
    timestamp: new Date().toISOString()
  });
});

// Add this to your main app file (app.js/server.js)
app.get('/get-my-ip', async (req, res) => {
    try {
      // Method 1: Request headers
      const forwardedFor = req.headers['x-forwarded-for'];
      const realIP = req.headers['x-real-ip'];
      const clientIP = req.connection.remoteAddress;
      
      // Method 2: External service to get public IP
      const axios = require('axios');
      const externalIP = await axios.get('https://api.ipify.org?format=json');
      
      res.json({
        forwardedFor,
        realIP,
        clientIP,
        externalIP: externalIP.data.ip,
        renderURL: req.get('host')
      });
    } catch (error) {
      res.json({ error: error.message });
    }
  });

// Custom middleware
app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);

// Start server
const port = process.env.PORT || 5000;

const start = async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    app.listen(port, () =>
      console.log(`Server is listening on port ${port}...`)
    );
  } catch (error) {
    console.log(error);
  }
};

start();