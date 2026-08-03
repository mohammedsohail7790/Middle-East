// Fix tenant configuration with proper AI settings
import pg from 'pg';
const { Client } = pg;

if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL env var');
    process.exit(1);
}

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function fixTenant() {
    try {
        await client.connect();
        console.log('✅ Connected to database');

        // Update tenant with proper configuration
        const result = await client.query(`
            UPDATE public.voice_tenants
            SET 
                voice_tone = $1,
                voice_services = $2::jsonb,
                voice_questions = $3::jsonb,
                updated_at = now()
            WHERE id = $4::uuid
            RETURNING id, company_name, voice_tone, voice_services, voice_questions
        `, [
            'friendly, professional, and helpful. Keep responses concise and conversational.',
            JSON.stringify([
                "HVAC Repair",
                "AC Installation", 
                "Heating Service",
                "Plumbing",
                "Electrical Work",
                "Emergency Service"
            ]),
            JSON.stringify([
                "Hi! How can I help you today?",
                "What service do you need?",
                "What is your name?",
                "What is the best phone number to reach you?",
                "When would you like us to come out?"
            ]),
            '2a9ea1e6-fa09-497c-8107-e704af6b1802'
        ]);

        console.log('✅ Tenant updated:');
        console.log(result.rows[0]);

        // Verify the configuration
        const verify = await client.query(`
            SELECT 
                id,
                company_name,
                phone_number,
                voice_tone,
                voice_services,
                voice_questions,
                call_handling_mode,
                default_language
            FROM public.voice_tenants
            WHERE id = $1::uuid
        `, ['2a9ea1e6-fa09-497c-8107-e704af6b1802']);

        console.log('\n✅ Final configuration:');
        console.log(JSON.stringify(verify.rows[0], null, 2));
        console.log('\n🎉 Tenant is now properly configured!');
        console.log('📞 Try calling again: +1 (919) 371-5609');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

fixTenant();
