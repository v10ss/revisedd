# EscaShop Email Service Setup Instructions

## Problem
Password reset emails are not being sent because the email service is not properly configured in production.

## Root Causes
1. `EMAIL_SERVICE_ENABLED` is set to `false` or not set
2. Gmail App Password is not configured
3. Production environment variables are missing

## Solution Steps

### Step 1: Generate Gmail App Password

1. **Enable 2-Factor Authentication** on the Gmail account (`jefor16@gmail.com`):
   - Go to [Google Account Security](https://myaccount.google.com/security)
   - Enable "2-Step Verification" if not already enabled

2. **Generate App Password**:
   - Go to [Google Account Security](https://myaccount.google.com/security) 
   - Click "2-Step Verification"
   - Scroll down to "App passwords"
   - Click "App passwords"
   - Select "Mail" and "Other (Custom name)"
   - Enter "EscaShop Optical" as the app name
   - Click "Generate"
   - **Copy the 16-character App Password** (format: `xxxx xxxx xxxx xxxx`)

### Step 2: Configure Render Environment Variables

In your Render dashboard for the backend service:

1. Go to **Environment** section
2. Add/Update these variables:

```
EMAIL_SERVICE_ENABLED=true
EMAIL_USER=jefor16@gmail.com
EMAIL_FROM=jefor16@gmail.com
EMAIL_PASSWORD=[YOUR-16-DIGIT-APP-PASSWORD]
FRONTEND_URL=https://escashop-frontend.onrender.com
```

**Important**: 
- Use the App Password from Step 1 (remove spaces: `xxxxxxxxxxxxxxxx`)
- Do NOT use your regular Gmail password
- Update `FRONTEND_URL` to match your actual frontend domain

### Step 3: Test Email Configuration

1. **Run diagnostic script** (after deploying):
   ```bash
   npm run diagnose-email
   ```

2. **Test with actual email**:
   ```bash
   node diagnose-email-config.js your-test-email@gmail.com
   ```

3. **Test password reset** in the Admin Panel:
   - Go to User Management
   - Click reset password for a user
   - Check if email is received

### Step 4: Verify Email Content

The password reset email should contain:
- Subject: "Password Reset Request - EscaShop Optical"
- Reset link pointing to: `https://your-frontend-domain.com/reset-password/[token]`
- Professional HTML formatting

## Troubleshooting

### Issue: "Invalid login" Error
- **Cause**: Using regular Gmail password instead of App Password
- **Fix**: Generate and use Gmail App Password

### Issue: Email Service Disabled
- **Cause**: `EMAIL_SERVICE_ENABLED` not set to `true`
- **Fix**: Set `EMAIL_SERVICE_ENABLED=true` in Render environment

### Issue: Reset Link Not Working  
- **Cause**: Incorrect `FRONTEND_URL` configuration
- **Fix**: Update `FRONTEND_URL` to match your actual frontend domain

### Issue: Emails Go to Spam
- **Cause**: Gmail sender reputation
- **Fix**: 
  - Ask recipients to check spam folder
  - Consider using a custom domain email
  - Implement SPF/DKIM records (advanced)

## Security Notes

1. **App Passwords are safer** than regular passwords for applications
2. **Store securely**: Never commit App Password to git
3. **Rotate regularly**: Generate new App Password periodically
4. **Revoke if compromised**: Can revoke App Password without changing main password

## Production Deployment

After configuring environment variables in Render:
1. The backend will automatically redeploy
2. Email service will be enabled
3. Test password reset functionality
4. Monitor logs for any email sending errors

## Environment Variables Reference

| Variable | Value | Description |
|----------|-------|-------------|
| `EMAIL_SERVICE_ENABLED` | `true` | Enables actual email sending |
| `EMAIL_USER` | `jefor16@gmail.com` | Gmail username |
| `EMAIL_PASSWORD` | `[APP-PASSWORD]` | Gmail App Password (16 chars) |
| `EMAIL_FROM` | `jefor16@gmail.com` | From address in emails |
| `FRONTEND_URL` | `https://your-domain.com` | Frontend URL for reset links |

## Testing Checklist

- [ ] Gmail 2FA enabled
- [ ] App Password generated and saved
- [ ] Render environment variables set
- [ ] Backend redeployed successfully
- [ ] Email diagnostic script passes
- [ ] Test email sent and received
- [ ] Password reset email received
- [ ] Reset link works correctly

## Alternative Email Providers

If Gmail doesn't work reliably, consider:

1. **SendGrid** (recommended for production)
2. **AWS SES** 
3. **Mailgun**
4. **Postmark**

These services are more reliable for transactional emails and provide better delivery rates.
