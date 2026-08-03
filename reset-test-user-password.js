// Reset Test User Password in Supabase
// Run: TEST_USER_PASSWORD=... node reset-test-user-password.js

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

const testEmail = process.env.TEST_USER_EMAIL || 'test@calliq.com';
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

async function resetPassword() {
  console.log(`Resetting password for ${testEmail}...`);
  
  try {
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) throw listError;
    
    const user = users.users.find(u => u.email === testEmail);
    
    if (!user) {
      console.log(`❌ User not found: ${testEmail}`);
      return;
    }
    
    console.log('Found user:', user.id);
    
    const { error } = await supabase.auth.admin.updateUserById(
      user.id,
      { password: testPassword }
    );
    
    if (error) throw error;
    
    console.log('\n🎉 Password reset successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Email:    ${testEmail}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\nYou can now login at: http://localhost:3000/login');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

resetPassword();
