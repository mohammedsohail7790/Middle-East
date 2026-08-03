-- ORG-001: Organization fields on the tenant boundary (ADR-001).
-- Organization == voice_tenants. Add slug + description only.

ALTER TABLE public.voice_tenants
  ADD COLUMN IF NOT EXISTS org_slug text,
  ADD COLUMN IF NOT EXISTS org_description text;

COMMENT ON COLUMN public.voice_tenants.org_slug IS 'Stable URL slug for the organization (ORG-001)';
COMMENT ON COLUMN public.voice_tenants.org_description IS 'Optional organization description (ORG-001)';

COMMENT ON TABLE public.voice_tenants IS
  'Organization / tenant root boundary (ADR-001). Product organization maps 1:1 here. Ownership: owner_user_id.';

-- Unique slug when present
CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_tenants_org_slug
  ON public.voice_tenants (org_slug)
  WHERE org_slug IS NOT NULL AND length(trim(org_slug)) > 0;

-- Backfill slugs for existing tenants (best-effort, collision-safe via id suffix)
UPDATE public.voice_tenants
SET org_slug = lower(
  regexp_replace(
    regexp_replace(trim(company_name), '[^a-zA-Z0-9]+', '-', 'g'),
    '(^-+|-+$)',
    '',
    'g'
  )
) || '-' || substr(replace(id::text, '-', ''), 1, 8)
WHERE org_slug IS NULL
  AND company_name IS NOT NULL
  AND length(trim(company_name)) > 0;
