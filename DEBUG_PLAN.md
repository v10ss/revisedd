# EscaShop 404 Error Debug Plan

## Issues Identified

Based on the browser console screenshots, the following API endpoints are returning 404 errors:

1. `/api/customers/dropdown/grade-types` - 404 (Not Found)
2. `/api/customers/dropdown/lens-types` - 404 (Not Found)  
3. `/api/customers?page=1&limit=10&sortBy=...` - 404 (Not Found)
4. `/api/queue/all-statuses` - 404 (Not Found)
5. `/api/queue/counters/display` - 404 (Not Found)
6. `/api/queue/display-all` - 404 (Not Found)
7. `/api/transactions?page=1&limit=10` - 404 (Not Found)

## Root Cause Analysis

### Primary Issues Fixed:
1. ✅ **Missing Export Routes**: The `index.ts` file was missing the import and registration of export routes
2. ✅ **Wrong Password Hash**: Admin user was created with bcrypt hash but app uses Argon2

### Potential Remaining Issues:
1. **Database Connection**: Database might not be connected or initialized properly
2. **Authentication Token**: JWT tokens might be invalid or expired
3. **Route Registration Order**: Some routes might not be properly registered
4. **Database Schema**: Required tables (grade_types, lens_types, etc.) might be missing
5. **Environment Variables**: Database URL or other config might be incorrect

## Debugging Steps

### Step 1: Check Backend Deployment Status
- Verify backend service is running on Render
- Check backend logs for startup errors
- Ensure database connection is successful

### Step 2: Fix Admin Authentication
```bash
# Run this command on the Render backend console:
npm run fix-admin-password
```

### Step 3: Verify Database Schema
Check if these essential tables exist:
- `users` (should contain admin user)
- `customers` 
- `grade_types` (required for dropdown)
- `lens_types` (required for dropdown)
- `counters` (required for queue management)
- `transactions`

### Step 4: Test API Endpoints Manually
Test these endpoints directly:
- GET `/health` (should return 200 OK)
- POST `/api/auth/login` with admin credentials
- GET `/api/customers/dropdown/grade-types` (with auth header)

### Step 5: Frontend Configuration
- Verify frontend environment variables are correct
- Check if API base URL includes proper `/api` prefix
- Ensure authentication tokens are being sent with requests

## Current Status

### ✅ Fixed Issues:
1. Added missing export routes to backend `index.ts`
2. Updated admin password to use correct Argon2 hash
3. Created production password fix script

### 🔄 Next Steps:
1. Monitor Render deployment to see if backend starts successfully
2. Run password fix script on production database
3. Test login functionality
4. Verify that all API endpoints are accessible after authentication

### 🧪 Testing Plan:
1. Test admin login with `admin@escashop.com` / `admin123`
2. Test customer management endpoints
3. Test queue management endpoints  
4. Test transaction management endpoints
5. Verify dropdown data is loading (grade-types, lens-types)

## Expected Resolution

After these fixes:
1. Backend should start successfully with all routes registered
2. Admin user should be able to login
3. All frontend sections should load data properly
4. 404 errors should be resolved

If issues persist, we may need to investigate:
- Database connection configuration
- Network connectivity between frontend and backend
- CORS configuration
- Route middleware authentication logic
