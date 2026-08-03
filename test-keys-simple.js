/**
 * API key smoke test — reads credentials from environment only.
 * Usage: OPENAI_API_KEY=... TWILIO_AUTH_TOKEN=... node test-keys-simple.js
 */

const tests = {
  openai: {
    key: process.env.OPENAI_API_KEY,
    url: 'https://api.openai.com/v1/models',
  },
  elevenlabs: {
    key: process.env.ELEVENLABS_API_KEY,
    url: 'https://api.elevenlabs.io/v1/user/subscription',
  },
  twilio: {
    sid: process.env.TWILIO_ACCOUNT_SID,
    token: process.env.TWILIO_AUTH_TOKEN,
  },
};

console.log('\nAPI key presence check (no secrets printed)\n');
for (const [name, cfg] of Object.entries(tests)) {
  const present = Boolean(cfg.key || cfg.token);
  console.log(`${present ? '✓' : '✗'} ${name}: ${present ? 'set' : 'missing — add to .env'}`);
}

if (!process.env.OPENAI_API_KEY) {
  process.exitCode = 1;
}
