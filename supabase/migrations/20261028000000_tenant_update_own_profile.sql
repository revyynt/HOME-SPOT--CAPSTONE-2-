-- Migration: Allow authenticated tenants to update their own tenant profile record
drop policy if exists "tenants can update own tenant document" on public.app_documents;
create policy "tenants can update own tenant document"
  on public.app_documents
  for update
  to authenticated
  using (
    collection = 'tenants'
    and (
      (data ->> 'uid') = (select auth.uid())::text
      or lower(data ->> 'email') = lower((select auth.jwt()) ->> 'email')
    )
  )
  with check (
    collection = 'tenants'
    and (
      (data ->> 'uid') = (select auth.uid())::text
      or lower(data ->> 'email') = lower((select auth.jwt()) ->> 'email')
    )
  );

drop policy if exists "tenants can update own record" on public.tenants;
create policy "tenants can update own record"
  on public.tenants
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    or lower(email) = lower((select auth.jwt()) ->> 'email')
  )
  with check (
    user_id = (select auth.uid())
    or lower(email) = lower((select auth.jwt()) ->> 'email')
  );
