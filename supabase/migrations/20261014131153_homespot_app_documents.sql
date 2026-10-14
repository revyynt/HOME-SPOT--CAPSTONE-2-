create table public.app_documents (
  collection text not null check (
    collection in (
      'rooms',
      'reservations',
      'messages',
      'tenants',
      'users',
      'payments',
      'adminTokens',
      'inquiries'
    )
  ),
  id text not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);

create index app_documents_collection_created_at_idx
  on public.app_documents (collection, (data ->> 'createdAt') desc);

create index app_documents_collection_email_idx
  on public.app_documents (collection, (data ->> 'email'));

create index app_documents_collection_uid_idx
  on public.app_documents (collection, (data ->> 'uid'));

alter table public.app_documents enable row level security;

grant select, insert, update, delete on public.app_documents to anon, authenticated;

create policy "public and authorized users read documents"
  on public.app_documents
  for select
  to anon, authenticated
  using (
    collection = 'rooms'
    or (
      (select auth.jwt()) -> 'app_metadata' ->> 'role' in ('admin', 'superadmin')
      and collection in ('reservations', 'messages', 'tenants', 'users', 'payments', 'adminTokens', 'inquiries')
    )
    or (
      (select auth.uid()) is not null
      and collection = 'messages'
      and data ->> 'email' = (select auth.jwt()) ->> 'email'
    )
    or (
      (select auth.uid()) is not null
      and collection = 'tenants'
      and (
        data ->> 'uid' = (select auth.uid())::text
        or lower(data ->> 'email') = lower((select auth.jwt()) ->> 'email')
      )
    )
    or (
      (select auth.uid()) is not null
      and collection = 'payments'
      and (
        data ->> 'tenantUid' = (select auth.uid())::text
        or lower(data ->> 'tenantEmail') = lower((select auth.jwt()) ->> 'email')
      )
    )
    or (
      (select auth.uid()) is not null
      and collection = 'users'
      and id = (select auth.uid())::text
    )
  );

create policy "public can submit reservations"
  on public.app_documents
  for insert
  to anon, authenticated
  with check (
    collection = 'reservations'
    and (data - array['name', 'email', 'phone', 'room', 'moveInDate', 'message', 'additionalInfo', 'status', 'createdAt']) = '{}'::jsonb
    and jsonb_typeof(data -> 'name') = 'string'
    and length(data ->> 'name') between 1 and 120
    and jsonb_typeof(data -> 'email') = 'string'
    and length(data ->> 'email') between 1 and 200
    and jsonb_typeof(data -> 'room') = 'string'
    and length(data ->> 'room') between 1 and 120
    and data ->> 'status' = 'Pending'
  );

create policy "public can submit inquiries"
  on public.app_documents
  for insert
  to anon
  with check (
    collection = 'messages'
    and (data - array['name', 'email', 'phone', 'room', 'moveInDate', 'message', 'status', 'createdAt']) = '{}'::jsonb
    and jsonb_typeof(data -> 'name') = 'string'
    and length(data ->> 'name') between 1 and 120
    and jsonb_typeof(data -> 'email') = 'string'
    and length(data ->> 'email') between 1 and 200
    and jsonb_typeof(data -> 'room') = 'string'
    and length(data ->> 'room') between 1 and 120
    and data ->> 'status' = 'New'
  );

create policy "tenant and staff can send messages"
  on public.app_documents
  for insert
  to authenticated
  with check (
    collection = 'messages'
    and jsonb_typeof(data -> 'message') = 'string'
    and length(data ->> 'message') between 1 and 4000
    and (
      (select auth.jwt()) -> 'app_metadata' ->> 'role' in ('admin', 'superadmin')
      or (
        data ->> 'email' = (select auth.jwt()) ->> 'email'
        and data ->> 'sender' = 'tenant'
        and data ->> 'status' = 'Unread'
        and data -> 'reply' = 'null'::jsonb
        and (data - array['name', 'email', 'message', 'status', 'sender', 'createdAt', 'reply']) = '{}'::jsonb
      )
    )
  );

create policy "staff can write room and reservation records"
  on public.app_documents
  for insert
  to authenticated
  with check (
    (select auth.jwt()) -> 'app_metadata' ->> 'role' in ('admin', 'superadmin')
    and collection = 'rooms'
  );

create policy "users can create their own tenant profile"
  on public.app_documents
  for insert
  to authenticated
  with check (
    collection = 'users'
    and id = (select auth.uid())::text
    and data ->> 'role' = 'tenant'
  );

create policy "staff can update operational records"
  on public.app_documents
  for update
  to authenticated
  using (
    (select auth.jwt()) -> 'app_metadata' ->> 'role' in ('admin', 'superadmin')
    and collection in ('rooms', 'reservations', 'messages', 'tenants', 'adminTokens', 'inquiries')
  )
  with check (
    (select auth.jwt()) -> 'app_metadata' ->> 'role' in ('admin', 'superadmin')
    and collection in ('rooms', 'reservations', 'messages', 'tenants', 'adminTokens', 'inquiries')
  );

create policy "superadmins can update user records"
  on public.app_documents
  for update
  to authenticated
  using (
    collection = 'users'
    and (select auth.jwt()) -> 'app_metadata' ->> 'role' = 'superadmin'
  )
  with check (
    collection = 'users'
    and (select auth.jwt()) -> 'app_metadata' ->> 'role' = 'superadmin'
  );

create policy "staff can delete operational records"
  on public.app_documents
  for delete
  to authenticated
  using (
    (select auth.jwt()) -> 'app_metadata' ->> 'role' in ('admin', 'superadmin')
    and collection in ('rooms', 'reservations', 'messages', 'adminTokens', 'inquiries')
  );

create policy "superadmins can delete tenant and user records"
  on public.app_documents
  for delete
  to authenticated
  using (
    (select auth.jwt()) -> 'app_metadata' ->> 'role' = 'superadmin'
    and collection in ('tenants', 'users')
  );

insert into public.app_documents (collection, id, data)
values
  ('rooms', 'triple-occupancy-room', '{"name":"Triple Occupancy Room","available":3}'::jsonb),
  ('rooms', 'commercial-space', '{"name":"Commercial Space","available":1}'::jsonb);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_documents'
  ) then
    alter publication supabase_realtime add table public.app_documents;
  end if;
end;
$$;
