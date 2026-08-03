import pg from 'pg';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(root, '../apps/gateway/.env'), 'utf8');
const url = env.match(/^GATEWAY_DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!url) {
  console.error('GATEWAY_DATABASE_URL not found in apps/gateway/.env');
  process.exit(1);
}

const sql = `
create table if not exists public.integration_audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.voice_tenants(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete set null,
  provider text not null,
  action text not null,
  metadata jsonb default '{}'::jsonb not null,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone default now() not null
);

create index if not exists idx_integration_audit_tenant on public.integration_audit_log(tenant_id);
create index if not exists idx_integration_audit_provider on public.integration_audit_log(provider);
create index if not exists idx_integration_audit_created on public.integration_audit_log(created_at desc);

alter table public.integration_audit_log enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'integration_audit_log'
      and policyname = 'Users can view their tenant''s integration audit logs'
  ) then
    create policy "Users can view their tenant's integration audit logs"
      on public.integration_audit_log for select
      using (
        tenant_id in (
          select id from public.voice_tenants
          where owner_user_id = auth.uid()
        )
      );
  end if;
end $$;
`;

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const before = await pool.query(`SELECT to_regclass('public.integration_audit_log') AS t`);
console.log('Before:', before.rows[0]);
await pool.query(sql);
const after = await pool.query(`SELECT to_regclass('public.integration_audit_log') AS t`);
console.log('After:', after.rows[0]);
console.log('integration_audit_log ready');
await pool.end();
