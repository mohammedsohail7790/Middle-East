# Update Twilio Webhook URL
# Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER env vars (see apps/gateway/.env)
$accountSid = $env:TWILIO_ACCOUNT_SID
$authToken = $env:TWILIO_AUTH_TOKEN
$twilioPhoneNumber = $env:TWILIO_PHONE_NUMBER
$ngrokUrl = "https://removable-puzzle-humbling.ngrok-free.dev"
$webhookUrl = "$ngrokUrl/api/v1/voice/incoming-call"

if (-not $accountSid -or -not $authToken -or -not $twilioPhoneNumber) {
    Write-Host "Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER env vars" -ForegroundColor Red
    exit 1
}

Write-Host "Updating Twilio webhook..." -ForegroundColor Cyan
Write-Host "Webhook URL: $webhookUrl" -ForegroundColor Yellow

# First, get the phone number SID
$auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${accountSid}:${authToken}"))
$headers = @{ Authorization = "Basic $auth" }

try {
    # Get phone numbers
    $response = Invoke-RestMethod -Uri "https://api.twilio.com/2010-04-01/Accounts/$accountSid/IncomingPhoneNumbers.json" -Headers $headers -Method GET
    
    $phoneNumber = $response.incoming_phone_numbers | Where-Object { $_.phone_number -eq $twilioPhoneNumber }
    
    if ($phoneNumber) {
        $phoneSid = $phoneNumber.sid
        Write-Host "Found phone number SID: $phoneSid" -ForegroundColor Green
        
        # Update the webhook
        $body = @{
            VoiceUrl = $webhookUrl
            VoiceMethod = "POST"
        }
        
        $updateResponse = Invoke-RestMethod `
            -Uri "https://api.twilio.com/2010-04-01/Accounts/$accountSid/IncomingPhoneNumbers/$phoneSid.json" `
            -Headers $headers `
            -Method POST `
            -Body $body
        
        Write-Host "Webhook updated successfully!" -ForegroundColor Green
        Write-Host "Voice URL: $($updateResponse.voice_url)" -ForegroundColor Green
    } else {
        Write-Host "Phone number $twilioPhoneNumber not found" -ForegroundColor Red
    }
} catch {
    Write-Host "Error updating webhook: $_" -ForegroundColor Red
}
