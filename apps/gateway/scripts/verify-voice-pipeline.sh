#!/bin/bash

# Voice Pipeline Verification Script
# This script tests all components of the Call IQ voice pipeline

set -e

echo "🚀 Call IQ Voice Pipeline Verification"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test results
PASSED=0
FAILED=0

# Function to print test results
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ PASSED${NC}: $2"
        ((PASSED++))
    else
        echo -e "${RED}❌ FAILED${NC}: $2"
        ((FAILED++))
    fi
}

# Function to check environment variable
check_env_var() {
    if [ -z "${!1}" ]; then
        return 1
    fi
    return 0
}

echo ""
echo "1. Environment Variables Check"
echo "--------------------------------"

# Check required environment variables
ENV_VARS=(
    "ELEVENLABS_API_KEY"
    "DEEPGRAM_API_KEY"
    "OPENAI_API_KEY"
    "TWILIO_ACCOUNT_SID"
    "TWILIO_AUTH_TOKEN"
    "TWILIO_PHONE_NUMBER"
    "REDIS_URL"
    "JWT_SECRET"
)

ALL_ENV_SET=true
for var in "${ENV_VARS[@]}"; do
    if check_env_var "$var"; then
        echo -e "  ${GREEN}✅${NC} $var is set"
    else
        echo -e "  ${RED}❌${NC} $var is not set"
        ALL_ENV_SET=false
    fi
done

if [ "$ALL_ENV_SET" = true ]; then
    print_result 0 "All environment variables configured"
else
    print_result 1 "Missing environment variables"
fi

echo ""
echo "2. Service Connectivity Tests"
echo "-----------------------------"

# Test ElevenLabs API
echo "Testing ElevenLabs API..."
if check_env_var "ELEVENLABS_API_KEY"; then
    ELEVENLABS_RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/elevenlabs_response.json \
        -H "xi-api-key: $ELEVENLABS_API_KEY" \
        "https://api.elevenlabs.io/v1/voices" || echo "000")
    
    if [ "$ELEVENLABS_RESPONSE" = "200" ]; then
        VOICE_COUNT=$(jq -r '.voices | length' /tmp/elevenlabs_response.json 2>/dev/null || echo "0")
        print_result 0 "ElevenLabs API connected ($VOICE_COUNT voices found)"
    else
        print_result 1 "ElevenLabs API failed (HTTP $ELEVENLABS_RESPONSE)"
    fi
else
    print_result 1 "ElevenLabs API test skipped (no API key)"
fi

# Test Deepgram API
echo "Testing Deepgram API..."
if check_env_var "DEEPGRAM_API_KEY"; then
    DEEPGRAM_RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/deepgram_response.json \
        -H "Authorization: Token $DEEPGRAM_API_KEY" \
        "https://api.deepgram.com/v1/projects" || echo "000")
    
    if [ "$DEEPGRAM_RESPONSE" = "200" ]; then
        PROJECT_COUNT=$(jq -r '.projects | length' /tmp/deepgram_response.json 2>/dev/null || echo "0")
        print_result 0 "Deepgram API connected ($PROJECT_COUNT projects found)"
    else
        print_result 1 "Deepgram API failed (HTTP $DEEPGRAM_RESPONSE)"
    fi
else
    print_result 1 "Deepgram API test skipped (no API key)"
fi

# Test OpenAI API
echo "Testing OpenAI API..."
if check_env_var "OPENAI_API_KEY"; then
    OPENAI_RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/openai_response.json \
        -H "Authorization: Bearer $OPENAI_API_KEY" \
        "https://api.openai.com/v1/models" || echo "000")
    
    if [ "$OPENAI_RESPONSE" = "200" ]; then
        MODEL_COUNT=$(jq -r '.data | length' /tmp/openai_response.json 2>/dev/null || echo "0")
        print_result 0 "OpenAI API connected ($MODEL_COUNT models found)"
    else
        print_result 1 "OpenAI API failed (HTTP $OPENAI_RESPONSE)"
    fi
else
    print_result 1 "OpenAI API test skipped (no API key)"
fi

# Test Twilio API
echo "Testing Twilio API..."
if check_env_var "TWILIO_ACCOUNT_SID" && check_env_var "TWILIO_AUTH_TOKEN"; then
    TWILIO_RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/twilio_response.json \
        -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
        "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID.json" || echo "000")
    
    if [ "$TWILIO_RESPONSE" = "200" ]; then
        ACCOUNT_NAME=$(jq -r '.friendly_name // .sid' /tmp/twilio_response.json 2>/dev/null || echo "Unknown")
        print_result 0 "Twilio API connected (Account: $ACCOUNT_NAME)"
    else
        print_result 1 "Twilio API failed (HTTP $TWILIO_RESPONSE)"
    fi
else
    print_result 1 "Twilio API test skipped (missing credentials)"
fi

echo ""
echo "3. Gateway Service Tests"
echo "------------------------"

# Check if gateway is running
echo "Testing Gateway Service..."
GATEWAY_URL="http://localhost:3003"
GATEWAY_RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/gateway_response.json \
    "$GATEWAY_URL/health" || echo "000")

if [ "$GATEWAY_RESPONSE" = "200" ]; then
    GATEWAY_STATUS=$(jq -r '.status // "unknown"' /tmp/gateway_response.json 2>/dev/null || echo "unknown")
    print_result 0 "Gateway service running (Status: $GATEWAY_STATUS)"
else
    print_result 1 "Gateway service not responding (HTTP $GATEWAY_RESPONSE)"
fi

# Test WebSocket endpoint
echo "Testing WebSocket endpoint..."
if command -v nc &> /dev/null; then
    if nc -z localhost 3001 2>/dev/null; then
        print_result 0 "WebSocket endpoint accessible (port 3001)"
    else
        print_result 1 "WebSocket endpoint not accessible (port 3001)"
    fi
else
    echo -e "  ${YELLOW}⚠️${NC} WebSocket test skipped (netcat not available)"
fi

echo ""
echo "4. Integration Tests"
echo "--------------------"

# Test TTS service integration
echo "Testing TTS integration..."
if check_env_var "ELEVENLABS_API_KEY"; then
    TTS_TEST_RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/tts_test.json \
        -X POST \
        -H "Content-Type: application/json" \
        -H "xi-api-key: $ELEVENLABS_API_KEY" \
        -d '{"text": "Hello, this is a test.", "voice_id": "EXAVITQu4vr4xnSDxMaL"}' \
        "https://api.elevenlabs.io/v1/text-to-speech" || echo "000")
    
    if [ "$TTS_TEST_RESPONSE" = "200" ]; then
        print_result 0 "TTS integration test passed"
    else
        print_result 1 "TTS integration test failed (HTTP $TTS_TEST_RESPONSE)"
    fi
else
    print_result 1 "TTS integration test skipped (no API key)"
fi

# Test AI service integration
echo "Testing AI integration..."
if check_env_var "OPENAI_API_KEY"; then
    AI_TEST_RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/ai_test.json \
        -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $OPENAI_API_KEY" \
        -d '{"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "Hello, I need help with an appointment."}], "max_tokens": 100}' \
        "https://api.openai.com/v1/chat/completions" || echo "000")
    
    if [ "$AI_TEST_RESPONSE" = "200" ]; then
        print_result 0 "AI integration test passed"
    else
        print_result 1 "AI integration test failed (HTTP $AI_TEST_RESPONSE)"
    fi
else
    print_result 1 "AI integration test skipped (no API key)"
fi

echo ""
echo "5. Performance Tests"
echo "--------------------"

# Test API response times
echo "Testing API response times..."

if check_env_var "OPENAI_API_KEY"; then
    OPENAI_START=$(date +%s%N)
    curl -s -H "Authorization: Bearer $OPENAI_API_KEY" \
        "https://api.openai.com/v1/models" > /dev/null
    OPENAI_END=$(date +%s%N)
    OPENAI_LATENCY=$(( (OPENAI_END - OPENAI_START) / 1000000 ))
    
    if [ $OPENAI_LATENCY -lt 3000 ]; then
        print_result 0 "OpenAI API latency: ${OPENAI_LATENCY}ms"
    else
        print_result 1 "OpenAI API latency too high: ${OPENAI_LATENCY}ms"
    fi
else
    echo -e "  ${YELLOW}⚠️${NC} OpenAI latency test skipped (no API key)"
fi

echo ""
echo "======================================"
echo "📊 Test Results Summary"
echo "======================================"
echo -e "Total Tests: $((PASSED + FAILED))"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "\n${GREEN}🎉 All tests passed! Voice pipeline is ready.${NC}"
    exit 0
else
    echo -e "\n${RED}⚠️  Some tests failed. Please check the configuration.${NC}"
    exit 1
fi
