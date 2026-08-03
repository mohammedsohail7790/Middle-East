# ============================================
# Verification Script for Voice Service Setup
# ============================================

Write-Host "🔍 Verifying Call IQ Voice Service Setup..." -ForegroundColor Cyan
Write-Host ""

$allGood = $true

# Check 1: Gateway .env exists
Write-Host "1. Checking Gateway .env file..." -ForegroundColor Yellow
if (Test-Path "apps/gateway/.env") {
    Write-Host "   ✅ apps/gateway/.env exists" -ForegroundColor Green
    
    # Check for required variables
    $envContent = Get-Content "apps/gateway/.env" -Raw
    
    $requiredVars = @(
        "DATABASE_URL",
        "OPENAI_API_KEY",
        "ELEVENLABS_API_KEY",
        "DEEPGRAM_API_KEY",
        "TWILIO_ACCOUNT_SID",
        "TWILIO_AUTH_TOKEN",
        "TWILIO_PHONE_NUMBER",
        "TWILIO_STREAM_WSS_URL",
        "DEV_TENANT_ID"
    )
    
    foreach ($var in $requiredVars) {
        if ($envContent -match "$var=.+") {
            Write-Host "   ✅ $var is set" -ForegroundColor Green
        } else {
            Write-Host "   ❌ $var is missing or empty" -ForegroundColor Red
            $allGood = $false
        }
    }
} else {
    Write-Host "   ❌ apps/gateway/.env not found" -ForegroundColor Red
    $allGood = $false
}

Write-Host ""

# Check 2: Node.js installed
Write-Host "2. Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "   ✅ Node.js installed: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Node.js not found" -ForegroundColor Red
    $allGood = $false
}

Write-Host ""

# Check 3: Gateway dependencies
Write-Host "3. Checking Gateway dependencies..." -ForegroundColor Yellow
if (Test-Path "apps/gateway/node_modules") {
    Write-Host "   ✅ Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Dependencies not installed. Run: cd apps/gateway && npm install" -ForegroundColor Yellow
    $allGood = $false
}

Write-Host ""

# Check 4: Gateway service running
Write-Host "4. Checking if Gateway is running..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3003/health" -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -eq 200) {
        Write-Host "   ✅ Gateway is running on port 3003" -ForegroundColor Green
    }
} catch {
    Write-Host "   ❌ Gateway is not running" -ForegroundColor Red
    Write-Host "   Run: .\start-voice-service.ps1" -ForegroundColor Yellow
    $allGood = $false
}

Write-Host ""

# Check 5: ngrok running
Write-Host "5. Checking ngrok..." -ForegroundColor Yellow
$ngrokRunning = Get-Process -Name ngrok -ErrorAction SilentlyContinue
if ($ngrokRunning) {
    Write-Host "   ✅ ngrok is running" -ForegroundColor Green
    
    # Try to get ngrok URL
    try {
        $ngrokApi = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels" -ErrorAction SilentlyContinue
        $publicUrl = $ngrokApi.tunnels[0].public_url
        Write-Host "   📡 ngrok URL: $publicUrl" -ForegroundColor Cyan
        Write-Host "   ⚠️  Make sure TWILIO_STREAM_WSS_URL uses wss:// version" -ForegroundColor Yellow
    } catch {
        Write-Host "   ⚠️  ngrok running but couldn't get URL" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ❌ ngrok is not running" -ForegroundColor Red
    Write-Host "   Run in new terminal: ngrok http 3003" -ForegroundColor Yellow
    $allGood = $false
}

Write-Host ""

# Check 6: Database connection
Write-Host "6. Checking database connection..." -ForegroundColor Yellow
Write-Host "   ℹ️  Manual check required:" -ForegroundColor Cyan
Write-Host "   - Go to Supabase dashboard" -ForegroundColor White
Write-Host "   - Run: SELECT COUNT(*) FROM voice_tenants;" -ForegroundColor White
Write-Host "   - Should return at least 1 tenant" -ForegroundColor White

Write-Host ""

# Summary
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
if ($allGood) {
    Write-Host "✅ All checks passed! Ready to test calls." -ForegroundColor Green
    Write-Host ""
    Write-Host "📞 Test by calling: +1 (919) 371-5609" -ForegroundColor Cyan
} else {
    Write-Host "⚠️  Some checks failed. Fix the issues above." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "📖 See QUICK_FIX_SUMMARY.md for detailed steps" -ForegroundColor Cyan
}
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""

# Next steps
Write-Host "📋 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Fix any ❌ issues above" -ForegroundColor White
Write-Host "2. Make sure Twilio webhook is configured:" -ForegroundColor White
Write-Host "   https://your-ngrok-url/api/v1/voice/incoming-call" -ForegroundColor Gray
Write-Host "3. Call +1 (919) 371-5609 to test" -ForegroundColor White
Write-Host "4. Check Gateway logs for any errors" -ForegroundColor White
Write-Host ""
