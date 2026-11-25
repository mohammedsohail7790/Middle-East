-- Allow the Viewer (read-only) role on team members.
-- The invite form offers Admin, Agent and Viewer, but the original check did not list 'viewer',
-- so a Viewer invite was refused by the database.
ALTER TABLE public.team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
ALTER TABLE public.team_members
  ADD CONSTRAINT team_members_role_check
  CHECK (role IN ('owner', 'admin', 'manager', 'agent', 'viewer'));
