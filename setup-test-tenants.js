import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:8618957790sohail@db.btgwgfphgdgnoaqtopwy.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function setupTestTenants() {
  try {
    const client = await pool.connect();
    
    console.log('\n🔧 Setting up test tenants for multi-tenant voice system...\n');
    
    // Update existing Call IQ tenant with proper configuration
    console.log('1️⃣ Updating Call IQ tenant (HVAC example)...');
    await client.query(`
      UPDATE public.voice_tenants
      SET 
        system_prompt = $1,
        voice_id = $2,
        voice_services = $3::jsonb,
        voice_tone = $4,
        voice_questions = $5::jsonb,
        settings = $6::jsonb,
        updated_at = NOW()
      WHERE id = '2a9ea1e6-fa09-497c-8107-e704af6b1802'
    `, [
      'You are Sarah, a friendly and professional AI receptionist for Call IQ, an HVAC service company. You help customers with AC repair, heating installation, maintenance plans, and emergency services. Always be warm, empathetic, and helpful. Ask for their name, phone number, the service they need, and their preferred appointment time. If they mention an emergency (no heat in winter, no AC in extreme heat), prioritize urgency.',
      '21m00Tcm4TlvDq8ikWAM', // Rachel voice (already in .env)
      JSON.stringify(['AC Repair', 'Heating Installation', 'Maintenance Plans', 'Emergency Service', 'Duct Cleaning']),
      'warm, friendly, and professional',
      JSON.stringify([
        'What is your name?',
        'What phone number can we reach you at?',
        'What service do you need help with today?',
        'When would you like us to come out?'
      ]),
      JSON.stringify({
        greeting: 'Thank you for calling Call IQ! This is Sarah. How can I help you today?',
        max_call_duration_ms: 900000,
        silence_timeout_ms: 6000,
        enable_booking: true
      })
    ]);
    console.log('   ✅ Call IQ tenant updated');
    
    // Check if we need to create additional test tenants
    console.log('\n2️⃣ Checking for additional test tenants...');
    const existingTenants = await client.query(`
      SELECT phone_number FROM public.voice_tenants 
      WHERE phone_number IN ('+15551234567', '+15559876543')
    `);
    
    const existingPhones = existingTenants.rows.map(r => r.phone_number);
    
    // Create HVAC test tenant if doesn't exist
    if (!existingPhones.includes('+15551234567')) {
      console.log('   Creating Cool Air HVAC test tenant...');
      await client.query(`
        INSERT INTO public.voice_tenants (
          owner_user_id,
          company_name,
          phone_number,
          system_prompt,
          voice_id,
          voice_services,
          voice_tone,
          voice_questions,
          default_language,
          timezone,
          diagnostic_fee,
          settings
        ) VALUES (
          (SELECT id FROM auth.users LIMIT 1),
          'Cool Air HVAC',
          '+15551234567',
          $1,
          $2,
          $3::jsonb,
          'warm and friendly',
          $4::jsonb,
          'en',
          'America/New_York',
          125,
          $5::jsonb
        )
      `, [
        'You are Sarah, a friendly HVAC receptionist for Cool Air HVAC. You help customers with AC repair, heating installation, and maintenance plans. Always be warm and empathetic.',
        '21m00Tcm4TlvDq8ikWAM',
        JSON.stringify(['AC Repair', 'Heating Installation', 'Maintenance Plans']),
        JSON.stringify(['What is your name?', 'What phone number?', 'What service?', 'Preferred time?']),
        JSON.stringify({ greeting: 'Thank you for calling Cool Air HVAC! This is Sarah.' })
      ]);
      console.log('   ✅ Cool Air HVAC created');
    } else {
      console.log('   ℹ️  Cool Air HVAC already exists');
    }
    
    // Create Plumbing test tenant if doesn't exist
    if (!existingPhones.includes('+15559876543')) {
      console.log('   Creating Pro Plumbing test tenant...');
      await client.query(`
        INSERT INTO public.voice_tenants (
          owner_user_id,
          company_name,
          phone_number,
          system_prompt,
          voice_id,
          voice_services,
          voice_tone,
          voice_questions,
          default_language,
          timezone,
          diagnostic_fee,
          settings
        ) VALUES (
          (SELECT id FROM auth.users LIMIT 1),
          'Pro Plumbing',
          '+15559876543',
          $1,
          $2,
          $3::jsonb,
          'professional and direct',
          $4::jsonb,
          'en',
          'America/Los_Angeles',
          150,
          $5::jsonb
        )
      `, [
        'You are Mike, a professional plumbing dispatcher for Pro Plumbing. You handle leak repairs, drain cleaning, and water heater installations. Be direct, professional, and solution-focused.',
        '21m00Tcm4TlvDq8ikWAM', // Using same voice for now, can be changed
        JSON.stringify(['Leak Repair', 'Drain Cleaning', 'Water Heater Installation', 'Pipe Replacement']),
        JSON.stringify(['Your name?', 'Phone number?', 'What plumbing issue?', 'When do you need service?']),
        JSON.stringify({ greeting: 'Pro Plumbing, this is Mike. What plumbing issue can I help you with?' })
      ]);
      console.log('   ✅ Pro Plumbing created');
    } else {
      console.log('   ℹ️  Pro Plumbing already exists');
    }
    
    console.log('\n📋 Final tenant list:\n');
    const allTenants = await client.query(`
      SELECT 
        id, 
        company_name, 
        phone_number, 
        CASE WHEN system_prompt IS NOT NULL THEN 'SET' ELSE 'NULL' END as prompt_status,
        voice_id,
        default_language
      FROM public.voice_tenants
      ORDER BY created_at;
    `);
    
    allTenants.rows.forEach((tenant, idx) => {
      console.log(`${idx + 1}. ${tenant.company_name}`);
      console.log(`   Phone: ${tenant.phone_number}`);
      console.log(`   Prompt: ${tenant.prompt_status}`);
      console.log(`   Voice: ${tenant.voice_id || 'NULL'}`);
      console.log(`   Language: ${tenant.default_language}`);
      console.log('');
    });
    
    console.log('✅ Multi-tenant setup complete!\n');
    console.log('🧪 Test by calling:');
    console.log('   - +19193715609 → Call IQ (Sarah, HVAC)');
    console.log('   - +15551234567 → Cool Air HVAC (Sarah, HVAC)');
    console.log('   - +15559876543 → Pro Plumbing (Mike, Plumbing)\n');
    
    client.release();
    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

setupTestTenants();
