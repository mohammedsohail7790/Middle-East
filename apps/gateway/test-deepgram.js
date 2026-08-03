/**
 * Standalone Deepgram WebSocket Connection Test
 * 
 * This script tests if Deepgram WebSocket connection works
 * independently of the full voice pipeline.
 * 
 * Run: node test-deepgram.js
 */

import WebSocket from 'ws';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from gateway directory
dotenv.config({ path: join(__dirname, '.env') });

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

console.log('🧪 DEEPGRAM CONNECTION TEST');
console.log('=' .repeat(60));

if (!DEEPGRAM_API_KEY) {
    console.error('❌ DEEPGRAM_API_KEY not found in .env');
    process.exit(1);
}

console.log('✅ API Key found, length:', DEEPGRAM_API_KEY.length);
console.log('🔑 API Key prefix:', DEEPGRAM_API_KEY.substring(0, 10) + '...');
console.log('');

const url = 'wss://api.deepgram.com/v1/listen?encoding=mulaw&sample_rate=8000&channels=1&interim_results=true&punctuate=true&language=en';

console.log('🌐 Connecting to:', url);
console.log('');

const ws = new WebSocket(url, {
    headers: {
        Authorization: `Token ${DEEPGRAM_API_KEY}`
    }
});

let connected = false;
let startTime = Date.now();

// Timeout after 30 seconds
const timeout = setTimeout(() => {
    if (!connected) {
        console.error('');
        console.error('❌ CONNECTION TIMEOUT (30 seconds)');
        console.error('❌ No "open" event received from Deepgram');
        console.error('');
        console.error('POSSIBLE CAUSES:');
        console.error('  1. Invalid API key');
        console.error('  2. Firewall/antivirus blocking WebSocket connections');
        console.error('  3. Network issue (proxy, VPN, etc.)');
        console.error('  4. Deepgram service outage');
        console.error('');
        console.error('NEXT STEPS:');
        console.error('  1. Verify API key at: https://console.deepgram.com/');
        console.error('  2. Test with curl:');
        console.error('     curl -X GET "https://api.deepgram.com/v1/projects" \\');
        console.error('       -H "Authorization: Token YOUR_API_KEY"');
        console.error('  3. Check firewall/antivirus settings');
        console.error('  4. Try from different network');
        process.exit(1);
    }
}, 30000);

ws.on('open', () => {
    connected = true;
    clearTimeout(timeout);
    const elapsed = Date.now() - startTime;
    console.log('');
    console.log('✅ CONNECTION SUCCESSFUL!');
    console.log(`✅ Connected in ${elapsed}ms`);
    console.log('✅ WebSocket state:', ws.readyState, '(1 = OPEN)');
    console.log('');
    console.log('🎉 Deepgram WebSocket is working correctly!');
    console.log('');
    console.log('The issue is NOT with Deepgram connection.');
    console.log('The problem must be in the voice pipeline integration.');
    console.log('');
    
    // Send a test message
    console.log('📤 Sending test audio packet...');
    const testBuffer = Buffer.alloc(160); // Empty audio frame
    ws.send(testBuffer);
    
    // Wait for response
    setTimeout(() => {
        console.log('✅ Test complete - closing connection');
        ws.close();
        process.exit(0);
    }, 2000);
});

ws.on('error', (error) => {
    clearTimeout(timeout);
    console.error('');
    console.error('❌ CONNECTION ERROR');
    console.error('❌ Error type:', error.constructor.name);
    console.error('❌ Error message:', error.message);
    console.error('❌ Full error:', error);
    console.error('');
    
    if (error.message.includes('401') || error.message.includes('403')) {
        console.error('🔑 AUTHENTICATION ERROR');
        console.error('   Your API key is invalid or expired');
        console.error('   Get a new key at: https://console.deepgram.com/');
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('ETIMEDOUT')) {
        console.error('🌐 NETWORK ERROR');
        console.error('   Cannot reach api.deepgram.com');
        console.error('   Check your internet connection');
    } else if (error.message.includes('ECONNREFUSED')) {
        console.error('🚫 CONNECTION REFUSED');
        console.error('   Firewall or antivirus may be blocking WebSocket');
    }
    
    process.exit(1);
});

ws.on('close', (code, reason) => {
    if (!connected) {
        console.error('');
        console.error('❌ CONNECTION CLOSED BEFORE OPENING');
        console.error('❌ Close code:', code);
        console.error('❌ Close reason:', reason.toString() || 'No reason provided');
        console.error('');
        
        if (code === 1002) {
            console.error('🔑 PROTOCOL ERROR (code 1002)');
            console.error('   Usually means invalid API key or malformed request');
        } else if (code === 1006) {
            console.error('🌐 ABNORMAL CLOSURE (code 1006)');
            console.error('   Connection dropped unexpectedly');
            console.error('   Could be network issue or firewall');
        }
        
        process.exit(1);
    }
});

ws.on('message', (data) => {
    try {
        const message = JSON.parse(data.toString());
        console.log('📥 Received message from Deepgram:', JSON.stringify(message, null, 2));
    } catch (error) {
        console.log('📥 Received non-JSON message:', data.toString().substring(0, 100));
    }
});

// Log state every 2 seconds while connecting
const stateInterval = setInterval(() => {
    if (!connected) {
        const elapsed = Date.now() - startTime;
        console.log(`⏳ Still connecting... (${elapsed}ms) readyState=${ws.readyState}`);
    } else {
        clearInterval(stateInterval);
    }
}, 2000);
