# Quick Fix: Add Google Sheets URL to Render

## The Issue
Your Google Sheets export works locally (`npm run dev`) because you have `GOOGLE_SHEETS_URL` configured in `backend/.env`, but it fails in production because Render doesn't have this environment variable.

## Your Current URLs

### Local Development (working):
```
https://script.google.com/macros/s/AKfycbxsprrzPNwmmtqv_upUPX-AW1la7Au-vtrA1dQN0kpl8sP8ZgmAJivArszcbhm5TjtNfg/exec
```

### Railway (configured but not used):
```
https://script.google.com/macros/s/AKfycbxK6QzgW_7lZbNYknNyXVe4ogZvdByyqaHwfpoX4txyeTXVVVmz498xxGBtuDCG_2xAi/exec
```

## Solution: Add to Render

1. **Go to your Render Dashboard**: https://dashboard.render.com/
2. **Select your backend service** (escashop-backend)
3. **Go to Environment tab**
4. **Add new environment variable**:
   - **Key**: `GOOGLE_SHEETS_URL`
   - **Value**: `https://script.google.com/macros/s/AKfycbxsprrzPNwmmtqv_upUPX-AW1la7Au-vtrA1dQN0kpl8sP8ZgmAJivArszcbhm5TjtNfg/exec`
5. **Click "Save Changes"**
6. **Wait for automatic redeploy**

## Testing

After the redeploy completes:
1. Try the Google Sheets export from your frontend
2. Check the logs if there are any issues
3. The export should work just like it does locally

## Alternative URL

If the local development URL doesn't work in production, try the Railway URL:
```
https://script.google.com/macros/s/AKfycbxK6QzgW_7lZbNYknNyXVe4ogZvdByyqaHwfpoX4txyeTXVVmz498xxGBtuDCG_2xAi/exec
```

## Verify Environment Variable

You can verify the environment variable is set by checking your Render service logs. The backend will log the Google Sheets URL when attempting exports.
