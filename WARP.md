# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

**EscaShop Optical Queue Management System** - A full-stack React/TypeScript queue management application for optical stores with real-time updates, RBAC authentication, and comprehensive transaction management.

## Tech Stack

### Frontend
- **React 19.1.0** with TypeScript 4.9.5
- **Material-UI 7.2.0** for components
- **Tailwind CSS 3.4.17** for styling
- **Socket.IO Client** for real-time updates
- **React Router 6.28.0** for routing

### Backend
- **Node.js 18+** with Express.js 4.18.2
- **TypeScript 5.2.2** for type safety
- **PostgreSQL 12+** with pg driver
- **Socket.IO 4.8.1** for WebSocket communication
- **JWT** for authentication
- **Argon2/bcrypt** for password hashing

## Common Development Commands

### Initial Setup
```bash
# Install all dependencies (frontend + backend)
npm install

# Setup environment variables
cp backend/.env.example backend/.env
# Configure DATABASE_URL, JWT secrets, and SMS provider settings
```

### Development
```bash
# Run both frontend (port 3000) and backend (port 5000) concurrently
npm run dev

# Run backend only
npm run dev:backend

# Run frontend only  
npm run dev:frontend

# Run database migrations (development)
cd backend && npm run migrate:dev
```

### Testing
```bash
# Run backend unit tests
cd backend && npm test

# Run E2E tests with Playwright
npm run test:e2e

# Run specific test files
npm run test:e2e:transactions  # Transaction page tests
npm run test:e2e:cashier       # Cashier workflow tests
npm run test:e2e:websocket     # WebSocket connection tests

# Open Playwright UI for debugging
npm run test:e2e:ui
```

### Building & Production
```bash
# Build both frontend and backend
npm run build

# Start production server
npm start

# Backend production commands
cd backend
npm run build:prod          # Production TypeScript build
npm run migrate             # Run production migrations
npm run start:staging       # Staging deployment
```

### Database Management
```bash
cd backend

# Run migrations
npm run migrate:dev         # Development migrations
npm run migrate            # Production migrations

# Fix common issues
npm run fix-admin-password  # Reset admin password
npm run fix-admin-panel    # Fix admin panel access
```

### Linting & Security
```bash
cd backend

npm run lint               # ESLint check
npm run lint:security      # Security-focused linting
npm run security:check     # Full security audit
```

## Architecture Overview

### Layered Architecture
```
┌─────────────────────────────────────┐
│     Frontend (React + TypeScript)   │
├─────────────────────────────────────┤
│      API Routes (Express.js)        │
├─────────────────────────────────────┤
│    Business Logic (Services)        │
├─────────────────────────────────────┤
│     Data Layer (PostgreSQL)         │
└─────────────────────────────────────┘
```

### Key Modules

#### Frontend Structure (`frontend/src/`)
- **components/** - React components organized by feature
  - `auth/` - Login, password reset, authentication
  - `customers/` - Customer registration and management
  - `queue/` - Queue management and prioritization
  - `transactions/` - Payment processing and settlements
  - `admin/` - Admin panel for system configuration
  - `display/` - Public display monitor for queue status
  - `analytics/` - Historical reports and analytics

#### Backend Structure (`backend/src/`)
- **routes/** - API endpoint definitions
  - `auth.ts` - Authentication endpoints
  - `customers.ts` - Customer CRUD operations  
  - `queue.ts` - Queue management endpoints
  - `transactions.ts` - Payment and transaction handling
  - `admin.ts` - Admin-only configuration endpoints
- **services/** - Business logic layer
  - `websocket.ts` - Real-time WebSocket handling
  - `DailyQueueScheduler.ts` - Automated daily queue reset
  - `smsService.ts` - SMS notification integration
- **middleware/** - Express middleware
  - `auth.ts` - JWT authentication and RBAC
  - `rateLimiter.ts` - API rate limiting
  - `errorHandler.ts` - Global error handling

### Database Schema
Primary tables:
- **users** - User accounts with role-based access (ADMIN, SALES, CASHIER)
- **customers** - Customer records with prescription details and queue info
- **transactions** - Payment records with multi-payment support
- **queue_status** - Real-time queue state management
- **activity_logs** - Immutable audit trail

### WebSocket Events
Real-time events for queue updates:
- `queue_updated` - Queue status changes
- `customer_called` - Customer called to counter
- `payment_status_updated` - Transaction status changes
- `display_update` - Display monitor refresh

## Role-Based Access Control (RBAC)

### Role Hierarchy
```
SUPER_ADMIN (Level 4) → ADMIN (Level 3) → SALES (Level 2) → CASHIER (Level 1)
```

### Permission Matrix
- **SUPER_ADMIN**: Full system access
- **ADMIN**: User management, system config, all reports
- **SALES**: Customer registration, queue management
- **CASHIER**: Transaction processing, daily reports

## Common Troubleshooting

### Login Issues
1. Ensure both servers running: `npm run dev`
2. Check backend is accessible: http://localhost:5000/health
3. Verify database connection in backend logs
4. Default admin credentials in database setup

### RBAC Permission Errors
```bash
# Debug token permissions
GET /api/debug/token-info
Authorization: Bearer <token>

# Check role hierarchy in backend/src/middleware/auth.ts
```

### WebSocket Connection Issues
1. Check WebSocket URL matches backend (ws://localhost:5000)
2. Verify JWT token in auth headers
3. Monitor Network tab for WebSocket upgrade
4. Check for subscription to correct events

### Database Issues
```sql
-- Fix enum constraints for new queue statuses
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_queue_status_check;
ALTER TABLE customers ADD CONSTRAINT customers_queue_status_check 
  CHECK (queue_status IN ('waiting', 'serving', 'processing', 'completed', 'cancelled'));
```

### Transaction Amount Issues
If transactions show zero amounts in development:
1. Run the balance fix script: `node apply_balance_fix.js`
2. This updates transaction amounts from related customer records

## Deployment

### Blue/Green Deployment Strategy
The system uses blue/green deployment for zero-downtime updates:
1. Apply database migrations (forward-compatible only)
2. Deploy to green environment
3. Run health checks and integration tests
4. Switch traffic from blue to green
5. Keep blue environment for instant rollback

### Environment Variables
Key configurations in `backend/.env`:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` & `JWT_REFRESH_SECRET` - Authentication tokens
- `SMS_PROVIDER` - Choose between twilio, clicksend, vonage
- `NODE_ENV` - Set to 'production' for production deployments

### Railway/Render Deployment
The project includes configuration for:
- Railway: Uses Nixpacks build system (see `nixpacks.toml`)
- Render: Configured via `render.yaml`
- Both support automatic deployments from GitHub

## Security Considerations

### Authentication Flow
1. JWT-based authentication with 15-minute access tokens
2. 7-day refresh tokens for session persistence
3. Argon2 password hashing (bcrypt fallback)
4. Rate limiting on sensitive endpoints

### API Security
- Express Rate Limit for DoS protection
- Input validation on all endpoints
- SQL injection prevention via parameterized queries
- XSS protection through input sanitization
- CORS configured for specific origins

## Testing Strategy

### Backend Testing
- Unit tests with Jest (`backend/src/__tests__/`)
- Integration tests for API endpoints
- Migration backward compatibility tests

### E2E Testing
- Playwright tests in `tests/` directory
- Covers critical user workflows:
  - Customer registration
  - Queue management
  - Transaction processing
  - WebSocket real-time updates

## Performance Optimizations

### Frontend
- React.memo for component optimization
- Lazy loading for routes
- WebSocket connection management with reconnection logic

### Backend
- Database connection pooling
- Indexed queries for queue operations
- Caching for configuration data
- Rate limiting to prevent abuse

## Important Files to Review

When making changes, pay attention to:
- `backend/src/middleware/auth.ts` - RBAC implementation
- `backend/src/services/websocket.ts` - Real-time event handling
- `frontend/src/contexts/AuthContext.tsx` - Frontend authentication
- `backend/src/database/init.sql` - Database schema
- `DEPLOYMENT_GUIDE.md` - Detailed deployment procedures
- `README.md` - Comprehensive project documentation
