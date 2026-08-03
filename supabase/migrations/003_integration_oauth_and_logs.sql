-- Migration: Integration OAuth states and audit logs
-- Created: 2026-04-27

-- OAuth state tracking for CSRF protection
create table if not exists public.integration_oauth_states (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.voice_tenants(id) on delete cascade not null,
  provider text not null,
  state text not null unique,
  code_verifier text, -- For PKCE flow
  redirect_uri text not null,
  created_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone default (now() + interval '10 minutes') not null
);

create index idx_oauth_states_state on public.integration_oauth_states(state);
create index idx_oauth_states_tenant on public.integration_oauth_states(tenant_id);
create index idx_oauth_states_expires on public.integration_oauth_states(expires_at);

-- Auto-cleanup expired OAuth states
create or replace function cleanup_expired_oauth_states()
returns void as $$
begin
  delete from public.integration_oauth_states
  where expires_at < now();
end;
$$ language plpgsql;

-- Integration audit log
create table if not exists public.integration_audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.voice_tenants(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete set null,
  provider text not null,
  action text not null, -- 'connected', 'disconnected', 'test_success', 'test_failed', 'token_refreshed'
  metadata jsonb default '{}'::jsonb not null,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone default now() not null
);

create index idx_integration_audit_tenant on public.integration_audit_log(tenant_id);
create index idx_integration_audit_provider on public.integration_audit_log(provider);
create index idx_integration_audit_created on public.integration_audit_log(created_at desc);

-- Integration connection status view
create or replace view public.integration_status as
select
  id as tenant_id,
  company_name,
  -- ServiceTitan
  servicetitan_enabled,
  (servicetitan_api_key is not null) as servicetitan_connected,
  -- Jobber
  jobber_enabled,
  (jobber_api_token is not null) as jobber_connected,
  -- HouseCallPro
  housecallpro_enabled,
  (housecallpro_api_key is not null) as housecallpro_connected,
  -- Salesforce
  salesforce_enabled,
  (salesforce_access_token is not null) as salesforce_connected,
  -- HubSpot
  hubspot_enabled,
  (hubspot_api_key is not null) as hubspot_connected,
  -- Zapier
  (zapier_webhook_url is not null) as zapier_connected
from public.voice_tenants;

-- RLS policies for OAuth states
alter table public.integration_oauth_states enable row level security;

create policy "Users can view their tenant's OAuth states"
  on public.integration_oauth_states for select
  using (
    tenant_id in (
      select id from public.voice_tenants
      where owner_user_id = auth.uid()
    )
  );

create policy "Users can insert OAuth states for their tenant"
  on public.integration_oauth_states for insert
  with check (
    tenant_id in (
      select id from public.voice_tenants
      where owner_user_id = auth.uid()
    )
  );

create policy "Users can delete their tenant's OAuth states"
  on public.integration_oauth_states for delete
  using (
    tenant_id in (
      select id from public.voice_tenants
      where owner_user_id = auth.uid()
    )
  );

-- RLS policies for audit log
alter table public.integration_audit_log enable row level security;

create policy "Users can view their tenant's audit log"
  on public.integration_audit_log for select
  using (
    tenant_id in (
      select id from public.voice_tenants
      where owner_user_id = auth.uid()
    )
  );

create policy "Service role can insert audit logs"
  on public.integration_audit_log for insert
  with check (true);

comment on table public.integration_oauth_states is 'Tracks OAuth state parameters for CSRF protection during integration authorization flows';
comment on table public.integration_audit_log is 'Audit trail of all integration connection/disconnection events';
comment on view public.integration_status is 'Simplified view of integration connection status per tenant';
