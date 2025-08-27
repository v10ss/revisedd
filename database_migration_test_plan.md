# Database Migration Test Plan for EscaShop

## Overview
This test plan ensures that all database migrations work correctly and won't cause issues during deployment. We'll test both the improved migration system and the fallback system.

## Prerequisites
- PostgreSQL 17 is running (✓ Confirmed)
- Node.js and npm are available
- Backend dependencies are installed

## Test Scenarios

### 1. Fresh Database Migration Test
**Objective**: Test migrations on a completely fresh database
**Steps**:
1. Create a test database
2. Run the improved migration system
3. Verify all tables and data are created correctly
4. Check the `applied_migrations` table for tracking

### 2. Existing Database Migration Test
**Objective**: Test migrations on a database that may already have some tables
**Steps**:
1. Use existing development database
2. Run migrations to see what gets skipped vs applied
3. Verify no data is lost or corrupted

### 3. Migration Rollback and Recovery Test
**Objective**: Test system recovery from failed migrations
**Steps**:
1. Intentionally cause a migration to fail
2. Verify the system handles the error gracefully
3. Test manual recovery process

### 4. Production Deployment Simulation
**Objective**: Simulate production deployment migration process
**Steps**:
1. Build the project
2. Run production migration command
3. Verify application starts successfully after migration

## Migration Files to Test

### SQL Migrations in `backend/src/database/migrations/`:
- `001_add_unique_settlement_index.sql`
- `activity-logs-table.sql`
- `add-funds-column.sql`
- `add_payment_features.sql`
- `add_processing_duration_analytics.sql`
- `create-cashier-notifications.sql`
- `create_daily_queue_history_tables.sql`
- `create_daily_queue_history_views.sql`
- `daily-reports-table.sql`
- `payment_tracking_migration.sql` (Special handling required)
- `queue-status-backward-compatibility.sql`
- `transactions-table.sql`
- `V2025_07_Processing_Status.sql`

### TypeScript Migrations:
- `system_settings.ts`

### Other SQL Files:
- `backend/database/migrations/009_create_customer_notifications.sql`
- `backend/src/database/complete-migration.sql`
- `backend/src/database/migrate-estimated-time.sql`

## Test Commands

1. **Build the backend**:
   ```bash
   cd backend
   npm run build
   ```

2. **Test development migration**:
   ```bash
   npm run migrate:dev
   ```

3. **Test production migration**:
   ```bash
   npm run migrate
   ```

4. **Test application startup**:
   ```bash
   npm start
   ```

## Expected Results

### Success Indicators:
- All migration files execute without errors
- `applied_migrations` table is created and populated
- No duplicate migrations are run
- Application starts successfully after migration
- All expected tables and columns exist
- Data integrity is maintained

### Warning Signs:
- "column already exists" errors (should be handled gracefully)
- Migration files that get skipped unexpectedly
- Database connection timeouts
- Missing tables or columns after migration

## Test Results Summary

### ✅ Successful Tests:
1. **Build System**: Backend compiles successfully with TypeScript
2. **Basic Migration**: Consolidated migrations run successfully
3. **Migration Tracking**: `applied_migrations` table created and populated correctly
4. **Database Schema**: All main tables exist (customers, counters, transactions, system_settings)
5. **Column Verification**: `daily_queue_history` table has `completed_customers` column
6. **Individual SQL**: Views and functions work when executed individually
7. **Error Handling**: Migration system properly tracks and skips applied migrations

### ⚠️  Issues Identified:
1. **View Dependencies**: `create_daily_queue_history_views.sql` fails due to dependency ordering
   - `monthly_queue_trends` view references `daily_queue_summary_view` before it's created
   - SQL parsing improved to handle dollar-quoted strings in functions
   - Issue occurs in multi-statement migration execution

### 🔧 Fixes Applied:
1. **TypeScript Build**: Fixed array type inference issues in export services
2. **SQL Parsing**: Added proper dollar-quoted string handling for PostgreSQL functions
3. **Migration Tracking**: Improved duplicate migration detection
4. **Error Reporting**: Enhanced error messages with statement context

### 📋 Recommendations for Production:
1. **Split Complex Migrations**: Break `create_daily_queue_history_views.sql` into separate files:
   - `001_create_daily_queue_views.sql` (views only)
   - `002_create_daily_queue_functions.sql` (functions only)
2. **Dependency Management**: Ensure migration files are numbered in dependency order
3. **Testing**: Run migration tests on staging environment before production
4. **Rollback Plan**: Create rollback migrations for complex schema changes

## Backup Strategy
Before running tests, create a database backup:
```sql
pg_dump -h localhost -U postgres escashop > backup_before_migration_test.sql
```

## Recovery Strategy
If tests fail:
```sql
-- Drop the test database
DROP DATABASE escashop;
-- Recreate it
CREATE DATABASE escashop;
-- Restore from backup
psql -h localhost -U postgres escashop < backup_before_migration_test.sql
```
