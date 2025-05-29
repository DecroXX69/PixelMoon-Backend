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
const axios   = require('axios');
// Import routes
const authRoutes = require('./routes/authRoutes');
const gameRoutes = require('./routes/gameRoutes');
const testRoutes = require('./routes/testRoutes');
// Import middleware
const { errorHandlerMiddleware } = require('./errors/index');
const notFoundMiddleware = require('./middleware/not-found');
const allowedOrigins = [
    'http://localhost:5173',
    'http://13.200.154.171' ,
    'https://pixelmoonstore.in',
    'https://www.pixelmoonstore.in'       // your Lightsail IP
  ];
// Security middleware
app.use(helmet());

  

app.use(cors({
    origin: function(origin, callback) {
      if (!origin) return callback(null, true); // for curl/postman etc.
      if (allowedOrigins.indexOf(origin) === -1) {
        return callback(new Error('CORS not allowed'), false);
      }
      return callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  }));

  
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
app.use('/api/v1/games', gameRoutes);
app.use('/api/test', testRoutes);




// Custom middleware
app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);

// Start server
const port = process.env.PORT || 3000;

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