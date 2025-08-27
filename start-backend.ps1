# ESCASHOP Backend Server Startup Script
# This script starts the backend development server

Write-Host "🚀 Starting ESCASHOP Backend Server..." -ForegroundColor Green
Write-Host "📍 Current Directory: $(Get-Location)" -ForegroundColor Yellow
Write-Host "📂 Backend Directory: E:\7-23\New folder\new update escashop\escashop1\escashop01\escashop\backend" -ForegroundColor Yellow

try {
    Set-Location "E:\7-23\New folder\new update escashop\escashop1\escashop01\escashop\backend"
    Write-Host "✅ Changed to backend directory" -ForegroundColor Green
    
    Write-Host "🔧 Starting backend with npm run dev..." -ForegroundColor Blue
    Write-Host "📋 Backend will run on http://localhost:5000" -ForegroundColor Cyan
    Write-Host "🛑 Press Ctrl+C to stop the server" -ForegroundColor Yellow
    Write-Host "===========================================" -ForegroundColor Magenta
    
    npm run dev
    
} catch {
    Write-Host "❌ Error starting backend: $($_.Exception.Message)" -ForegroundColor Red
    Read-Host "Press Enter to exit"
}
