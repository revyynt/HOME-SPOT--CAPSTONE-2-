-- ==============================================================================
-- HomeSpot (MJP Residences) - Complete Supabase Backup Schema
-- ==============================================================================
-- How to restore if your Supabase project is ever deleted or reset:
-- 1. Open Supabase Dashboard -> SQL Editor -> New Query
-- 2. Paste or import this entire file and click "Run"
-- 3. All tables, indexes, RLS policies, storage buckets, realtime publications,
--    sync triggers, and default room seeds will be created automatically.
-- ==============================================================================

-- ==============================================================================
-- 1. CORE DOCUMENT STORE (public.app_documents)
-- ==============================================================================
create table if not exists public.app_documents (
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

create index if not exists app_documents_collection_created_at_idx
  on public.app_documents (collection, (data ->> 'createdAt') desc);

create index if not exists app_documents_collection_email_idx
  on public.app_documents (collection, (data ->> 'email'));

create index if not exists app_documents_collection_uid_idx
  on public.app_documents (collection, (data ->> 'uid'));

-- ==============================================================================
-- 2. RELATIONAL SYSTEM TABLES
-- ==============================================================================

-- 2.1 ROOMS TABLE
create table if not exists public.rooms (
  id text primary key,
  name text not null,
  available integer not null default 0 check (available >= 0),
  price numeric(10, 2) null check (price is null or price >= 0),
  amenities text[] null default '{}',
  detail_id integer null,
  type text null,
  badge text null,
  image text null,
  main_image text null,
  panorama text null,
  images text[] null default '{}',
  description text null,
  size text null,
  capacity integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rooms
  add column if not exists detail_id integer null,
  add column if not exists type text null,
  add column if not exists badge text null,
  add column if not exists image text null,
  add column if not exists main_image text null,
  add column if not exists panorama text null,
  add column if not exists images text[] null default '{}',
  add column if not exists description text null,
  add column if not exists size text null,
  add column if not exists capacity integer null;

-- 2.2 USER PROFILES TABLE (Linked to auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text null,
  role text not null default 'tenant' check (role in ('superadmin', 'admin', 'tenant')),
  phone text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2.3 TENANTS TABLE
create table if not exists public.tenants (
  id text primary key,
  user_id uuid null references auth.users(id) on delete set null,
  name text not null,
  email text not null,
  phone text null,
  room_id text null references public.rooms(id) on delete set null,
  monthly_rent numeric(10, 2) not null default 0,
  due_day integer not null default 1 check (due_day between 1 and 31),
  move_in_date date null,
  status text not null default 'Active' check (status in ('Active', 'Inactive', 'Archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tenants_email_idx on public.tenants (lower(email));
create index if not exists tenants_room_idx on public.tenants (room_id);
create index if not exists tenants_user_id_idx on public.tenants (user_id);

-- 2.4 RESERVATIONS TABLE
create table if not exists public.reservations (
  id text primary key,
  name text not null,
  email text not null,
  phone text null,
  room_id text null references public.rooms(id) on delete set null,
  move_in_date date null,
  message text null,
  additional_info text null,
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected', 'Cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reservations_email_idx on public.reservations (lower(email));
create index if not exists reservations_status_idx on public.reservations (status);
create index if not exists reservations_created_at_idx on public.reservations (created_at desc);

-- 2.5 MESSAGES & INQUIRIES TABLE
create table if not exists public.messages (
  id text primary key,
  name text not null,
  email text not null,
  phone text null,
  room_id text null references public.rooms(id) on delete set null,
  message text not null,
  reply text null,
  sender text not null default 'tenant' check (sender in ('tenant', 'admin', 'guest')),
  status text not null default 'New' check (status in ('New', 'Unread', 'Read', 'Replied')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists messages_email_idx on public.messages (lower(email));
create index if not exists messages_status_idx on public.messages (status);
create index if not exists messages_created_at_idx on public.messages (created_at desc);

-- 2.6 PAYMENTS TABLE
create table if not exists public.payments (
  id text primary key,
  session_id text null,
  payment_intent_id text null,
  tenant_uid uuid null references auth.users(id) on delete set null,
  tenant_name text null,
  tenant_email text null,
  amount numeric(10, 2) not null check (amount >= 0),
  fee numeric(10, 2) null default 0,
  net numeric(10, 2) null default 0,
  currency text not null default 'PHP',
  status text not null default 'Pending' check (status in ('Paid', 'Pending', 'Failed', 'Refunded')),
  payment_method text null,
  purpose text null default 'Monthly Rent',
  notes text null,
  reference_number text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_tenant_email_idx on public.payments (lower(tenant_email));
create index if not exists payments_tenant_uid_idx on public.payments (tenant_uid);
create index if not exists payments_status_idx on public.payments (status);
create index if not exists payments_created_at_idx on public.payments (created_at desc);

-- ==============================================================================
-- 3. HELPER FUNCTIONS & ROW LEVEL SECURITY (RLS)
-- ==============================================================================

create or replace function public.is_staff()
returns boolean language sql stable as $$
  select coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'superadmin')),
    false
  );
$$;

alter table public.app_documents enable row level security;
alter table public.rooms enable row level security;
alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.reservations enable row level security;
alter table public.messages enable row level security;
alter table public.payments enable row level security;

-- Table Grants
grant select, insert, update, delete on public.app_documents to anon, authenticated;
grant select on public.rooms to anon, authenticated;
grant insert, update, delete on public.rooms to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.tenants to authenticated;
grant select, insert on public.reservations to anon, authenticated;
grant update, delete on public.reservations to authenticated;
grant select, insert on public.messages to anon, authenticated;
grant update, delete on public.messages to authenticated;
grant select on public.payments to anon, authenticated;
grant insert, update, delete on public.payments to authenticated;

-- 3.1 app_documents policies
drop policy if exists "public and authorized users read documents" on public.app_documents;
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

drop policy if exists "public can submit reservations" on public.app_documents;
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

drop policy if exists "public can submit inquiries" on public.app_documents;
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

drop policy if exists "tenant and staff can send messages" on public.app_documents;
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

drop policy if exists "staff can write room and reservation records" on public.app_documents;
create policy "staff can write room and reservation records"
  on public.app_documents
  for insert
  to authenticated
  with check (
    (select auth.jwt()) -> 'app_metadata' ->> 'role' in ('admin', 'superadmin')
    and collection = 'rooms'
  );

drop policy if exists "users can create their own tenant profile" on public.app_documents;
create policy "users can create their own tenant profile"
  on public.app_documents
  for insert
  to authenticated
  with check (
    collection = 'users'
    and id = (select auth.uid())::text
    and data ->> 'role' = 'tenant'
  );

drop policy if exists "tenants can insert own payment documents" on public.app_documents;
create policy "tenants can insert own payment documents"
  on public.app_documents
  for insert
  to authenticated
  with check (
    collection = 'payments'
    and (
      lower(data ->> 'tenantEmail') = lower((select auth.jwt() ->> 'email'))
      or (data ->> 'tenantUid') = (select auth.uid())::text
      or public.is_staff()
    )
  );

drop policy if exists "staff can update operational records" on public.app_documents;
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

drop policy if exists "superadmins can update user records" on public.app_documents;
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

drop policy if exists "staff can delete operational records" on public.app_documents;
create policy "staff can delete operational records"
  on public.app_documents
  for delete
  to authenticated
  using (
    (select auth.jwt()) -> 'app_metadata' ->> 'role' in ('admin', 'superadmin')
    and collection in ('rooms', 'reservations', 'messages', 'adminTokens', 'inquiries')
  );

drop policy if exists "superadmins can delete tenant and user records" on public.app_documents;
create policy "superadmins can delete tenant and user records"
  on public.app_documents
  for delete
  to authenticated
  using (
    (select auth.jwt()) -> 'app_metadata' ->> 'role' = 'superadmin'
    and collection in ('tenants', 'users')
  );

-- 3.2 Relational tables policies
drop policy if exists "anyone can view rooms" on public.rooms;
create policy "anyone can view rooms"
  on public.rooms for select to anon, authenticated
  using (true);

drop policy if exists "staff can manage rooms" on public.rooms;
create policy "staff can manage rooms"
  on public.rooms for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "users can view own profile or staff view all" on public.profiles;
create policy "users can view own profile or staff view all"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_staff());

drop policy if exists "users can update own profile or staff update all" on public.profiles;
create policy "users can update own profile or staff update all"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_staff())
  with check (id = (select auth.uid()) or public.is_staff());

drop policy if exists "tenants view own record or staff view all" on public.tenants;
create policy "tenants view own record or staff view all"
  on public.tenants for select to authenticated
  using (
    lower(email) = lower((select auth.jwt() ->> 'email'))
    or user_id = (select auth.uid())
    or public.is_staff()
  );

drop policy if exists "staff manage tenants" on public.tenants;
create policy "staff manage tenants"
  on public.tenants for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "anyone can submit reservation" on public.reservations;
create policy "anyone can submit reservation"
  on public.reservations for insert to anon, authenticated
  with check (length(name) between 1 and 120 and length(email) between 1 and 200);

drop policy if exists "staff view and manage reservations" on public.reservations;
create policy "staff view and manage reservations"
  on public.reservations for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "public or tenant can submit message" on public.messages;
create policy "public or tenant can submit message"
  on public.messages for insert to anon, authenticated
  with check (length(message) between 1 and 4000);

drop policy if exists "tenant view own messages or staff view all" on public.messages;
create policy "tenant view own messages or staff view all"
  on public.messages for select to authenticated
  using (lower(email) = lower((select auth.jwt() ->> 'email')) or public.is_staff());

drop policy if exists "staff manage messages" on public.messages;
create policy "staff manage messages"
  on public.messages for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "tenants view own payments or staff view all" on public.payments;
create policy "tenants view own payments or staff view all"
  on public.payments for select to authenticated
  using (
    lower(tenant_email) = lower((select auth.jwt() ->> 'email'))
    or tenant_uid = (select auth.uid())
    or public.is_staff()
  );

drop policy if exists "tenants can insert own payments" on public.payments;
create policy "tenants can insert own payments"
  on public.payments for insert to authenticated
  with check (
    lower(tenant_email) = lower((select auth.jwt() ->> 'email'))
    or tenant_uid = (select auth.uid())
    or public.is_staff()
  );

drop policy if exists "staff manage payments" on public.payments;
create policy "staff manage payments"
  on public.payments for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ==============================================================================
-- 4. STORAGE BUCKETS & STORAGE RLS POLICIES
-- ==============================================================================

-- 4.1 Frontend Static Site Bucket
insert into storage.buckets (id, name, public)
values ('homespot-site', 'homespot-site', true)
on conflict (id) do update
set public = excluded.public;

-- 4.2 Room Listing Media Bucket (Card Image, Main Image, 360 Panorama, Gallery)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'room-media',
  'room-media',
  true,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public can read room media" on storage.objects;
create policy "public can read room media"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'room-media');

drop policy if exists "staff can upload room media" on storage.objects;
create policy "staff can upload room media"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'room-media' and public.is_staff());

drop policy if exists "staff can update room media" on storage.objects;
create policy "staff can update room media"
  on storage.objects for update to authenticated
  using (bucket_id = 'room-media' and public.is_staff())
  with check (bucket_id = 'room-media' and public.is_staff());

drop policy if exists "staff can delete room media" on storage.objects;
create policy "staff can delete room media"
  on storage.objects for delete to authenticated
  using (bucket_id = 'room-media' and public.is_staff());

-- ==============================================================================
-- 5. SYNCHRONIZATION TRIGGER (app_documents -> relational tables)
-- ==============================================================================
create or replace function public.sync_app_document_to_relational()
returns trigger language plpgsql security definer as $$
begin
  if NEW.collection = 'rooms' then
    insert into public.rooms (
      id, name, available, price, amenities, detail_id, type, badge,
      image, main_image, panorama, images, description, size, capacity, updated_at
    )
    values (
      NEW.id,
      coalesce(NEW.data ->> 'name', NEW.id),
      coalesce((NEW.data ->> 'available')::integer, 0),
      case when (NEW.data ->> 'price') ~ '^\d+(\.\d+)?$' then (NEW.data ->> 'price')::numeric else null end,
      case
        when jsonb_typeof(NEW.data -> 'features') = 'array'
        then array(select jsonb_array_elements_text(NEW.data -> 'features'))
        else '{}'::text[]
      end,
      case when (NEW.data ->> 'detailId') ~ '^\d+$' then (NEW.data ->> 'detailId')::integer else null end,
      NEW.data ->> 'type',
      NEW.data ->> 'badge',
      NEW.data ->> 'image',
      NEW.data ->> 'mainImage',
      NEW.data ->> 'panorama',
      case
        when jsonb_typeof(NEW.data -> 'images') = 'array'
        then array(select jsonb_array_elements_text(NEW.data -> 'images'))
        else '{}'::text[]
      end,
      NEW.data ->> 'description',
      NEW.data ->> 'size',
      case when (NEW.data ->> 'capacity') ~ '^\d+$' then (NEW.data ->> 'capacity')::integer else null end,
      now()
    )
    on conflict (id) do update set
      name = excluded.name,
      available = excluded.available,
      price = coalesce(excluded.price, public.rooms.price),
      amenities = case when array_length(excluded.amenities, 1) > 0 then excluded.amenities else public.rooms.amenities end,
      detail_id = coalesce(excluded.detail_id, public.rooms.detail_id),
      type = coalesce(excluded.type, public.rooms.type),
      badge = coalesce(excluded.badge, public.rooms.badge),
      image = coalesce(excluded.image, public.rooms.image),
      main_image = coalesce(excluded.main_image, public.rooms.main_image),
      panorama = coalesce(excluded.panorama, public.rooms.panorama),
      images = case when array_length(excluded.images, 1) > 0 then excluded.images else public.rooms.images end,
      description = coalesce(excluded.description, public.rooms.description),
      size = coalesce(excluded.size, public.rooms.size),
      capacity = coalesce(excluded.capacity, public.rooms.capacity),
      updated_at = now();

  elsif NEW.collection = 'reservations' then
    insert into public.reservations (id, name, email, phone, room_id, move_in_date, message, additional_info, status, created_at, updated_at)
    values (
      NEW.id,
      coalesce(NEW.data ->> 'name', ''),
      coalesce(NEW.data ->> 'email', ''),
      NEW.data ->> 'phone',
      NEW.data ->> 'room',
      case when NEW.data ->> 'moveInDate' ~ '^\d{4}-\d{2}-\d{2}' then (NEW.data ->> 'moveInDate')::date else null end,
      NEW.data ->> 'message',
      NEW.data ->> 'additionalInfo',
      coalesce(NEW.data ->> 'status', 'Pending'),
      coalesce((NEW.data ->> 'createdAt')::timestamptz, NEW.created_at),
      now()
    )
    on conflict (id) do update set
      status = excluded.status,
      updated_at = now();

  elsif NEW.collection = 'messages' then
    insert into public.messages (id, name, email, phone, room_id, message, reply, sender, status, created_at, updated_at)
    values (
      NEW.id,
      coalesce(NEW.data ->> 'name', ''),
      coalesce(NEW.data ->> 'email', ''),
      NEW.data ->> 'phone',
      NEW.data ->> 'room',
      coalesce(NEW.data ->> 'message', ''),
      NEW.data ->> 'reply',
      coalesce(NEW.data ->> 'sender', 'tenant'),
      coalesce(NEW.data ->> 'status', 'New'),
      coalesce((NEW.data ->> 'createdAt')::timestamptz, NEW.created_at),
      now()
    )
    on conflict (id) do update set
      reply = excluded.reply,
      status = excluded.status,
      updated_at = now();

  elsif NEW.collection = 'tenants' then
    insert into public.tenants (id, user_id, name, email, phone, room_id, monthly_rent, due_day, move_in_date, status, created_at, updated_at)
    values (
      NEW.id,
      case when NEW.data ->> 'uid' ~ '^[0-9a-fA-F-]{36}$' then (NEW.data ->> 'uid')::uuid else null end,
      coalesce(NEW.data ->> 'name', ''),
      coalesce(NEW.data ->> 'email', ''),
      NEW.data ->> 'phone',
      NEW.data ->> 'room',
      coalesce((NEW.data ->> 'monthlyRent')::numeric, 0),
      coalesce((NEW.data ->> 'dueDay')::integer, 1),
      case when NEW.data ->> 'moveInDate' ~ '^\d{4}-\d{2}-\d{2}' then (NEW.data ->> 'moveInDate')::date else null end,
      coalesce(NEW.data ->> 'status', 'Active'),
      coalesce((NEW.data ->> 'createdAt')::timestamptz, NEW.created_at),
      now()
    )
    on conflict (id) do update set
      name = excluded.name,
      monthly_rent = excluded.monthly_rent,
      due_day = excluded.due_day,
      status = excluded.status,
      updated_at = now();

  elsif NEW.collection = 'payments' then
    insert into public.payments (id, session_id, payment_intent_id, tenant_uid, tenant_name, tenant_email, amount, fee, net, currency, status, payment_method, purpose, notes, reference_number, created_at, updated_at)
    values (
      NEW.id,
      NEW.data ->> 'sessionId',
      NEW.data ->> 'paymentIntentId',
      case when NEW.data ->> 'tenantUid' ~ '^[0-9a-fA-F-]{36}$' then (NEW.data ->> 'tenantUid')::uuid else null end,
      NEW.data ->> 'tenantName',
      NEW.data ->> 'tenantEmail',
      coalesce((NEW.data ->> 'amount')::numeric, 0),
      coalesce((NEW.data ->> 'fee')::numeric, 0),
      coalesce((NEW.data ->> 'net')::numeric, 0),
      coalesce(NEW.data ->> 'currency', 'PHP'),
      coalesce(NEW.data ->> 'status', 'Pending'),
      NEW.data ->> 'paymentMethod',
      NEW.data ->> 'purpose',
      NEW.data ->> 'notes',
      NEW.data ->> 'referenceNumber',
      coalesce((NEW.data ->> 'createdAt')::timestamptz, NEW.created_at),
      now()
    )
    on conflict (id) do update set
      status = excluded.status,
      updated_at = now();
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_sync_app_documents on public.app_documents;
create trigger trg_sync_app_documents
after insert or update on public.app_documents
for each row execute function public.sync_app_document_to_relational();

-- ==============================================================================
-- 6. INITIAL ROOM SEEDS (Preserves any existing Admin edits on conflict)
-- ==============================================================================
insert into public.app_documents (collection, id, data)
values
  (
    'rooms',
    'triple-occupancy-room',
    jsonb_build_object(
      'detailId', 1,
      'name', 'Triple Occupancy Room',
      'type', 'Living Space',
      'badge', 'Most Popular',
      'price', 10000,
      'available', 3,
      'capacity', 3,
      'size', '30 sqm',
      'image', 'assets/img/triple-occupancy-panorama.png',
      'mainImage', 'assets/img/triple-occupancy.jpg',
      'panorama', 'assets/img/triple-occupancy-panorama.png',
      'images', jsonb_build_array('assets/img/triple-occupancy.jpg', 'assets/img/triple-occupancy-panorama.png'),
      'features', jsonb_build_array('3 People', 'Bathroom', 'Aircon Space'),
      'description', 'Spacious apartment unit that can accommodate up to 3 people. Perfect for small families or groups of students looking for a comfortable shared living space.'
    )
  ),
  (
    'rooms',
    'commercial-space',
    jsonb_build_object(
      'detailId', 4,
      'name', 'Commercial Space',
      'type', 'Space for Business Operations',
      'badge', 'Premium',
      'price', 12000,
      'available', 1,
      'capacity', 4,
      'size', '35 sqm',
      'image', 'assets/img/commercial-space.jpg',
      'mainImage', 'assets/img/commercial-space.jpg',
      'panorama', 'assets/img/commercial-space-panorama.png',
      'images', jsonb_build_array('assets/img/commercial-space.jpg', 'assets/img/commercial-space-panorama.png'),
      'features', jsonb_build_array('4 People', 'Bathroom'),
      'description', 'Premium commercial space ideal for business operations. Spacious unit suitable for small offices, retail, or service-based businesses with comfortable working capacity.'
    )
  )
on conflict (collection, id) do update set
  data = excluded.data || public.app_documents.data,
  updated_at = now();

-- ==============================================================================
-- 7. REALTIME PUBLICATION
-- ==============================================================================
do $$
declare
  tbl text;
begin
  foreach tbl in array array['app_documents', 'rooms', 'tenants', 'reservations', 'messages', 'payments']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end;
$$;
