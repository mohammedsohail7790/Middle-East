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

/** Minimal slice of 003 — oauth_states only (full 003 fails if integration_status view differs). */
const sql = `
create table if not exists public.integration_oauth_states (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.voice_tenants(id) on delete cascade not null,
  provider text not null,
  state text not null unique,
  code_verifier text,
  redirect_uri text not null,
  created_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone default (now() + interval '10 minutes') not null
);

create index if not exists idx_oauth_states_state on public.integration_oauth_states(state);
create index if not exists idx_oauth_states_tenant on public.integration_oauth_states(tenant_id);
create index if not exists idx_oauth_states_expires on public.integration_oauth_states(expires_at);

create or replace function cleanup_expired_oauth_states()
returns void as $$
begin
  delete from public.integration_oauth_states
  where expires_at < now();
end;
$$ language plpgsql;

alter table public.integration_oauth_states enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'integration_oauth_states'
      and policyname = 'Users can view their tenant''s OAuth states'
  ) then
    create policy "Users can view their tenant's OAuth states"
      on public.integration_oauth_states for select
      using (
        tenant_id in (
          select id from public.voice_tenants
          where owner_user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'integration_oauth_states'
      and policyname = 'Users can insert OAuth states for their tenant'
  ) then
    create policy "Users can insert OAuth states for their tenant"
      on public.integration_oauth_states for insert
      with check (
        tenant_id in (
          select id from public.voice_tenants
          where owner_user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'integration_oauth_states'
      and policyname = 'Users can delete their tenant''s OAuth states'
  ) then
    create policy "Users can delete their tenant's OAuth states"
      on public.integration_oauth_states for delete
      using (
        tenant_id in (
          select id from public.voice_tenants
          where owner_user_id = auth.uid()
        )
      );
  end if;
end $$;

comment on table public.integration_oauth_states is
  'Tracks OAuth state parameters for CSRF protection during integration authorization flows';
`;

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

const before = await pool.query(
  `SELECT to_regclass('public.integration_oauth_states') AS oauth_states`
);
console.log('Before:', before.rows[0]);

await pool.query(sql);

const after = await pool.query(
  `SELECT to_regclass('public.integration_oauth_states') AS oauth_states`
);
console.log('After:', after.rows[0]);
console.log('integration_oauth_states ready');
await pool.end();
