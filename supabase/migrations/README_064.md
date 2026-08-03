# Applying migration 064

This migration was written and reviewed but not applied to any live database
from the authoring session (no DATABASE_URL was available there by design).

To apply:

    DATABASE_URL="postgresql://postgres:<password>@<host>:5432/postgres" node run-migration.js

(`run-migration.js` currently points at migration 008 by filename — update the
`fs.readFileSync(...)` path in that script to `supabase/migrations/064_gcc_phase1_skeleton.sql`
before running, or pass the path as an argument if the script has been
generalized by then.)

Verify with:

    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE 'crm_%' OR table_name = 'channel_connections';
