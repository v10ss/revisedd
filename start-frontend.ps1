# ESCASHOP Frontend Server Startup Script
# This script starts the frontend development server

Write-Host "🌐 Starting ESCASHOP Frontend Server..." -ForegroundColor Green
Write-Host "📍 Current Directory: $(Get-Location)" -ForegroundColor Yellow
Write-Host "📂 Frontend Directory: E:\7-23\New folder\new update escashop\escashop1\escashop01\escashop\frontend" -ForegroundColor Yellow

try {
    Set-Location "E:\7-23\New folder\new update escashop\escashop1\escashop01\escashop\frontend"
    Write-Host "✅ Changed to frontend directory" -ForegroundColor Green
    
    Write-Host "🔧 Starting frontend with npm run dev..." -ForegroundColor Blue
    Write-Host "📋 Frontend will run on http://localhost:3000" -ForegroundColor Cyan
    Write-Host "🔗 Backend API: http://localhost:5000/api" -ForegroundColor Cyan
    Write-Host "🛑 Press Ctrl+C to stop the server" -ForegroundColor Yellow
    Write-Host "===========================================" -ForegroundColor Magenta
    
    npm run dev
    
} catch {
    Write-Host "❌ Error starting frontend: $($_.Exception.Message)" -ForegroundColor Red
    Read-Host "Press Enter to exit"
}
