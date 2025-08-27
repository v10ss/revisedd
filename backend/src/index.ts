import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { config } from './config/config';
import { generalLimiter, sensitiveLimiter, burstLimiter } from './middleware/rateLimiter';
import { connectDatabase, initializeDatabase } from './config/database';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import customerRoutes from './routes/customers';
import queueRoutes from './routes/queue';
import transactionRoutes from './routes/transactions';
import adminRoutes from './routes/admin';
import analyticsRoutes from './routes/analytics';
import smsRoutes from './routes/sms';
import settingsRoutes from './routes/settings';
import customerNotificationRoutes from './routes/customerNotifications'; // ISOLATED: Separate from queue
import schedulerRoutes from './routes/scheduler';
import exportRoutes from './routes/exports';
import migrationRoutes from './routes/migration'; // NEW: API-based migration endpoint
import { authenticateToken } from './middleware/auth';
import { setupWebSocketHandlers } from './services/websocket';
import { errorHandler } from './middleware/errorHandler';
import { DailyQueueScheduler } from './services/DailyQueueScheduler';

const app: express.Application = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      process.env.FRONTEND_URL || "http://localhost:3000",
      "https://escashop-frontend.onrender.com",
      "http://localhost:3000",
      "http://localhost:3001"
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  }
});

// Trust proxy configuration for rate limiter
// Option 1: For development/localhost only
if (process.env.NODE_ENV === 'development') {
  app.set('trust proxy', 'loopback');
} else {
  // Option 2: For production - specify your proxy/load balancer IP
  // app.set('trust proxy', ['127.0.0.1', '::1', 'your-load-balancer-ip']);
  // Option 3: For cloud platforms (Heroku, Railway, etc.)
  app.set('trust proxy', 1); // Trust first proxy
}

// Middleware
app.use(generalLimiter);
// CORS configuration with flexible frontend URL support
const allowedOrigins = [
  config.FRONTEND_URL || 'http://localhost:3000',
  'https://escashop-frontend.onrender.com',
  'https://escashop-frontend-*.onrender.com', // Allow subdomains
  'http://localhost:3000',
  'http://localhost:3001',
  // Additional production URLs to ensure CORS works
  'https://escashop-frontend-production.onrender.com',
  'https://escashop-frontend-main.onrender.com'
];

console.log('🌐 [CORS DEBUG] Allowed origins:', allowedOrigins);
console.log('🌐 [CORS DEBUG] FRONTEND_URL from config:', config.FRONTEND_URL);

app.use(cors({
  origin: (origin, callback) => {
    console.log(`🔍 [CORS DEBUG] Request from origin: '${origin}'`);
    console.log(`🔍 [CORS DEBUG] Checking against allowed origins:`, allowedOrigins);
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      console.log(`✅ [CORS DEBUG] Allowing request with no origin`);
      return callback(null, true);
    }
    
    // Check exact matches
    if (allowedOrigins.includes(origin)) {
      console.log(`✅ [CORS DEBUG] Origin '${origin}' found in allowed origins - ALLOWED`);
      return callback(null, true);
    }
    
    // Check pattern matches (like *.onrender.com)
    for (const allowedOrigin of allowedOrigins) {
      if (allowedOrigin.includes('*')) {
        const pattern = allowedOrigin.replace('*', '[a-zA-Z0-9-]+');
        const regex = new RegExp(`^${pattern}$`);
        console.log(`🔍 [CORS DEBUG] Testing pattern '${allowedOrigin}' -> regex '${regex}' against '${origin}'`);
        if (regex.test(origin)) {
          console.log(`✅ [CORS DEBUG] Origin '${origin}' matches pattern '${allowedOrigin}' - ALLOWED`);
          return callback(null, true);
        }
      }
    }
    
    console.log(`❌ [CORS DEBUG] Origin '${origin}' NOT ALLOWED`);
    console.log(`CORS blocked request from origin: ${origin}`);
    callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
// Deployment: 2025-08-18 13:08 UTC - Fixed CORS and analytics initialization
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    deployment: '2025-08-20 01:37 UTC - Always Create Initial Transactions Fix'
  });
});

// Sensitive routes with stricter limits
app.use('/api/auth/login', sensitiveLimiter);
app.use('/api/auth/password-reset', sensitiveLimiter);
app.use('/api/auth/request-password-reset', sensitiveLimiter);
app.use('/api/auth/reset-password', burstLimiter);
app.use('/api/transactions/checkout', sensitiveLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/customers', authenticateToken, customerRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/transactions', authenticateToken, transactionRoutes);
app.use('/api/admin', authenticateToken, adminRoutes);
app.use('/api/analytics', authenticateToken, analyticsRoutes);
app.use('/api/sms', authenticateToken, smsRoutes);
app.use('/api/settings', authenticateToken, settingsRoutes);
app.use('/api/customer-notifications', authenticateToken, customerNotificationRoutes); // ISOLATED: Separate from queue/SMS
app.use('/api/scheduler', authenticateToken, schedulerRoutes);
app.use('/api/exports', authenticateToken, exportRoutes);
app.use('/api/migration', authenticateToken, migrationRoutes); // NEW: API-based migration endpoints

// Global error handler middleware - must be added after all routes
app.use(errorHandler);

// WebSocket setup
setupWebSocketHandlers(io);

// Make io available globally
app.set('io', io);

// Import and set WebSocket service
const { WebSocketService } = require('./services/websocket');
WebSocketService.setIO(io);

const PORT = config.PORT || 5000;

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  // Stop the scheduler gracefully
  try {
    DailyQueueScheduler.stop();
    console.log('Daily Queue Scheduler stopped');
  } catch (error) {
    console.error('Error stopping scheduler:', error);
  }
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  
  // Stop the scheduler gracefully
  try {
    DailyQueueScheduler.stop();
    console.log('Daily Queue Scheduler stopped');
  } catch (error) {
    console.error('Error stopping scheduler:', error);
  }
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  server.close(() => {
    process.exit(1);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  server.close(() => {
    process.exit(1);
  });
});

async function startServer() {
  try {
    await connectDatabase();
    console.log('Database connected successfully');
    
    // Initialize database tables
    await initializeDatabase();
    
    // Initialize Daily Queue Scheduler
    try {
      DailyQueueScheduler.initialize();
      console.log('✅ Daily Queue Scheduler initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Daily Queue Scheduler:', error);
      // Continue without scheduler rather than crashing the server
    }
    
    // Check if port is available before starting
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
    
    // Handle server errors
    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Please kill the existing process or use a different port.`);
        console.error('You can kill the process using: taskkill /PID <PID> /F (on Windows) or kill -9 <PID> (on Linux/Mac)');
        process.exit(1);
      } else {
        console.error('Server error:', error);
        process.exit(1);
      }
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export default app;
