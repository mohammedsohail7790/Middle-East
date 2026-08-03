-- Dashboard data flow: schema alignment for appointments, team, leads

-- Appointments: ensure tenant_id exists (safe on DBs that already have it)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE;

-- Team: support full_name (standard column in team_members)
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS full_name TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'team_members' AND column_name = 'name'
  ) THEN
    UPDATE public.team_members SET full_name = COALESCE(full_name, name) WHERE full_name IS NULL;
  END IF;
END $$;

-- Leads: allow appointment_set status in pipeline
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_status_check
  CHECK (status IN ('new', 'contacted', 'qualified', 'appointment_set', 'won', 'lost', 'nurturing'));
