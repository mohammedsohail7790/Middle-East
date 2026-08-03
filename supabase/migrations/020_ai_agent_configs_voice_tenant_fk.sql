-- Point ai_agent_configs.tenant_id at voice_tenants (production tenant table)
ALTER TABLE public.ai_agent_configs
  DROP CONSTRAINT IF EXISTS ai_agent_configs_tenant_id_fkey;

ALTER TABLE public.ai_agent_configs
  ADD CONSTRAINT ai_agent_configs_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.voice_tenants(id) ON DELETE CASCADE;
