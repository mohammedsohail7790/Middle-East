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

async function check() {
  const ownerId = process.env.TENANT_OWNER_USER_ID || 'a6f4f803-533e-400d-ab56-1e1cc1567654';

  const { data: users, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error('Auth error:', error);
  } else {
    console.log('=== AUTH USERS ===');
    for (const u of users.users) {
      console.log('Email:', u.email);
      console.log('ID:', u.id);
      console.log('Created:', u.created_at);
      console.log('Last Sign In:', u.last_sign_in_at || 'Never');
      console.log('Confirmed:', u.email_confirmed_at ? 'Yes' : 'No');
      console.log('---');
    }
  }

  console.log('\nTenant owner ID:', ownerId);
  console.log('Matches any user?', users?.users?.some(u => u.id === ownerId) ? 'YES' : 'NO');
}

check();
