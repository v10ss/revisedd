# ESCASHOP Production Migration - cURL Commands

## Alternative method for executing migration without shell access

### Step 1: Get Your Admin JWT Token

1. **Login to Frontend**: https://escashop-frontend.onrender.com
2. **Open Developer Tools**: Press F12
3. **Go to Storage**: Application tab → Local Storage → escashop-frontend.onrender.com
4. **Copy Token**: Find `accessToken` and copy the value (long string starting with "ey...")

### Step 2: Check Current Status

**Windows Command Prompt/PowerShell:**
```powershell
$token = "YOUR_JWT_TOKEN_HERE"
$headers = @{"Authorization" = "Bearer $token"; "Content-Type" = "application/json"}
Invoke-RestMethod -Uri "https://escashop-backend.onrender.com/api/migration/status" -Method GET -Headers $headers
```

**Or using cURL (if you have it):**
```bash
curl -X GET "https://escashop-backend.onrender.com/api/migration/status" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -H "Content-Type: application/json"
```

### Step 3: Execute Migration

**Windows PowerShell:**
```powershell
$token = "YOUR_JWT_TOKEN_HERE"
$headers = @{"Authorization" = "Bearer $token"; "Content-Type" = "application/json"}
Invoke-RestMethod -Uri "https://escashop-backend.onrender.com/api/migration/fix-transaction-amounts" -Method POST -Headers $headers
```

**Or using cURL:**
```bash
curl -X POST "https://escashop-backend.onrender.com/api/migration/fix-transaction-amounts" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -H "Content-Type: application/json"
```

### Expected Responses

**Status Check Response:**
```json
{
  "success": true,
  "status": {
    "statistics": {
      "total_transactions": 10,
      "zero_amount_transactions": 5,
      "transactions_with_amounts": 5
    },
    "needsMigration": true,
    "sampleTransactions": [...]
  }
}
```

**Migration Response:**
```json
{
  "success": true,
  "message": "Migration completed successfully! Updated 5 transactions.",
  "results": {
    "beforeAnalysis": {
      "total_transactions": "10",
      "zero_amount_transactions": "5"
    },
    "afterAnalysis": {
      "total_transactions": "10",
      "remaining_zero_amounts": "0"
    },
    "updateResults": {
      "rowCount": 5
    }
  }
}
```

### Step 4: Verify Results

1. **Open Frontend**: https://escashop-frontend.onrender.com
2. **Go to Transaction Management**
3. **Check**: Amounts should show ₱2,334.00 instead of ₱0.00

### Troubleshooting

**If you get 401 Unauthorized:**
- Your JWT token expired, get a fresh one by logging in again
- Make sure you're using admin account

**If you get 403 Forbidden:**
- Your account doesn't have admin permissions
- Try with system@escashop.com or admin@escashop.com

**If you get 500 Internal Server Error:**
- Backend service might be sleeping (free plan), try again in 30 seconds
- Database connection issues
