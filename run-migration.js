import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL env var');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  try {
    console.log('Reading migration file...');
    const sql = fs.readFileSync('supabase/migrations/008_multi_tenant_voice_improvements.sql', 'utf8');
    
    console.log('Connecting to database...');
    const client = await pool.connect();
    
    console.log('Running migration...');
    await client.query(sql);
    
    console.log('✅ Migration completed successfully!');
    
    client.release();
    await pool.end();
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runMigration();
