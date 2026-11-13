-- A client's project status link can be switched off without changing the secret that every other link depends on:
-- the link carries the version it was made with, and "revoke links" raises the project's version, so older links stop working.
ALTER TABLE public.consultancy_projects ADD COLUMN IF NOT EXISTS link_version INTEGER NOT NULL DEFAULT 1;
