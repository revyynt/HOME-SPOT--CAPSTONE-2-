-- Allow anonymous public visitors and authenticated users to read platform system settings
drop policy if exists "anyone can read system settings" on public.app_documents;

create policy "anyone can read system settings"
  on public.app_documents
  for select
  to anon, authenticated
  using (
    collection = 'adminTokens'
    and id = 'system_settings'
  );
