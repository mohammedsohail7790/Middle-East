import pg from 'pg';
const { Pool } = pg;

if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL env var');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function testQuery() {
    try {
        const query = `
            select
                id as tenant_id,
                coalesce(company_name, 'Business') as business_name,
                coalesce(voice_services, '[]'::jsonb) as services,
                coalesce(voice_tone, 'friendly') as tone,
                coalesce(voice_questions, '[]'::jsonb) as questions,
                coalesce(default_language, 'en') as default_language,
                coalesce(timezone, 'UTC') as timezone,
                coalesce(diagnostic_fee, 125) as diagnostic_fee,
                transfer_phone_number,
                coalesce(call_handling_mode, 'message') as call_handling_mode,
                zapier_webhook_url
            from public.voice_tenants
            where id = $1
            limit 1
        `;
        
        const result = await pool.query(query, ['2a9ea1e6-fa09-497c-8107-e704af6b1802']);
        
        console.log('✅ Query successful!');
        console.log('Result:', JSON.stringify(result.rows[0], null, 2));
        
    } catch (error) {
        console.error('❌ Query failed:', error.message);
        console.error('Error details:', error);
    } finally {
        await pool.end();
    }
}

testQuery();
