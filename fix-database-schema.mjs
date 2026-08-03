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

async function fixSchema() {
    try {
        console.log('🔧 Checking and fixing database schema...\n');
        
        // Check if call_handling_mode column exists
        const checkColumn = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'voice_tenants' 
            AND column_name = 'call_handling_mode'
        `);
        
        if (checkColumn.rows.length === 0) {
            console.log('❌ Column call_handling_mode does not exist');
            console.log('✅ Adding call_handling_mode column...');
            
            await pool.query(`
                ALTER TABLE public.voice_tenants 
                ADD COLUMN IF NOT EXISTS call_handling_mode text 
                DEFAULT 'message' 
                NOT NULL 
                CHECK (call_handling_mode IN ('message', 'transfer', 'both'))
            `);
            
            console.log('✅ Column added successfully!\n');
        } else {
            console.log('✅ Column call_handling_mode already exists\n');
        }
        
        // Verify the fix
        const verify = await pool.query(`
            SELECT 
                id,
                company_name,
                call_handling_mode
            FROM public.voice_tenants
            WHERE id = '2a9ea1e6-fa09-497c-8107-e704af6b1802'
        `);
        
        if (verify.rows.length > 0) {
            console.log('✅ Verification successful!');
            console.log('Tenant data:', JSON.stringify(verify.rows[0], null, 2));
        } else {
            console.log('⚠️  Tenant not found');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        await pool.end();
    }
}

fixSchema();
