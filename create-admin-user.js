import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(root, 'apps/gateway/.env') });
dotenv.config({ path: resolve(root, 'apps/dashboard/.env.local') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setup() {
  const email = process.env.ADMIN_EMAIL || 'admin@hallaai.com';
  const password = process.env.ADMIN_PASSWORD;
  const tenantId = process.env.SMOKE_TENANT_ID || process.env.E2E_TENANT_ID || '2a9ea1e6-fa09-497c-8107-e704af6b1802';

  if (!password) {
    console.error('Missing ADMIN_PASSWORD');
    process.exit(1);
  }

  // Check if user already exists
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existingUser = existingUsers.users.find(u => u.email === email);

  if (existingUser) {
    console.log('User already exists:', email);
    console.log('User ID:', existingUser.id);

    // Update tenant to point to this user
    const { error: updateError } = await supabase
      .from('voice_tenants')
      .update({ owner_user_id: existingUser.id })
      .eq('id', tenantId);

    if (updateError) {
      console.error('Tenant update error:', updateError);
    } else {
      console.log('Tenant owner updated to:', existingUser.id);
    }
    return;
  }

  // Create new user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: email,
    password: password,
    email_confirm: true,
    user_metadata: {
      full_name: 'Call IQ Admin',
      role: 'admin',
    },
  });

  if (authError) {
    console.error('Create user error:', authError);
    process.exit(1);
  }

  console.log('=== NEW ADMIN USER CREATED ===');
  console.log('Email:', email);
  console.log('User ID:', authData.user.id);

  // Update tenant owner
  const { error: updateError } = await supabase
    .from('voice_tenants')
    .update({ owner_user_id: authData.user.id })
    .eq('id', tenantId);

  if (updateError) {
    console.error('Tenant update error:', updateError);
  } else {
    console.log('Tenant owner updated to new user');
  }

  // Also link the existing test user
  const testUser = existingUsers.users.find(u => u.email === 'test@hallaai.com');
  if (testUser) {
    console.log('\nExisting test user also available:');
    console.log('Email: test@hallaai.com');
  }
}

setup();
