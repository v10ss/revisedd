# EscaShop Deployment Guide for Render.com

This guide will help you deploy your EscaShop full-stack application to Render.com using GitHub integration.

## Prerequisites

1. **GitHub Account**: Make sure your code is pushed to a GitHub repository
2. **Render Account**: Sign up for a free account at [render.com](https://render.com)
3. **Code Preparation**: Your code should be ready with the provided `render.yaml` configuration

## Step-by-Step Deployment Process

### Step 1: Push Your Code to GitHub

1. If you haven't already, initialize Git in your project:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. Create a new repository on GitHub and push your code:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/escashop.git
   git branch -M main
   git push -u origin main
   ```

### Step 2: Connect Render to GitHub

1. Go to [render.com](https://render.com) and sign up/login
2. Click "New +" → "Blueprint" 
3. Connect your GitHub account if not already connected
4. Select your `escashop` repository
5. Render will automatically detect the `render.yaml` file

### Step 3: Configure the Blueprint

1. **Repository**: Select your GitHub repository
2. **Branch**: Choose `main` (or your default branch)
3. **Blueprint Name**: Enter "EscaShop"
4. Click "Apply"

### Step 4: Review and Deploy Services

Render will create three services based on your `render.yaml`:

1. **escashop-database** (PostgreSQL Database)
   - Plan: Free
   - Database: escashop
   - User: escashop_user

2. **escashop-backend** (Web Service)
   - Plan: Free
   - Runtime: Node.js
   - Build Command: `cd backend && npm ci && npm run build`
   - Start Command: `cd backend && npm start`

3. **escashop-frontend** (Static Site)
   - Plan: Free
   - Build Command: `cd frontend && npm ci && npm run build`
   - Publish Directory: `frontend/build`

### Step 5: Monitor Deployment

1. Watch the deployment logs in the Render dashboard
2. The database will be created first
3. Backend will deploy next (this may take 5-10 minutes)
4. Frontend will deploy last

### Step 6: Update Service URLs (if needed)

Once deployed, you'll get URLs like:
- Backend: `https://escashop-backend.onrender.com`
- Frontend: `https://escashop-frontend.onrender.com`

If the URLs differ from what's in the `render.yaml`, update:
1. Frontend environment variable `REACT_APP_API_URL`
2. Backend environment variable `FRONTEND_URL`

### Step 7: Test Your Application

1. Visit your frontend URL
2. Test login/registration functionality
3. Check database connectivity
4. Verify WebSocket connections work

## Environment Variables

The following environment variables are automatically configured:

### Backend
- `NODE_ENV`: production
- `PORT`: 10000
- `DATABASE_URL`: (auto-generated from database)
- `JWT_SECRET`: (auto-generated)
- `JWT_REFRESH_SECRET`: (auto-generated)
- `FRONTEND_URL`: https://escashop-frontend.onrender.com
- `SMS_PROVIDER`: vonage
- `VONAGE_API_KEY`: (your key)
- `VONAGE_API_SECRET`: (your secret)
- `EMAIL_SERVICE`: gmail
- `EMAIL_USER`: (your email)
- `EMAIL_PASSWORD`: (your password)

### Frontend
- `REACT_APP_API_URL`: https://escashop-backend.onrender.com

## Troubleshooting

### Common Issues

1. **Build Failures**
   - Check the build logs in Render dashboard
   - Ensure all dependencies are in `package.json`
   - Verify TypeScript compilation works locally

2. **Database Connection Issues**
   - Check if database service is running
   - Verify `DATABASE_URL` environment variable
   - Check migration logs

3. **CORS Issues**
   - Ensure backend `FRONTEND_URL` matches your actual frontend URL
   - Check CORS configuration in `src/index.ts`

4. **WebSocket Connection Issues**
   - Verify WebSocket configuration allows your frontend URL
   - Check if HTTPS is enforced properly

### Updating Your App

1. Push changes to your GitHub repository
2. Render will automatically redeploy on push to main branch
3. Monitor deployment logs for any issues

## Free Tier Limitations

Render's free tier includes:
- **Web Services**: Sleep after 15 minutes of inactivity
- **Database**: 1GB storage, 1 month retention
- **Build Time**: 500 build hours/month

For production use, consider upgrading to paid plans for:
- Always-on services
- More database storage
- Better performance
- SSL certificates

## Support

If you encounter issues:
1. Check Render's [documentation](https://render.com/docs)
2. Review deployment logs in Render dashboard
3. Check this project's GitHub issues
4. Contact Render support for platform-specific issues

## Next Steps

After successful deployment:
1. Set up custom domain (optional)
2. Configure SSL certificates
3. Set up monitoring and logging
4. Consider upgrading to paid plans for production

---

Your EscaShop application should now be successfully deployed on Render! 🎉
