const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const https = require('https');
const http = require('http');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Render health checks)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS: ' + origin));
    }
  },
  credentials: true,
}));
app.use(express.json());

// Database Connection
const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/kaslot';
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected to', mongoURI))
  .catch(err => console.log('MongoDB connection error:', err));

// Basic route
app.get('/', (req, res) => {
  res.send('Kaslot API is running');
});

// Import Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/events', require('./routes/events'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/partners', require('./routes/partners'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/google', require('./routes/google'));
app.use('/api/calendar', require('./routes/calendar'));
app.use('/api/data', require('./routes/data'));
app.use('/api/budget', require('./routes/budget'));
app.use('/api/client-payments', require('./routes/clientPayments'));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Keep-alive ping mechanism for Render (runs every 14 minutes)
  const BACKEND_URL = process.env.BACKEND_URL;
  if (BACKEND_URL) {
    console.log(`Self-ping initialized for: ${BACKEND_URL}`);
    setInterval(() => {
      const protocol = BACKEND_URL.startsWith('https') ? https : http;
      protocol.get(BACKEND_URL, (res) => {
        console.log(`Self-ping status: ${res.statusCode}`);
      }).on('error', (err) => {
        console.error('Self-ping error:', err.message);
      });
    }, 14 * 60 * 1000); // 14 minutes
  }
});
