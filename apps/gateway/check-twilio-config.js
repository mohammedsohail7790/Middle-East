/**
 * Check and Update Twilio Phone Number Configuration
 * 
 * This script verifies that the Twilio phone number is configured
 * with the correct webhook URL for incoming calls.
 */

import twilio from 'twilio';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from gateway directory
dotenv.config({ path: join(__dirname, '.env') });

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const TWILIO_STREAM_WSS_URL = process.env.TWILIO_STREAM_WSS_URL;

console.log('🔍 TWILIO CONFIGURATION CHECK');
console.log('=' .repeat(80));
console.log('');

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    console.error('❌ Missing Twilio credentials in .env');
    console.error('   TWILIO_ACCOUNT_SID:', TWILIO_ACCOUNT_SID ? '✅' : '❌');
    console.error('   TWILIO_AUTH_TOKEN:', TWILIO_AUTH_TOKEN ? '✅' : '❌');
    console.error('   TWILIO_PHONE_NUMBER:', TWILIO_PHONE_NUMBER ? '✅' : '❌');
    process.exit(1);
}

console.log('✅ Twilio credentials found');
console.log('📞 Phone Number:', TWILIO_PHONE_NUMBER);
console.log('🔑 Account SID:', TWILIO_ACCOUNT_SID);
console.log('🌐 Stream WSS URL:', TWILIO_STREAM_WSS_URL);
console.log('');

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

async function checkConfiguration() {
    try {
        console.log('🔍 Fetching phone number configuration from Twilio...');
        console.log('');
        
        // List all phone numbers
        const phoneNumbers = await client.incomingPhoneNumbers.list({ limit: 20 });
        
        console.log(`📋 Found ${phoneNumbers.length} phone number(s) in your account:`);
        console.log('');
        
        let targetNumber = null;
        
        for (const number of phoneNumbers) {
            const isTarget = number.phoneNumber === TWILIO_PHONE_NUMBER;
            console.log(`${isTarget ? '👉' : '  '} ${number.phoneNumber}`);
            console.log(`   SID: ${number.sid}`);
            console.log(`   Friendly Name: ${number.friendlyName}`);
            console.log(`   Voice URL: ${number.voiceUrl || '(not set)'}`);
            console.log(`   Voice Method: ${number.voiceMethod || 'POST'}`);
            console.log('');
            
            if (isTarget) {
                targetNumber = number;
            }
        }
        
        if (!targetNumber) {
            console.error('❌ TARGET PHONE NUMBER NOT FOUND IN YOUR ACCOUNT');
            console.error(`   Looking for: ${TWILIO_PHONE_NUMBER}`);
            console.error('');
            console.error('POSSIBLE CAUSES:');
            console.error('  1. Phone number is in a different Twilio account');
            console.error('  2. Phone number format is incorrect (should include +1)');
            console.error('  3. Phone number was released or deleted');
            console.error('');
            console.error('NEXT STEPS:');
            console.error('  1. Verify phone number at: https://console.twilio.com/us1/develop/phone-numbers/manage/incoming');
            console.error('  2. Check TWILIO_ACCOUNT_SID matches the account that owns the number');
            console.error('  3. Update TWILIO_PHONE_NUMBER in .env if format is wrong');
            process.exit(1);
        }
        
        console.log('✅ Target phone number found!');
        console.log('');
        
        // Check webhook configuration
        const expectedWebhookUrl = `${TWILIO_STREAM_WSS_URL.replace('wss://', 'https://')}/api/v1/voice/incoming-call`;
        const currentWebhookUrl = targetNumber.voiceUrl;
        
        console.log('🔍 WEBHOOK CONFIGURATION:');
        console.log('');
        console.log('Expected:', expectedWebhookUrl);
        console.log('Current: ', currentWebhookUrl || '(not set)');
        console.log('');
        
        if (currentWebhookUrl === expectedWebhookUrl) {
            console.log('✅ WEBHOOK IS CORRECTLY CONFIGURED!');
            console.log('');
            console.log('The phone number is properly configured.');
            console.log('If calls are still failing, the issue is elsewhere.');
        } else {
            console.log('❌ WEBHOOK IS NOT CONFIGURED CORRECTLY!');
            console.log('');
            console.log('This is why calls are failing - Twilio doesn\'t know where to send them.');
            console.log('');
            console.log('FIXING NOW...');
            console.log('');
            
            // Update the phone number configuration
            await client.incomingPhoneNumbers(targetNumber.sid).update({
                voiceUrl: expectedWebhookUrl,
                voiceMethod: 'POST',
            });
            
            console.log('✅ WEBHOOK UPDATED SUCCESSFULLY!');
            console.log('');
            console.log('New configuration:');
            console.log('  Voice URL:', expectedWebhookUrl);
            console.log('  Voice Method: POST');
            console.log('');
            console.log('🎉 You can now make test calls to:', TWILIO_PHONE_NUMBER);
        }
        
    } catch (error) {
        console.error('');
        console.error('❌ ERROR:', error.message);
        console.error('');
        
        if (error.code === 20003) {
            console.error('🔑 AUTHENTICATION ERROR');
            console.error('   Your Twilio credentials are invalid');
            console.error('   Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env');
        } else if (error.code === 20404) {
            console.error('🔍 NOT FOUND');
            console.error('   The phone number or resource was not found');
        } else {
            console.error('Full error:', error);
        }
        
        process.exit(1);
    }
}

checkConfiguration();
