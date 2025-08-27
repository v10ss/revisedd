# ESCASHOP Production Migration via API (Fixed Version)
# This script executes the migration using API endpoints instead of shell access

Write-Host "🚀 ESCASHOP Production Migration via API" -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Magenta
Write-Host "⏰ Starting migration at: $(Get-Date)" -ForegroundColor Yellow

# Configuration
$backendUrl = "https://escashop-backend.onrender.com"
$frontendUrl = "https://escashop-frontend.onrender.com"

# Authentication setup
Write-Host "`n🔐 Authentication Required" -ForegroundColor Yellow
Write-Host "You need to get your admin JWT token from the frontend:"
Write-Host "1. Login to $frontendUrl"
Write-Host "2. Open Developer Tools (F12)"
Write-Host "3. Go to Application > Local Storage"
Write-Host "4. Copy the 'accessToken' value"
Write-Host ""

$token = Read-Host "📝 Paste your admin JWT token here"

if (-not $token) {
    Write-Host "❌ No token provided. Cannot proceed." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "`n🔍 Step 1: Checking current transaction status..." -ForegroundColor Blue

try {
    # Prepare headers
    $headers = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    
    Write-Host "🌐 Connecting to: $backendUrl/api/migration/status" -ForegroundColor Gray
    
    # Check migration status first
    $statusResponse = Invoke-RestMethod -Uri "$backendUrl/api/migration/status" -Method GET -Headers $headers
    
    if ($statusResponse.success) {
        Write-Host "✅ Successfully connected to production API" -ForegroundColor Green
        Write-Host "📊 Transaction Status:" -ForegroundColor Cyan
        Write-Host "   Total transactions: $($statusResponse.status.statistics.total_transactions)" -ForegroundColor White
        Write-Host "   Zero amount transactions: $($statusResponse.status.statistics.zero_amount_transactions)" -ForegroundColor White
        Write-Host "   Transactions with amounts: $($statusResponse.status.statistics.transactions_with_amounts)" -ForegroundColor White
        
        # Check if migration is needed
        if ($statusResponse.status.needsMigration) {
            Write-Host "⚠️  Migration needed!" -ForegroundColor Yellow
            
            # Show sample transactions
            Write-Host "`n📋 Sample transactions:" -ForegroundColor Cyan
            foreach ($tx in $statusResponse.status.sampleTransactions) {
                Write-Host "   ID: $($tx.id), OR: $($tx.or_number), Amount: ₱$($tx.amount), Customer: $($tx.customer_name)" -ForegroundColor White
            }
            
            # Ask for confirmation
            Write-Host "`n🚨 READY TO EXECUTE MIGRATION" -ForegroundColor Red
            Write-Host "This will update transaction amounts in production database." -ForegroundColor Yellow
            $proceed = Read-Host "Proceed with migration? Type 'YES' to confirm"
            
            if ($proceed -eq 'YES') {
                Write-Host "`n🛠️  Step 2: Executing migration..." -ForegroundColor Blue
                Write-Host "🌐 Calling: $backendUrl/api/migration/fix-transaction-amounts" -ForegroundColor Gray
                
                # Execute the migration
                $migrationResponse = Invoke-RestMethod -Uri "$backendUrl/api/migration/fix-transaction-amounts" -Method POST -Headers $headers
                
                if ($migrationResponse.success) {
                    Write-Host "`n✅ MIGRATION COMPLETED SUCCESSFULLY!" -ForegroundColor Green
                    Write-Host "📊 Results:" -ForegroundColor Cyan
                    Write-Host "   Message: $($migrationResponse.message)" -ForegroundColor White
                    
                    if ($migrationResponse.results) {
                        Write-Host "`n📈 Before migration:" -ForegroundColor Yellow
                        Write-Host "   Total transactions: $($migrationResponse.results.beforeAnalysis.total_transactions)"
                        Write-Host "   Zero amounts: $($migrationResponse.results.beforeAnalysis.zero_amount_transactions)"
                        
                        Write-Host "`n📊 After migration:" -ForegroundColor Green
                        Write-Host "   Total transactions: $($migrationResponse.results.afterAnalysis.total_transactions)"
                        Write-Host "   Remaining zero amounts: $($migrationResponse.results.afterAnalysis.remaining_zero_amounts)" -ForegroundColor Green
                        Write-Host "   Updated transactions: $($migrationResponse.results.updateResults.rowCount)" -ForegroundColor Green
                        
                        if ($migrationResponse.results.sampleTransactions) {
                            Write-Host "`n📋 Sample updated transactions:" -ForegroundColor Cyan
                            foreach ($tx in $migrationResponse.results.sampleTransactions) {
                                Write-Host "   OR: $($tx.or_number), Amount: ₱$($tx.amount), Customer: $($tx.customer_name)" -ForegroundColor White
                            }
                        }
                    }
                    
                    Write-Host "`n🎉 MIGRATION SUCCESSFUL!" -ForegroundColor Green
                    Write-Host "✅ Next step: Verify in frontend at $frontendUrl" -ForegroundColor Yellow
                    Write-Host "   Go to Transaction Management page and check amounts." -ForegroundColor White
                    
                } else {
                    Write-Host "❌ Migration failed: $($migrationResponse.error)" -ForegroundColor Red
                    if ($migrationResponse.details) {
                        Write-Host "💡 Details: $($migrationResponse.details)" -ForegroundColor Yellow
                    }
                }
            } else {
                Write-Host "❌ Migration cancelled by user." -ForegroundColor Yellow
                Write-Host "You must type 'YES' exactly to proceed with production changes." -ForegroundColor Gray
            }
        } else {
            Write-Host "✅ No migration needed! All transactions have proper amounts." -ForegroundColor Green
            Write-Host "The production system is working correctly." -ForegroundColor White
        }
        
    } else {
        Write-Host "❌ Failed to check status: $($statusResponse.error)" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ Error during migration: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "`n💡 Troubleshooting tips:" -ForegroundColor Yellow
    Write-Host "   1. Check if your JWT token is valid (not expired)" -ForegroundColor White
    Write-Host "   2. Make sure you're using an admin account" -ForegroundColor White
    Write-Host "   3. Verify backend service is running at $backendUrl" -ForegroundColor White
    Write-Host "   4. If token expired, get a fresh one by logging in again" -ForegroundColor White
    
    if ($_.Exception.Message -like "*401*") {
        Write-Host "`n🔐 401 Unauthorized - Your token is invalid or expired" -ForegroundColor Red
        Write-Host "   Get a fresh token by logging in to $frontendUrl again" -ForegroundColor Yellow
    } elseif ($_.Exception.Message -like "*403*") {
        Write-Host "`n🚫 403 Forbidden - Your account lacks admin permissions" -ForegroundColor Red
        Write-Host "   Try logging in as admin@escashop.com or system@escashop.com" -ForegroundColor Yellow
    } elseif ($_.Exception.Message -like "*500*") {
        Write-Host "`n🔥 500 Server Error - Backend service issue" -ForegroundColor Red
        Write-Host "   The backend may be sleeping (free tier). Wait 30 seconds and try again." -ForegroundColor Yellow
    }
}

Write-Host "`n⏰ Migration process completed at: $(Get-Date)" -ForegroundColor Yellow
Read-Host "Press Enter to exit"
