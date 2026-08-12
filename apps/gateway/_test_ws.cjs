#!/usr/bin/env node
// WebSocket connectivity test — run against production gateway endpoint
// Usage: node _test_ws.cjs [path]
//   Default: wss://gateway.hallaai.com/ws/test
//   Pass a path arg to test e.g.: node _test_ws.cjs /ws/voice/TENANT_ID

const WebSocket = require('ws');

const BASE = 'wss://gateway.hallaai.com';
const PATH = process.argv[2] || '/ws/test';
const URL = BASE + PATH;

console.log('=' .repeat(60));
console.log('WS Test');
console.log('=' .repeat(60));
console.log('URL:', URL);
console.log('Time:', new Date().toISOString());
console.log('');

const ws = new WebSocket(URL, {
  rejectUnauthorized: false,
  handshakeTimeout: 15000,
});

ws.on('open', () => {
  console.log('✅ CONNECTED');
  console.log('  Protocol:', ws.protocol);
  console.log('  ReadyState:', ws.readyState);
  console.log('  Extensions:', ws.extensions);
  
  // For echo endpoint, send a test message
  if (PATH === '/ws/test') {
    ws.send(JSON.stringify({ type: 'ping', time: Date.now() }));
  }
});

ws.on('message', (data) => {
  console.log('📩 MESSAGE:', data.toString());
  if (PATH === '/ws/test') {
    console.log('');
    console.log('✅ Echo test passed — server sent a response');
    console.log('✅ WebSocket connectivity to Render is WORKING');
    ws.close(1000, 'Test complete');
  }
});

ws.on('error', (err) => {
  console.error('❌ ERROR:', err.message);
  process.exit(1);
});

ws.on('close', (code, reason) => {
  console.log('🔌 CLOSED:', { code, reason: reason?.toString() || '(none)' });
  if (code === 1000) {
    console.log('');
    console.log('✅ Test PASSED');
    process.exit(0);
  } else {
    console.log('');
    console.log('❌ Test FAILED — unexpected close code');
    process.exit(1);
  }
});

// Timeout
setTimeout(() => {
  console.error('⏰ TIMEOUT — no connection after 20s');
  process.exit(1);
}, 20000);
