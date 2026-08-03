@echo off
REM Voice Pipeline Verification Script for Windows
REM This script tests all components of the Call IQ voice pipeline

echo 🚀 Call IQ Voice Pipeline Verification
echo ======================================

set PASSED=0
set FAILED=0

REM Function to print test results
if "%1"=="" goto :main

:print_result
if %1==0 (
    echo ✅ PASSED: %2
    set /a PASSED+=1
) else (
    echo ❌ FAILED: %2
    set /a FAILED+=1
)
goto :eof

:main
echo.
echo 1. Environment Variables Check
echo --------------------------------

REM Check required environment variables
set ALL_ENV_SET=true

if "%ELEVENLABS_API_KEY%"=="" (
    echo ❌ ELEVENLABS_API_KEY is not set
    set ALL_ENV_SET=false
) else (
    echo ✅ ELEVENLABS_API_KEY is set
)

if "%DEEPGRAM_API_KEY%"=="" (
    echo ❌ DEEPGRAM_API_KEY is not set
    set ALL_ENV_SET=false
) else (
    echo ✅ DEEPGRAM_API_KEY is set
)

if "%OPENAI_API_KEY%"=="" (
    echo ❌ OPENAI_API_KEY is not set
    set ALL_ENV_SET=false
) else (
    echo ✅ OPENAI_API_KEY is set
)

if "%TWILIO_ACCOUNT_SID%"=="" (
    echo ❌ TWILIO_ACCOUNT_SID is not set
    set ALL_ENV_SET=false
) else (
    echo ✅ TWILIO_ACCOUNT_SID is set
)

if "%TWILIO_AUTH_TOKEN%"=="" (
    echo ❌ TWILIO_AUTH_TOKEN is not set
    set ALL_ENV_SET=false
) else (
    echo ✅ TWILIO_AUTH_TOKEN is set
)

if "%ALL_ENV_SET%"=="true" (
    call :print_result 0 "All environment variables configured"
) else (
    call :print_result 1 "Missing environment variables"
)

echo.
echo 2. Service Connectivity Tests
echo -----------------------------

REM Test ElevenLabs API
echo Testing ElevenLabs API...
if not "%ELEVENLABS_API_KEY%"=="" (
    curl -s -H "xi-api-key: %ELEVENLABS_API_KEY%" "https://api.elevenlabs.io/v1/voices" > temp_elevenlabs.json 2>nul
    if %errorlevel%==0 (
        call :print_result 0 "ElevenLabs API connected"
    ) else (
        call :print_result 1 "ElevenLabs API failed"
    )
    del temp_elevenlabs.json 2>nul
) else (
    call :print_result 1 "ElevenLabs API test skipped (no API key)"
)

REM Test Deepgram API
echo Testing Deepgram API...
if not "%DEEPGRAM_API_KEY%"=="" (
    curl -s -H "Authorization: Token %DEEPGRAM_API_KEY%" "https://api.deepgram.com/v1/projects" > temp_deepgram.json 2>nul
    if %errorlevel%==0 (
        call :print_result 0 "Deepgram API connected"
    ) else (
        call :print_result 1 "Deepgram API failed"
    )
    del temp_deepgram.json 2>nul
) else (
    call :print_result 1 "Deepgram API test skipped (no API key)"
)

REM Test OpenAI API
echo Testing OpenAI API...
if not "%OPENAI_API_KEY%"=="" (
    curl -s -H "Authorization: Bearer %OPENAI_API_KEY%" "https://api.openai.com/v1/models" > temp_openai.json 2>nul
    if %errorlevel%==0 (
        call :print_result 0 "OpenAI API connected"
    ) else (
        call :print_result 1 "OpenAI API failed"
    )
    del temp_openai.json 2>nul
) else (
    call :print_result 1 "OpenAI API test skipped (no API key)"
)

echo.
echo 3. Gateway Service Tests
echo ------------------------

REM Check if gateway is running
echo Testing Gateway Service...
curl -s "http://localhost:3003/health" > temp_gateway.json 2>nul
if %errorlevel%==0 (
    call :print_result 0 "Gateway service running"
) else (
    call :print_result 1 "Gateway service not responding"
)
del temp_gateway.json 2>nul

echo.
echo ======================================
echo 📊 Test Results Summary
echo ======================================
echo Total Tests: %PASSED% + %FAILED%
echo Passed: %PASSED%
echo Failed: %FAILED%

if %FAILED%==0 (
    echo.
    echo 🎉 All tests passed! Voice pipeline is ready.
    exit /b 0
) else (
    echo.
    echo ⚠️  Some tests failed. Please check the configuration.
    exit /b 1
)
