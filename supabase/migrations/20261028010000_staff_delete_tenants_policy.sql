-- Allow staff (admin and superadmin) to delete tenant and user records in app_documents
-- so client-side fallback deletion works identically to public.tenants RLS.

drop policy if exists "staff can delete operational records" on public.app_documents;

create policy "staff can delete operational records"
  on public.app_documents
  for delete
  to authenticated
  using (
    (select auth.jwt()) -> 'app_metadata' ->> 'role' in ('admin', 'superadmin')
    and collection in ('rooms', 'reservations', 'messages', 'tenants', 'users', 'adminTokens', 'inquiries')
  );

