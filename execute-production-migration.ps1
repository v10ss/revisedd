# ESCASHOP Production Migration via API
# This script executes the migration using API endpoints instead of shell access

Write-Host "🚀 ESCASHOP Production Migration via API" -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Magenta
Write-Host "⏰ Starting migration at: $(Get-Date)" -ForegroundColor Yellow

# Configuration
$backendUrl = "https://escashop-backend.onrender.com"
$frontendUrl = "https://escashop-frontend.onrender.com"

# You'll need to get your admin JWT token for this
Write-Host "`n🔐 Authentication Required" -ForegroundColor Yellow
Write-Host "You need to get your admin JWT token from the frontend"
Write-Host "1. Login to $frontendUrl"
Write-Host "2. Open Developer Tools (F12)"
Write-Host "3. Go to Application/Storage > Local Storage"
Write-Host "4. Copy the 'accessToken' value"
Write-Host ""

$token = Read-Host "📝 Paste your admin JWT token here"

if (-not $token) {
    Write-Host "❌ No token provided. Cannot proceed." -ForegroundColor Red
    exit 1
}

Write-Host "`n🔍 Step 1: Checking current transaction status..." -ForegroundColor Blue

try {
    # Check migration status first
    $headers = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    
    $statusResponse = Invoke-RestMethod -Uri "$backendUrl/api/migration/status" -Method GET -Headers $headers
    
    if ($statusResponse.success) {
        Write-Host "✅ Successfully connected to production API" -ForegroundColor Green
        Write-Host "📊 Transaction Status:" -ForegroundColor Cyan
        Write-Host "   Total transactions: $($statusResponse.status.statistics.total_transactions)" -ForegroundColor White
        Write-Host "   Zero amount transactions: $($statusResponse.status.statistics.zero_amount_transactions)" -ForegroundColor White
        Write-Host "   Transactions with amounts: $($statusResponse.status.statistics.transactions_with_amounts)" -ForegroundColor White
        
        if ($statusResponse.status.needsMigration) {
            Write-Host "⚠️  Migration needed!" -ForegroundColor Yellow
            
            Write-Host "`n📋 Sample transactions:" -ForegroundColor Cyan
            foreach ($tx in $statusResponse.status.sampleTransactions) {
                Write-Host "   ID: $($tx.id), OR: $($tx.or_number), Amount: ₱$($tx.amount), Customer: $($tx.customer_name)" -ForegroundColor White
            }
            
            $proceed = Read-Host "`n🚨 Proceed with migration? (y/N)"
            if ($proceed -eq 'y' -or $proceed -eq 'Y') {
                Write-Host "`n🛠️  Step 2: Executing migration..." -ForegroundColor Blue
                
                $migrationResponse = Invoke-RestMethod -Uri "$backendUrl/api/migration/fix-transaction-amounts" -Method POST -Headers $headers
                
                if ($migrationResponse.success) {
                    Write-Host "✅ Migration completed successfully!" -ForegroundColor Green
                    Write-Host "📊 Results:" -ForegroundColor Cyan
                    Write-Host "   Message: $($migrationResponse.message)" -ForegroundColor White
                    
                    if ($migrationResponse.results) {
                        Write-Host "`n📈 Before migration:" -ForegroundColor Yellow
                        Write-Host "   Total transactions: $($migrationResponse.results.beforeAnalysis.total_transactions)"
                        Write-Host "   Zero amounts: $($migrationResponse.results.beforeAnalysis.zero_amount_transactions)"
                        
                        Write-Host "`n📊 After migration:" -ForegroundColor Green
                        Write-Host "   Total transactions: $($migrationResponse.results.afterAnalysis.total_transactions)"
                        Write-Host "   Remaining zero amounts: $($migrationResponse.results.afterAnalysis.remaining_zero_amounts)"
                        Write-Host "   Updated transactions: $($migrationResponse.results.updateResults.rowCount)"
                        
                        if ($migrationResponse.results.sampleTransactions) {
                            Write-Host "`n📋 Sample updated transactions:" -ForegroundColor Cyan
                            foreach ($tx in $migrationResponse.results.sampleTransactions) {
                                Write-Host "   OR: $($tx.or_number), Amount: ₱$($tx.amount), Customer: $($tx.customer_name)"
                            }
                        }
                    }
                    
                    Write-Host "`n🎉 MIGRATION SUCCESSFUL!" -ForegroundColor Green
                    Write-Host "✅ Next step: Verify in frontend at $frontendUrl" -ForegroundColor Yellow
                    
                } else {
                    Write-Host "❌ Migration failed: $($migrationResponse.error)" -ForegroundColor Red
                    Write-Host "💡 Details: $($migrationResponse.details)" -ForegroundColor Yellow
                }
            } else {
                Write-Host "❌ Migration cancelled by user." -ForegroundColor Yellow
            }
        } else {
            Write-Host "✅ No migration needed! All transactions have proper amounts." -ForegroundColor Green
        }
        
    } else {
        Write-Host "❌ Failed to check status: $($statusResponse.error)" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ Error during migration: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "💡 Make sure:" -ForegroundColor Yellow
    Write-Host "   1. Your JWT token is valid and has admin permissions" -ForegroundColor White
    Write-Host "   2. The backend service is running at $backendUrl" -ForegroundColor White
    Write-Host "   3. The migration API endpoints are deployed" -ForegroundColor White
}

Write-Host "`n⏰ Migration process completed at: $(Get-Date)" -ForegroundColor Yellow
Read-Host "Press Enter to exit"
