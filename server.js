require('dotenv').config();
require('express-async-errors');
const walletRoutes = require('./routes/walletRoutes');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const xss = require('xss-clean');
const mongoSanitize = require('express-mongo-sanitize');
const connectDB = require('./db/connect');
const leaderboardRoutes = require('./routes/leaderboardRoutes');
const authRoutes     = require('./routes/authRoutes');
const gameRoutes     = require('./routes/gameRoutes');
const testRoutes     = require('./routes/testRoutes');
const balanceRoutes  = require('./routes/balanceRoutes');
const orderRoutes    = require('./routes/orderRoutes');
const voucherRouter  = require('./routes/voucherRoutes');
const { authenticateUser } = require('./middleware/authMiddleware');
const notFoundMiddleware   = require('./middleware/not-found');
const { errorHandlerMiddleware } = require('./errors/index');
const adminBannersRouter = require('./routes/bannerRoutes');
const publicBannersRouter = require('./routes/publicbannerRoutes');
const app = express();

// Trust proxy if behind a load balancer (optional)
// app.set('trust proxy', true);

// 1) CORS – must be before any other middleware or routes
const allowedOrigins = [
  'http://localhost:5173',
  'http://13.200.154.171',
  'https://pixelmoonstore.in',
  'https://www.pixelmoonstore.in'
];

app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (e.g. mobile apps, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'), false);
  },
  methods: ['GET','POST','PUT','DELETE','OPTIONS','PATCH'],
  credentials: true,
  optionsSuccessStatus: 200
}));

// 2) Preflight handler – respond 200 to all OPTIONS requests
app.options('*', (req, res) => {
  res.sendStatus(200);
});

// 3) Security middleware
app.use(xss());
app.use(mongoSanitize());
app.use(helmet());

// 4) Body parser
app.use(express.json());

// 5) Routes
app.use('/api/auth',      authRoutes);
app.use('/api/games',     gameRoutes);
app.use('/api/test',      testRoutes);
app.use('/api/balances',  balanceRoutes);
app.use('/api/orders',    orderRoutes);
app.use('/api/vouchers',  authenticateUser, voucherRouter);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/admin/banners', adminBannersRouter);
app.use('/api/banners', publicBannersRouter);
app.use('/api/wallet', walletRoutes);
app.use('/api/profit-calculator', require('./routes/profitCalculator'));
// 6) 404 + Error handlers
app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);

// 7) Start server
const port = process.env.PORT || 3000;
const start = async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    app.listen(port, () =>
      console.log(`Server is listening on port ${port}...`)
    );
  } catch (error) {
    console.error('Failed to start server:', error);
  }
};

start();
