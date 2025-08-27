# Run Production Migration Script
# This sets the production database URL and runs the migration

Write-Host "🚀 ESCASHOP Production Migration" -ForegroundColor Green
Write-Host "=================================" -ForegroundColor Magenta

Write-Host ""
Write-Host "Setting production database URL..." -ForegroundColor Yellow

# Set environment variable for production database
$env:DATABASE_URL = "postgresql://escashop_user:n46Ur5rLzy4DmDClFHK1DAfHOiYWJJWv@dpg-d2ap2jruibrs73esqptg-a.oregon-postgres.render.com/escashop"

Write-Host "Database URL set. Running migration script..." -ForegroundColor Blue

try {
    # Change to backend directory and run migration
    Set-Location "E:\7-23\New folder\new update escashop\escashop1\escashop01\escashop\backend"
    
    Write-Host "Running: node scripts/migrate-transaction-amounts.js" -ForegroundColor Gray
    node scripts/migrate-transaction-amounts.js
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "🎉 Migration completed successfully!" -ForegroundColor Green
        Write-Host "✅ Next step: Verify in frontend at https://escashop-frontend.onrender.com" -ForegroundColor Yellow
        Write-Host "   Go to Transaction Management page and check amounts." -ForegroundColor White
    } else {
        Write-Host ""
        Write-Host "❌ Migration script returned error code: $LASTEXITCODE" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ Error running migration: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Read-Host "Press Enter to exit"
