import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(root, 'apps/gateway/.env') });
dotenv.config({ path: resolve(root, 'apps/dashboard/.env.local') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testLogin() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@hallaai.com';
  const adminPassword = process.env.ADMIN_PASSWORD;
  const testEmail = process.env.TEST_USER_EMAIL || 'test@hallaai.com';
  const testPassword = process.env.TEST_USER_PASSWORD;

  if (!adminPassword) {
    console.error('Missing ADMIN_PASSWORD for login test');
    process.exit(1);
  }

  console.log(`=== TEST 1: Login with ${adminEmail} ===`);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });

  if (error) {
    console.log('Error:', error.message);
    console.log('Error code:', error.status);
  } else {
    console.log('SUCCESS!');
    console.log('User ID:', data.user.id);
    console.log('Email:', data.user.email);
    console.log('Confirmed:', data.user.email_confirmed_at ? 'Yes' : 'No');
  }

  if (testPassword) {
    console.log(`\n=== TEST 2: Login with ${testEmail} ===`);
    const { data: data2, error: error2 } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });

    if (error2) {
      console.log('Error:', error2.message);
    } else {
      console.log('SUCCESS!');
      console.log('User ID:', data2.user.id);
    }
  } else {
    console.log('\n=== TEST 2: skipped (set TEST_USER_PASSWORD) ===');
  }

  if (supabaseServiceKey) {
    console.log('\n=== TEST 3: List all users (admin) ===');
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: users, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
    if (usersError) {
      console.log('Error:', usersError.message);
    } else {
      for (const u of users.users) {
        console.log('Email:', u.email, '| ID:', u.id, '| Confirmed:', u.email_confirmed_at ? 'Yes' : 'No');
      }
    }
  } else {
    console.log('\n=== TEST 3: skipped (set SUPABASE_SERVICE_ROLE_KEY) ===');
  }
}

testLogin();
