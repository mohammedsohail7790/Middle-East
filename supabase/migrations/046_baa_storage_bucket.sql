-- Migration 046: BAA Documents Storage RLS Policies
--
-- IMPORTANT — CREATE THE BUCKET FIRST (one-time manual step):
--   Supabase Dashboard → Storage → New bucket
--     Name:    baa-documents
--     Public:  OFF (private)
--     Max file size: 10 MB
--     Allowed MIME types: application/pdf
--
-- Run this migration AFTER the bucket exists.
-- It adds RLS policies so:
--   • The gateway service role can upload/read/delete
--   • Authenticated tenant owners/admins can only read their own folder
--   • No direct client uploads

-- Service role — full access to baa-documents bucket
DROP POLICY IF EXISTS "baa_documents_service_role_all" ON storage.objects;
CREATE POLICY "baa_documents_service_role_all"
  ON storage.objects FOR ALL
  TO service_role
  USING  (bucket_id = 'baa-documents')
  WITH CHECK (bucket_id = 'baa-documents');

-- Tenant owners and admins — read their own folder only
-- Storage path: {tenantId}/{version}/{timestamp}.pdf
-- The first path segment is the tenantId.
DROP POLICY IF EXISTS "baa_documents_tenant_select" ON storage.objects;
CREATE POLICY "baa_documents_tenant_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'baa-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text
        FROM public.voice_tenants
       WHERE owner_user_id = auth.uid()
      UNION
      SELECT tenant_id::text
        FROM public.team_members
       WHERE user_id = auth.uid()
         AND role IN ('owner', 'admin')
    )
  );
