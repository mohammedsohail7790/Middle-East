/**
 * Check a tenant row — requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * Usage: TENANT_ID=<uuid> node check-tenant.js
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const tenantId = process.env.TENANT_ID;

if (!supabaseUrl || !supabaseKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!tenantId) {
  console.error('Set TENANT_ID');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('voice_tenants')
    .select('id, company_name, phone_number, created_at')
    .eq('id', tenantId)
    .single();

  if (error) {
    console.error('Query failed');
    process.exit(1);
  }
  console.log(data);
}

check();
