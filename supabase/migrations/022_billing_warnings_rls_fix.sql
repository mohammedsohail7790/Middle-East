-- Fix billing_warnings RLS to use voice_tenants.owner_user_id (not auth.uid() as tenant_id)

DROP POLICY IF EXISTS billing_warnings_tenant_isolation ON public.billing_warnings;
CREATE POLICY billing_warnings_tenant_isolation ON public.billing_warnings
  FOR ALL USING (
    tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS minutes_accounting_tenant_isolation ON public.minutes_accounting;
CREATE POLICY minutes_accounting_tenant_isolation ON public.minutes_accounting
  FOR ALL USING (
    tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid())
  );
