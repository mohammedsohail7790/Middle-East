-- ORG-001: Organizations as tenancy boundary (ADR-001)
-- Extend 031 organizations; add organization_members; sync voice_tenants.id = organizations.id

-- ── organizations columns ───────────────────────────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Ensure timestamps exist
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_slug_unique
  ON public.organizations (slug)
  WHERE slug IS NOT NULL AND length(trim(slug)) > 0;

CREATE INDEX IF NOT EXISTS idx_organizations_created_by
  ON public.organizations (created_by);

COMMENT ON TABLE public.organizations IS
  'Root tenancy boundary (ADR-001). Organization == Tenant. Call IQ voice_tenants.id matches organizations.id 1:1.';

-- ── organization_members (tenancy: ORG-001 owner row; invites = ORG-002) ─
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner'
    CHECK (role = 'owner'),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

-- ORG-001: role is owner-only; ORG-002 will widen the CHECK for admin/member
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.organization_members'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%role%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.organization_members DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE public.organization_members
    ADD CONSTRAINT organization_members_role_check CHECK (role = 'owner');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_organization_members_user
  ON public.organization_members (user_id);

CREATE INDEX IF NOT EXISTS idx_organization_members_org
  ON public.organization_members (organization_id);

COMMENT ON TABLE public.organization_members IS
  'Organization membership. Ownership is role=owner here (not a separate owner_id column).';

-- org_slug / org_description on voice_tenants and their unique index are
-- added by migration 062_org_001_slug_description.sql — not repeated here.

-- ── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.user_is_org_member(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = p_org_id
      AND m.user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS organizations_select_member ON public.organizations;
CREATE POLICY organizations_select_member
  ON public.organizations FOR SELECT
  USING (public.user_is_org_member(id));

DROP POLICY IF EXISTS organizations_insert_authenticated ON public.organizations;
CREATE POLICY organizations_insert_authenticated
  ON public.organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

DROP POLICY IF EXISTS organizations_update_member ON public.organizations;
CREATE POLICY organizations_update_member
  ON public.organizations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = organizations.id
        AND m.user_id = auth.uid()
        AND m.role = 'owner'
    )
  );

DROP POLICY IF EXISTS organization_members_select_own_org ON public.organization_members;
CREATE POLICY organization_members_select_own_org
  ON public.organization_members FOR SELECT
  USING (public.user_is_org_member(organization_id));

DROP POLICY IF EXISTS organization_members_insert_self_owner ON public.organization_members;
CREATE POLICY organization_members_insert_self_owner
  ON public.organization_members FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND role = 'owner'
  );

-- Service role bypasses RLS via role; gateway uses service connection.
