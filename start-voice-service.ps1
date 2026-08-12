# ============================================
# Quick Start Script for Halla AI Voice Service
# hallaai.com | GCC / Middle East
# ============================================
# Run this in PowerShell to start the Gateway service

Write-Host "🚀 Starting Halla AI Voice Service..." -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "apps/gateway")) {
    Write-Host "❌ Error: Must run from project root directory" -ForegroundColor Red
    Write-Host "Current directory: $(Get-Location)" -ForegroundColor Yellow
    exit 1
}

# Check if .env exists
if (-not (Test-Path "apps/gateway/.env")) {
    Write-Host "❌ Error: apps/gateway/.env not found" -ForegroundColor Red
    Write-Host "Please create it from .env.example" -ForegroundColor Yellow
    exit 1
}

# Check Node.js
Write-Host "✓ Checking Node.js..." -ForegroundColor Green
try {
    $nodeVersion = node --version
    Write-Host "  Node.js version: $nodeVersion" -ForegroundColor Gray
} catch {
    Write-Host "❌ Node.js not found. Please install Node.js 18+" -ForegroundColor Red
    exit 1
}

# Navigate to gateway
Set-Location apps/gateway

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    npm install
}

Write-Host ""
Write-Host "✅ Starting Gateway on port 3003..." -ForegroundColor Green
Write-Host ""
Write-Host "📝 Next steps:" -ForegroundColor Cyan
Write-Host "  1. Open another terminal and run: ngrok http 3003" -ForegroundColor White
Write-Host "  2. Copy the ngrok HTTPS URL" -ForegroundColor White
Write-Host "  3. Update TWILIO_STREAM_WSS_URL in apps/gateway/.env" -ForegroundColor White
Write-Host "  4. Restart this script" -ForegroundColor White
Write-Host "  5. Configure Twilio webhook to: https://your-ngrok-url/api/v1/voice/incoming-call" -ForegroundColor White
Write-Host ""
Write-Host "  💡 Halla AI tip: Your Twilio number should be a GCC number (+971, +966, +974, etc.)" -ForegroundColor Yellow
Write-Host ""

# Start the gateway
npm run dev
