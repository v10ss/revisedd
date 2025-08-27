# ESCASHOP Production Migration - Simple Version

Write-Host "ESCASHOP Production Migration via API" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Magenta

$backendUrl = "https://escashop-backend.onrender.com"
$frontendUrl = "https://escashop-frontend.onrender.com"

Write-Host ""
Write-Host "Authentication Required:" -ForegroundColor Yellow
Write-Host "1. Login to $frontendUrl"
Write-Host "2. Press F12 > Application > Local Storage"
Write-Host "3. Copy the accessToken value"
Write-Host ""

$token = Read-Host "Paste your admin JWT token here"

if (-not $token) {
    Write-Host "No token provided. Exiting." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "Checking current transaction status..." -ForegroundColor Blue

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

try {
    # Check status
    Write-Host "Connecting to API..." -ForegroundColor Gray
    $statusResponse = Invoke-RestMethod -Uri "$backendUrl/api/migration/status" -Method GET -Headers $headers
    
    if ($statusResponse.success) {
        Write-Host "Successfully connected to production API" -ForegroundColor Green
        Write-Host "Transaction Status:" -ForegroundColor Cyan
        Write-Host "  Total transactions: $($statusResponse.status.statistics.total_transactions)"
        Write-Host "  Zero amount transactions: $($statusResponse.status.statistics.zero_amount_transactions)"
        Write-Host "  Transactions with amounts: $($statusResponse.status.statistics.transactions_with_amounts)"
        
        if ($statusResponse.status.needsMigration) {
            Write-Host ""
            Write-Host "Migration needed!" -ForegroundColor Yellow
            
            Write-Host ""
            Write-Host "Sample transactions:" -ForegroundColor Cyan
            foreach ($tx in $statusResponse.status.sampleTransactions) {
                Write-Host "  ID: $($tx.id), OR: $($tx.or_number), Amount: $($tx.amount), Customer: $($tx.customer_name)"
            }
            
            Write-Host ""
            Write-Host "READY TO EXECUTE MIGRATION" -ForegroundColor Red
            Write-Host "This will update transaction amounts in production database." -ForegroundColor Yellow
            $proceed = Read-Host "Proceed with migration? Type YES to confirm"
            
            if ($proceed -eq 'YES') {
                Write-Host ""
                Write-Host "Executing migration..." -ForegroundColor Blue
                
                $migrationResponse = Invoke-RestMethod -Uri "$backendUrl/api/migration/fix-transaction-amounts" -Method POST -Headers $headers
                
                if ($migrationResponse.success) {
                    Write-Host ""
                    Write-Host "MIGRATION COMPLETED SUCCESSFULLY!" -ForegroundColor Green
                    Write-Host "Message: $($migrationResponse.message)"
                    
                    if ($migrationResponse.results) {
                        Write-Host ""
                        Write-Host "Before migration:" -ForegroundColor Yellow
                        Write-Host "  Total transactions: $($migrationResponse.results.beforeAnalysis.total_transactions)"
                        Write-Host "  Zero amounts: $($migrationResponse.results.beforeAnalysis.zero_amount_transactions)"
                        
                        Write-Host ""
                        Write-Host "After migration:" -ForegroundColor Green
                        Write-Host "  Total transactions: $($migrationResponse.results.afterAnalysis.total_transactions)"
                        Write-Host "  Remaining zero amounts: $($migrationResponse.results.afterAnalysis.remaining_zero_amounts)"
                        Write-Host "  Updated transactions: $($migrationResponse.results.updateResults.rowCount)"
                        
                        if ($migrationResponse.results.sampleTransactions) {
                            Write-Host ""
                            Write-Host "Sample updated transactions:" -ForegroundColor Cyan
                            foreach ($tx in $migrationResponse.results.sampleTransactions) {
                                Write-Host "  OR: $($tx.or_number), Amount: $($tx.amount), Customer: $($tx.customer_name)"
                            }
                        }
                    }
                    
                    Write-Host ""
                    Write-Host "MIGRATION SUCCESSFUL!" -ForegroundColor Green
                    Write-Host "Next step: Verify in frontend at $frontendUrl" -ForegroundColor Yellow
                    Write-Host "Go to Transaction Management page and check amounts."
                    
                } else {
                    Write-Host "Migration failed: $($migrationResponse.error)" -ForegroundColor Red
                    if ($migrationResponse.details) {
                        Write-Host "Details: $($migrationResponse.details)" -ForegroundColor Yellow
                    }
                }
            } else {
                Write-Host "Migration cancelled by user." -ForegroundColor Yellow
                Write-Host "You must type YES exactly to proceed."
            }
        } else {
            Write-Host "No migration needed! All transactions have proper amounts." -ForegroundColor Green
        }
        
    } else {
        Write-Host "Failed to check status: $($statusResponse.error)" -ForegroundColor Red
    }
    
} catch {
    Write-Host "Error during migration: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Check if your JWT token is valid"
    Write-Host "2. Make sure you are using an admin account"
    Write-Host "3. Try getting a fresh token by logging in again"
    
    if ($_.Exception.Message -like "*401*") {
        Write-Host ""
        Write-Host "401 Unauthorized - Your token is invalid or expired" -ForegroundColor Red
    } elseif ($_.Exception.Message -like "*403*") {
        Write-Host ""
        Write-Host "403 Forbidden - Your account lacks admin permissions" -ForegroundColor Red
    } elseif ($_.Exception.Message -like "*500*") {
        Write-Host ""
        Write-Host "500 Server Error - Backend service may be sleeping" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Migration process completed at: $(Get-Date)" -ForegroundColor Yellow
Read-Host "Press Enter to exit"
