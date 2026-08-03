/**
 * One-off bootstrap for ai_agent_configs (JSONB array columns).
 * Usage: DATABASE_URL=postgresql://... node create-ai-config-table.cjs
 */
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Set DATABASE_URL');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
});

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.ai_agent_configs (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        tenant_id uuid NOT NULL UNIQUE,
        model text DEFAULT 'gpt-4o',
        temperature numeric DEFAULT 0.7,
        max_tokens integer DEFAULT 150,
        agent_name text DEFAULT 'Sarah',
        personality text DEFAULT 'friendly, professional, and helpful',
        tone text DEFAULT 'professional',
        speaking_style text DEFAULT 'concise and clear',
        business_description text,
        services_offered jsonb DEFAULT '[]',
        service_areas jsonb DEFAULT '[]',
        business_hours_description text,
        greeting_message text,
        qualification_questions jsonb DEFAULT '[]',
        required_fields jsonb DEFAULT '["name", "phone"]',
        optional_fields jsonb DEFAULT '["email", "preferred_time"]',
        max_conversation_turns integer DEFAULT 20,
        auto_transfer_enabled boolean DEFAULT false,
        transfer_conditions jsonb,
        fallback_message text,
        system_instructions text,
        do_instructions jsonb DEFAULT '[]',
        dont_instructions jsonb DEFAULT '[]',
        faq_enabled boolean DEFAULT true,
        custom_knowledge text,
        auto_create_lead boolean DEFAULT true,
        auto_schedule_appointment boolean DEFAULT false,
        auto_send_confirmation boolean DEFAULT true,
        sentiment_analysis_enabled boolean DEFAULT true,
        language text DEFAULT 'en',
        voice_id text,
        speech_rate numeric DEFAULT 1.0,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      )
    `);
    console.log('ai_agent_configs table ready');
  } catch (e) {
    console.error('Error:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
