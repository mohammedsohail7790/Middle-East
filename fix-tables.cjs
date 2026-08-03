const { Pool } = require('pg');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const pool = new Pool({
  connectionString: 'postgresql://postgres.btgwgfphgdgnoaqtopwy:8618957790sohail@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    // 1. Create automation_rules table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.automation_rules (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        tenant_id uuid NOT NULL,
        name text NOT NULL,
        trigger text NOT NULL,
        action text NOT NULL,
        template text DEFAULT '',
        delay integer DEFAULT 0,
        enabled boolean DEFAULT true,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      )
    `);
    console.log('✅ automation_rules created');

    // 2. Create team_members table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.team_members (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        tenant_id uuid NOT NULL,
        user_id text,
        email text NOT NULL,
        name text NOT NULL DEFAULT '',
        role text DEFAULT 'member',
        status text DEFAULT 'active',
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      )
    `);
    console.log('✅ team_members created');

    // 3. Check if leads table exists and what columns it has
    const leadsCheck = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'leads'
      ORDER BY ordinal_position
    `);
    console.log('📋 leads columns:', leadsCheck.rows.map(r => r.column_name).join(', '));

    // 4. Check calls table
    const callsCheck = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'calls'
      ORDER BY ordinal_position
    `);
    console.log('📋 calls columns:', callsCheck.rows.map(r => r.column_name).join(', '));

    // 5. Create integration_status table if missing
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.integration_status (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        tenant_id uuid NOT NULL UNIQUE,
        zapier_enabled boolean DEFAULT false,
        zapier_webhook_url text,
        slack_enabled boolean DEFAULT false,
        slack_webhook_url text,
        slack_channel text,
        hubspot_enabled boolean DEFAULT false,
        hubspot_api_key text,
        hubspot_portal_id text,
        salesforce_enabled boolean DEFAULT false,
        salesforce_instance_url text,
        salesforce_access_token text,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      )
    `);
    console.log('✅ integration_status created');

  } catch (e) {
    console.log('❌ Error:', e.message);
  } finally {
    await pool.end();
  }
}

run();
