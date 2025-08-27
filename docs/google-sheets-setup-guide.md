# Google Sheets Integration Setup Guide

## Issue: "Google Sheets integration not configured"

This error occurs because the `GOOGLE_SHEETS_URL` environment variable is not configured on your Render deployment.

## Step-by-Step Fix

### 1. Set up Google Apps Script

1. **Go to Google Apps Script**: https://script.google.com/
2. **Create a New Project**
3. **Replace the default code** with the contents of `google-apps-script/customer-export.gs` from this repository
4. **Update the Spreadsheet ID** in the script:
   ```javascript
   const SPREADSHEET_ID = 'your-actual-spreadsheet-id-here';
   ```
   - You can find your spreadsheet ID in the URL: `https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit`

5. **Deploy the Script**:
   - Click "Deploy" → "New Deployment"
   - Type: "Web app"
   - Description: "EscaShop Customer Export API"
   - Execute as: "Me (your@email.com)"
   - Who has access: "Anyone" (or "Anyone with Google account" for more security)
   - Click "Deploy"

6. **Copy the Deployment URL**: You'll get a URL that looks like:
   ```
   https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
   ```

### 2. Configure Render Environment Variable

1. **Go to your Render Dashboard**: https://dashboard.render.com/
2. **Open your backend service**
3. **Go to Environment tab**
4. **Add a new Environment Variable**:
   - **Key**: `GOOGLE_SHEETS_URL`
   - **Value**: The deployment URL you copied from Google Apps Script
   - Example: `https://script.google.com/macros/s/AKfycbzXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/exec`

5. **Save and Deploy** the service

### 3. Test the Integration

1. **Deploy your backend** (it should automatically redeploy when you save the environment variable)
2. **Test the export** from your frontend
3. **Check the logs** if there are still issues

## Common Issues and Solutions

### Issue: "Invalid Google Sheets URL format"
- **Solution**: Make sure the URL contains `script.google.com` and ends with `/exec`

### Issue: "Failed to access Google Sheets"
- **Solution**: 
  - Make sure the Google Apps Script has proper permissions
  - Check that the spreadsheet ID is correct
  - Ensure the script is deployed with "Anyone" access

### Issue: "Network timeout"
- **Solution**: 
  - Google Apps Script might be slow on first run
  - Try the export again after a few minutes
  - Check Google Apps Script execution logs

## Environment Variable Format

The correct format for the `GOOGLE_SHEETS_URL` environment variable:

```
https://script.google.com/macros/s/[DEPLOYMENT_ID]/exec
```

**Do NOT use**:
- The script.google.com/home URLs
- The edit URLs from the script editor
- URLs without `/exec` at the end

## Testing Your Setup

You can test if your Google Apps Script is working by making a GET request to the URL:

```bash
curl https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

You should get a response like:
```json
{
  "success": true,
  "message": "EscaShop Customer Export API is running",
  "version": "1.0",
  "endpoints": ["POST for customer exports"],
  "supportedActions": ["single", "bulk"]
}
```

## Required Permissions

Make sure your Google Apps Script has access to:
- Google Sheets API
- Your target spreadsheet (either owned by you or shared with edit permissions)

The script will automatically create a "Customers" sheet if it doesn't exist.
