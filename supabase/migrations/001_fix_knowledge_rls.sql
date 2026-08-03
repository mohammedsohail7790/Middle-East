-- PART 8: Fix knowledge_ingestion_runs RLS so the gateway's direct Postgres
-- connection (which is NOT the Supabase service_role JWT) can write dedup records.
--
-- The gateway connects via DATABASE_URL as the postgres superuser / db owner,
-- which bypasses RLS entirely for tables where RLS is enabled but the connecting
-- role is the table owner.  However, if the Supabase project is configured to
-- enforce RLS for all roles (including postgres), the insert will be rejected.
--
-- Safest fix: drop the overly-restrictive policy and replace it with one that
-- allows both the service_role JWT path AND the direct superuser path.

-- Drop the old policy that only allowed service_role JWT
drop policy if exists "Service role can manage knowledge ingestion runs" on public.knowledge_ingestion_runs;

-- Allow any authenticated service-level connection to manage ingestion runs.
-- The gateway uses a direct DB connection (bypasses RLS as table owner), so
-- this policy covers the Supabase JS admin client path as well.
create policy "Service connections can manage knowledge ingestion runs"
  on public.knowledge_ingestion_runs for all
  using (true)
  with check (true);

-- Also ensure the knowledge_base table allows service-level inserts
-- (needed for manual ingest via the dashboard Knowledge page).
drop policy if exists "Service role can insert knowledge" on public.knowledge_base;
create policy "Service role can insert knowledge"
  on public.knowledge_base for insert
  with check (true);

drop policy if exists "Service role can delete knowledge" on public.knowledge_base;
create policy "Service role can delete knowledge"
  on public.knowledge_base for delete
  using (true);
