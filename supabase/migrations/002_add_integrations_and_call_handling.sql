-- Migration: Add integration fields and call handling mode
-- Created: 2026-04-27

-- Add call handling mode
alter table public.voice_tenants 
add column if not exists call_handling_mode text default 'message' not null 
check (call_handling_mode in ('message', 'transfer', 'both'));

-- ServiceTitan integration
alter table public.voice_tenants add column if not exists servicetitan_enabled boolean default false not null;
alter table public.voice_tenants add column if not exists servicetitan_api_key text;
alter table public.voice_tenants add column if not exists servicetitan_tenant_id text;
alter table public.voice_tenants add column if not exists servicetitan_client_id text;
alter table public.voice_tenants add column if not exists servicetitan_client_secret text;
alter table public.voice_tenants add column if not exists servicetitan_app_key text;

-- Jobber integration
alter table public.voice_tenants add column if not exists jobber_enabled boolean default false not null;
alter table public.voice_tenants add column if not exists jobber_api_token text;
alter table public.voice_tenants add column if not exists jobber_account_id text;

-- HouseCallPro integration
alter table public.voice_tenants add column if not exists housecallpro_enabled boolean default false not null;
alter table public.voice_tenants add column if not exists housecallpro_api_key text;
alter table public.voice_tenants add column if not exists housecallpro_company_id text;

-- Salesforce integration
alter table public.voice_tenants add column if not exists salesforce_enabled boolean default false not null;
alter table public.voice_tenants add column if not exists salesforce_instance_url text;
alter table public.voice_tenants add column if not exists salesforce_access_token text;
alter table public.voice_tenants add column if not exists salesforce_refresh_token text;

-- HubSpot integration
alter table public.voice_tenants add column if not exists hubspot_enabled boolean default false not null;
alter table public.voice_tenants add column if not exists hubspot_api_key text;
alter table public.voice_tenants add column if not exists hubspot_portal_id text;

-- Generic webhook fallback
alter table public.voice_tenants add column if not exists custom_webhook_url text;
alter table public.voice_tenants add column if not exists custom_webhook_headers jsonb default '{}'::jsonb not null;

-- Add index for faster integration lookups
create index if not exists idx_voice_tenants_integrations on public.voice_tenants(
  servicetitan_enabled,
  jobber_enabled,
  housecallpro_enabled,
  salesforce_enabled,
  hubspot_enabled
) where servicetitan_enabled or jobber_enabled or housecallpro_enabled or salesforce_enabled or hubspot_enabled;

comment on column public.voice_tenants.call_handling_mode is 'How to handle incoming calls: message (take message), transfer (transfer to human), both (ask caller)';
comment on column public.voice_tenants.servicetitan_enabled is 'Enable ServiceTitan integration for job creation';
comment on column public.voice_tenants.jobber_enabled is 'Enable Jobber integration for client and job request creation';
comment on column public.voice_tenants.housecallpro_enabled is 'Enable HouseCallPro integration for customer and job creation';
comment on column public.voice_tenants.salesforce_enabled is 'Enable Salesforce integration for lead creation';
comment on column public.voice_tenants.hubspot_enabled is 'Enable HubSpot integration for contact and deal creation';
