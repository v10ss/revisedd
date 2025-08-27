# Manual Render Configuration for SPA Routing Fix

## Problem
The password reset links and other client-side routes return "Not Found" (404) errors in production because Render's static hosting doesn't properly handle single-page application (SPA) routing.

## Root Cause
The issue is that `render.yaml` changes are not being applied automatically, or the service was initially configured differently, causing Render to ignore the YAML configuration.

## Solution: Manual Render Dashboard Configuration

### Step 1: Access Frontend Service Settings
1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Find the `escashop-frontend` service
3. Click on it to open the service details

### Step 2: Check Current Configuration
Look at the current settings and note:
- Environment: Should be `Node` (not `Static Site`)
- Build Command: Should include the React build process
- Start Command: Should be `cd frontend && node server.js`

### Step 3A: If Service is Currently "Static Site"
**This is the most likely scenario.**

1. Click "Settings" tab
2. Scroll down to "Environment"
3. Change from "Static Site" to "Node"
4. Update the following fields:

**Build Command:**
```bash
cd frontend && npm ci && NODE_ENV=production REACT_APP_API_URL=https://escashop-backend.onrender.com/api REACT_APP_BUILD_TIME=2025-08-18-03-19 npm run build
```

**Start Command:**
```bash
cd frontend && node server.js
```

5. Remove any "Publish Directory" setting (this is only for static sites)
6. Click "Save Changes"

### Step 3B: If Service is Already "Node"
1. Verify the Build Command and Start Command match those above
2. If they don't match, update them
3. Click "Save Changes"

### Step 4: Force Rebuild
1. Go to the "Deploys" tab
2. Click "Deploy latest commit" or "Trigger deploy"
3. This will rebuild with the new configuration

### Step 5: Verify Fix
After deployment completes (5-10 minutes), test these URLs:

1. **Main site**: https://escashop-frontend.onrender.com/
   - Should load the React app normally
   
2. **Health endpoint**: https://escashop-frontend.onrender.com/health
   - Should return: `{"status":"ok","timestamp":"..."}`
   
3. **Password reset**: https://escashop-frontend.onrender.com/reset-password/test-token
   - Should load the React app (not "Not Found")
   
4. **Login page**: https://escashop-frontend.onrender.com/login
   - Should load the React app (not "Not Found")

## Alternative: Delete and Recreate Service

If the manual configuration doesn't work:

1. **Delete the frontend service:**
   - Go to Settings → Danger Zone → Delete Service
   - Confirm deletion

2. **Create new service:**
   - Click "New +" → Web Service
   - Connect your GitHub repository
   - Configure as follows:
     - **Name**: `escashop-frontend`
     - **Environment**: Node
     - **Region**: Same as backend (likely Oregon/US West)
     - **Branch**: main
     - **Root Directory**: Leave empty
     - **Build Command**: 
       ```
       cd frontend && npm ci && NODE_ENV=production REACT_APP_API_URL=https://escashop-backend.onrender.com/api REACT_APP_BUILD_TIME=2025-08-18-03-19 npm run build
       ```
     - **Start Command**: 
       ```
       cd frontend && node server.js
       ```
   - Add Environment Variable: `NODE_ENV` = `production`

3. **Deploy and test**

## Technical Details

The Express server (`frontend/server.js`) is configured to:
- Serve static React build files
- Handle all routes by returning `index.html` (SPA routing)
- Provide detailed logging for debugging
- Include a health check endpoint at `/health`

The `_redirects` and `serve.json` files were attempted solutions for static hosting, but they don't work reliably on Render. The Node.js Express server approach is more robust and guaranteed to work.

## Testing Script

You can use this Node.js script to test the deployment:

```bash
node verify-deployment.js
```

This script will test:
- Main site loading
- Health endpoint
- SPA routes (reset-password, login)
- Static asset serving

## Expected Results

After successful configuration:
- ✅ Main site: 200 OK, React HTML
- ✅ Health endpoint: 200 OK, JSON response
- ✅ SPA routes: 200 OK, React HTML (same as main site)
- ✅ Static assets: 200 OK, CSS/JS files

## Troubleshooting

If issues persist:
1. Check Render build logs for errors
2. Check Render runtime logs for Express server startup messages
3. Ensure GitHub repository has the latest commits
4. Try a manual deploy from a specific commit
5. Contact Render support if configuration changes aren't taking effect

The key insight is that Render's `render.yaml` auto-configuration may not work in all cases, especially when a service was initially created with different settings. Manual configuration through the dashboard is more reliable.
