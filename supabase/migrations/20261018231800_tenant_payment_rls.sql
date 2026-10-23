-- Migration: Allow authenticated tenants to insert their verified payment records
drop policy if exists "tenants can insert own payments" on public.payments;
create policy "tenants can insert own payments"
  on public.payments for insert to authenticated
  with check (
    lower(tenant_email) = lower((select auth.jwt() ->> 'email'))
    or tenant_uid = (select auth.uid())
    or public.is_staff()
  );

drop policy if exists "tenants can insert own payment documents" on public.app_documents;
create policy "tenants can insert own payment documents"
  on public.app_documents for insert to authenticated
  with check (
    collection = 'payments'
    and (
      lower(data ->> 'tenantEmail') = lower((select auth.jwt() ->> 'email'))
      or (data ->> 'tenantUid') = (select auth.uid())::text
      or public.is_staff()
    )
  );
