@echo off
setlocal EnableDelayedExpansion

REM Deploy Transaction Amount Fix - Windows Version
REM This script deploys the transaction amount fix and runs the migration

echo 🚀 Starting Transaction Amount Fix Deployment...

REM Set up environment variables if not already set
if "%NODE_ENV%"=="" set NODE_ENV=production
if "%DB_HOST%"=="" set DB_HOST=localhost
if "%DB_PORT%"=="" set DB_PORT=5432
if "%DB_NAME%"=="" set DB_NAME=escashop
if "%DB_USER%"=="" set DB_USER=postgres

echo 📝 Environment: %NODE_ENV%
echo 🗄️  Database: %DB_HOST%:%DB_PORT%/%DB_NAME%

REM Navigate to backend directory
cd backend

echo 📦 Installing dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo ❌ Failed to install dependencies
    exit /b 1
)

echo 🔧 Building TypeScript...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo ❌ Failed to build TypeScript
    exit /b 1
)

echo ⚠️  Stopping current backend service...
REM Kill any existing Node.js process on port 3001
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo 🔍 Running transaction amount migration...
node scripts/migrate-transaction-amounts.js
if %ERRORLEVEL% neq 0 (
    echo ❌ Migration failed
    exit /b 1
)

echo ✅ Migration completed successfully

echo 🚀 Starting backend service...
REM Start the backend service
start /b npm start

echo ⏱️  Waiting for backend to start...
timeout /t 10 /nobreak >nul

echo 🔍 Testing transaction API...
REM Test the transaction API endpoint using curl or powershell
powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:3001/api/transactions' -Method GET -Headers @{'Content-Type'='application/json'} -UseBasicParsing -TimeoutSec 5; $response.StatusCode } catch { $_.Exception.Response.StatusCode.value__ }" > api_test_result.tmp 2>nul

set /p API_RESPONSE=<api_test_result.tmp
del api_test_result.tmp 2>nul

if "%API_RESPONSE%"=="200" (
    echo ✅ Transaction API is responding correctly HTTP %API_RESPONSE%
) else if "%API_RESPONSE%"=="401" (
    echo ✅ Transaction API is responding HTTP %API_RESPONSE% - Authentication required as expected
) else (
    echo ⚠️  Transaction API response: HTTP %API_RESPONSE%
)

echo.
echo 📋 Deployment Summary:
echo    - Transaction amount fix applied
echo    - Migration completed
echo    - Backend service restarted
echo    - API endpoint tested
echo.
echo 🎉 Deployment completed!
echo.
echo 📋 Next Steps:
echo    1. Test the Transaction Management page in the frontend
echo    2. Verify that amounts are now displaying correctly
echo    3. Check that new transactions have proper amounts
echo    4. Monitor logs for any issues
echo.
echo 🔍 To check if backend is running:
echo    netstat -an ^| findstr :3001
echo.
echo 🛑 To stop backend:
echo    tasklist ^| findstr node.exe
echo    taskkill /f /im node.exe

pause
echo Press any key to continue...
