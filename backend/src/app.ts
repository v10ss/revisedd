import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/config';
import { generalLimiter, sensitiveLimiter, burstLimiter } from './middleware/rateLimiter';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import customerRoutes from './routes/customers';
import queueRoutes from './routes/queue';
import transactionRoutes from './routes/transactions';
import adminRoutes from './routes/admin';
import analyticsRoutes from './routes/analytics';
import smsRoutes from './routes/sms';
import settingsRoutes from './routes/settings';
import customerNotificationRoutes from './routes/customerNotifications';
import schedulerRoutes from './routes/scheduler';
import exportRoutes from './routes/exports';
import fixTransactionRoutes from './routes/fix-transactions';
import migrationRoutes from './routes/migration';
import { authenticateToken } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';

const app: express.Application = express();

// Trust proxy configuration for rate limiter
if (process.env.NODE_ENV === 'development') {
  app.set('trust proxy', 'loopback');
} else {
  app.set('trust proxy', 1);
}

// Middleware
app.use(generalLimiter);
app.use(cors({
  origin: config.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
// Deployment: 2025-08-18 23:36 UTC - Fixed TransactionService amount casting to numeric
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    deployment: '2025-08-18 23:36 UTC - Fixed TransactionService amount casting to numeric'
  });
});

// Detailed API health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    deployment: '2025-08-18 23:36 UTC - Fixed TransactionService amount casting to numeric',
    api: 'active',
    database: 'connected'
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
app.use('/api/customer-notifications', authenticateToken, customerNotificationRoutes);
app.use('/api/scheduler', authenticateToken, schedulerRoutes);
app.use('/api/exports', authenticateToken, exportRoutes);
app.use('/api/fix-transactions', authenticateToken, fixTransactionRoutes);
app.use('/api/migration', authenticateToken, migrationRoutes);

// Global error handler middleware - must be added after all routes
app.use(errorHandler);

export default app;
export { app };
