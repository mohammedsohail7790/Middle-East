// Create Test User in Supabase
// Run: ADMIN_PASSWORD=... node create-test-user.js

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(root, 'apps/gateway/.env') });
dotenv.config({ path: resolve(root, 'apps/dashboard/.env.local') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const testEmail = process.env.TEST_USER_EMAIL || 'test@hallaai.com';
const testPassword = process.env.TEST_USER_PASSWORD || process.env.ADMIN_PASSWORD;

if (!testPassword) {
  console.error('Missing TEST_USER_PASSWORD (or ADMIN_PASSWORD)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createTestUser() {
  console.log('Creating test user...');
  
  try {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: {
        full_name: 'Test User'
      }
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        console.log(`✅ User already exists: ${testEmail}`);
        return;
      }
      throw authError;
    }

    console.log('✅ User created successfully!');
    console.log('User ID:', authData.user.id);

    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        user_id: authData.user.id,
        email: testEmail,
        full_name: 'Test User',
        company_name: 'Test Company',
        subscription_tier: 'pro'
      });

    if (profileError) {
      console.log('Profile error (may already exist):', profileError.message);
    } else {
      console.log('✅ Profile created!');
    }

    const { error: tenantError } = await supabase
      .from('tenants')
      .insert({
        email: testEmail,
        name: 'Test User',
        business_name: 'Test Business',
        phone_number: '+1234567890',
        industry: 'Technology',
        subscription_tier: 'professional',
        subscription_status: 'active'
      });

    if (tenantError) {
      console.log('Tenant error (may already exist or table may not exist):', tenantError.message);
    } else {
      console.log('✅ Tenant created!');
    }

    console.log('\n🎉 Test user is ready!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Email:    ${testEmail}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\nYou can now login at: http://localhost:3000/login');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

createTestUser();
