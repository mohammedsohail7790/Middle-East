#!/usr/bin/env node

/**
 * API Key Verification Script
 * Tests all external API keys to ensure they're valid before deployment
 */

import fetch from 'node-fetch';
import WebSocket from 'ws';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config({ path: 'apps/gateway/.env' });

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(service, message) {
  log(`✅ ${service}: ${message}`, 'green');
}

function logError(service, message) {
  log(`❌ ${service}: ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'cyan');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

// Test OpenAI API Key
async function testOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    logError('OpenAI', 'API key not found in environment');
    return false;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      const hasGPT4Mini = data.data.some(model => model.id === 'gpt-4o-mini');
      
      if (hasGPT4Mini) {
        logSuccess('OpenAI', 'API key valid, gpt-4o-mini model available');
        return true;
      } else {
        logWarning('OpenAI API key valid, but gpt-4o-mini not found');
        return true;
      }
    } else {
      const error = await response.text();
      logError('OpenAI', `API key invalid (${response.status}): ${error}`);
      return false;
    }
  } catch (error) {
    logError('OpenAI', `Connection failed: ${error.message}`);
    return false;
  }
}

// Test ElevenLabs API Key
async function testElevenLabs() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID_EN;
  
  if (!apiKey) {
    logError('ElevenLabs', 'API key not found in environment');
    return false;
  }

  try {
    // Test with a simple TTS request
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: 'Test',
        model_id: 'eleven_turbo_v2_5',
      }),
    });

    if (response.ok) {
      logSuccess('ElevenLabs', `API key valid, voice ID ${voiceId} working`);
      return true;
    } else {
      const error = await response.text();
      logError('ElevenLabs', `API key invalid (${response.status}): ${error}`);
      return false;
    }
  } catch (error) {
    logError('ElevenLabs', `Connection failed: ${error.message}`);
    return false;
  }
}

// Test Deepgram API Key
async function testDeepgram() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  
  if (!apiKey) {
    logError('Deepgram', 'API key not found in environment');
    return false;
  }

  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(
        'wss://api.deepgram.com/v1/listen?encoding=mulaw&sample_rate=8000&channels=1',
        {
          headers: {
            'Authorization': `Token ${apiKey}`,
          },
        }
      );

      const timeout = setTimeout(() => {
        ws.close();
        logError('Deepgram', 'Connection timeout');
        resolve(false);
      }, 5000);

      ws.on('open', () => {
        clearTimeout(timeout);
        logSuccess('Deepgram', 'API key valid, WebSocket connection successful');
        ws.close();
        resolve(true);
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        logError('Deepgram', `API key invalid or connection failed: ${error.message}`);
        resolve(false);
      });
    } catch (error) {
      logError('Deepgram', `Connection failed: ${error.message}`);
      resolve(false);
    }
  });
}

// Test Twilio API Key
async function testTwilio() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  
  if (!accountSid || !authToken) {
    logError('Twilio', 'Account SID or Auth Token not found in environment');
    return false;
  }

  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
      {
        headers: {
          'Authorization': `Basic ${auth}`,
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      logSuccess('Twilio', `Credentials valid, account: ${data.friendly_name}`);
      return true;
    } else {
      const error = await response.text();
      logError('Twilio', `Credentials invalid (${response.status}): ${error}`);
      return false;
    }
  } catch (error) {
    logError('Twilio', `Connection failed: ${error.message}`);
    return false;
  }
}

// Test Database Connection
async function testDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    logError('Database', 'DATABASE_URL not found in environment');
    return false;
  }

  try {
    // Dynamic import for pg
    const { default: pg } = await import('pg');
    const { Client } = pg;
    
    const client = new Client({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
    });

    await client.connect();
    const result = await client.query('SELECT 1 as test');
    await client.end();

    if (result.rows[0].test === 1) {
      logSuccess('Database', 'Connection successful (Supabase)');
      return true;
    } else {
      logError('Database', 'Query failed');
      return false;
    }
  } catch (error) {
    logError('Database', `Connection failed: ${error.message}`);
    return false;
  }
}

// Test Redis Connection
async function testRedis() {
  const redisUrl = process.env.REDIS_URL;
  
  if (!redisUrl) {
    logError('Redis', 'REDIS_URL not found in environment');
    return false;
  }

  try {
    // Dynamic import for ioredis
    const { default: Redis } = await import('ioredis');
    
    const redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
    });

    await redis.ping();
    await redis.quit();

    logSuccess('Redis', 'Connection successful (Upstash)');
    return true;
  } catch (error) {
    logError('Redis', `Connection failed: ${error.message}`);
    return false;
  }
}

// Main test runner
async function runTests() {
  log('\n🔍 Testing API Keys and Connections...\n', 'blue');
  
  const results = {
    openai: false,
    elevenlabs: false,
    deepgram: false,
    twilio: false,
    database: false,
    redis: false,
  };

  // Run tests sequentially
  logInfo('Testing OpenAI...');
  results.openai = await testOpenAI();
  
  logInfo('\nTesting ElevenLabs...');
  results.elevenlabs = await testElevenLabs();
  
  logInfo('\nTesting Deepgram...');
  results.deepgram = await testDeepgram();
  
  logInfo('\nTesting Twilio...');
  results.twilio = await testTwilio();
  
  logInfo('\nTesting Database...');
  results.database = await testDatabase();
  
  logInfo('\nTesting Redis...');
  results.redis = await testRedis();

  // Summary
  log('\n' + '='.repeat(50), 'cyan');
  log('📊 Test Summary', 'blue');
  log('='.repeat(50) + '\n', 'cyan');

  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;

  Object.entries(results).forEach(([service, passed]) => {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    const color = passed ? 'green' : 'red';
    log(`${status} - ${service.toUpperCase()}`, color);
  });

  log('\n' + '='.repeat(50), 'cyan');
  
  if (passed === total) {
    log(`\n🎉 All tests passed! (${passed}/${total})`, 'green');
    log('✅ System is ready for deployment\n', 'green');
    process.exit(0);
  } else {
    log(`\n⚠️  Some tests failed (${passed}/${total} passed)`, 'yellow');
    log('❌ Fix the issues above before deploying\n', 'red');
    process.exit(1);
  }
}

// Run tests
runTests().catch((error) => {
  logError('Test Runner', `Unexpected error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
