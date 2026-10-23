-- ==============================================================================
-- Relational System Schema for HomeSpot (MJP Residences)
-- ==============================================================================

-- 1. ROOMS TABLE
create table if not exists public.rooms (
  id text primary key,
  name text not null,
  available integer not null default 0 check (available >= 0),
  price numeric(10, 2) null check (price is null or price >= 0),
  amenities text[] null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed rooms from app_documents if available, else insert defaults
insert into public.rooms (id, name, available)
select
  id,
  coalesce(data ->> 'name', id),
  coalesce((data ->> 'available')::integer, 0)
from public.app_documents
where collection = 'rooms'
on conflict (id) do update
set
  name = excluded.name,
  available = excluded.available,
  updated_at = now();

insert into public.rooms (id, name, available)
values
  ('triple-occupancy-room', 'Triple Occupancy Room', 3),
  ('commercial-space', 'Commercial Space', 1)
on conflict (id) do nothing;

-- 2. USER PROFILES TABLE (Linked to auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text null,
  role text not null default 'tenant' check (role in ('superadmin', 'admin', 'tenant')),
  phone text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. TENANTS TABLE
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

-- 4. RESERVATIONS TABLE
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

-- 5. MESSAGES & INQUIRIES TABLE
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

-- 6. PAYMENTS TABLE
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
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

alter table public.rooms enable row level security;
alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.reservations enable row level security;
alter table public.messages enable row level security;
alter table public.payments enable row level security;

-- Grants
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

-- Helper function: check if caller has staff role
create or replace function public.is_staff()
returns boolean language sql stable as $$
  select coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'superadmin')),
    false
  );
$$;

-- Rooms policies
create policy "anyone can view rooms"
  on public.rooms for select to anon, authenticated
  using (true);

create policy "staff can manage rooms"
  on public.rooms for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Profiles policies
create policy "users can view own profile or staff view all"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_staff());

create policy "users can update own profile or staff update all"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_staff())
  with check (id = (select auth.uid()) or public.is_staff());

-- Tenants policies
create policy "tenants view own record or staff view all"
  on public.tenants for select to authenticated
  using (
    lower(email) = lower((select auth.jwt() ->> 'email'))
    or user_id = (select auth.uid())
    or public.is_staff()
  );

create policy "staff manage tenants"
  on public.tenants for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Reservations policies
create policy "anyone can submit reservation"
  on public.reservations for insert to anon, authenticated
  with check (length(name) between 1 and 120 and length(email) between 1 and 200);

create policy "staff view and manage reservations"
  on public.reservations for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Messages policies
create policy "public or tenant can submit message"
  on public.messages for insert to anon, authenticated
  with check (length(message) between 1 and 4000);

create policy "tenant view own messages or staff view all"
  on public.messages for select to authenticated
  using (lower(email) = lower((select auth.jwt() ->> 'email')) or public.is_staff());

create policy "staff manage messages"
  on public.messages for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Payments policies
create policy "tenants view own payments or staff view all"
  on public.payments for select to authenticated
  using (
    lower(tenant_email) = lower((select auth.jwt() ->> 'email'))
    or tenant_uid = (select auth.uid())
    or public.is_staff()
  );

create policy "staff manage payments"
  on public.payments for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ==============================================================================
-- REALTIME PUBLICATION
-- ==============================================================================
do $$
begin
  alter publication supabase_realtime add table public.rooms;
  alter publication supabase_realtime add table public.tenants;
  alter publication supabase_realtime add table public.reservations;
  alter publication supabase_realtime add table public.messages;
  alter publication supabase_realtime add table public.payments;
exception when others then
  null; -- Ignore if tables are already in publication
end;
$$;

-- ==============================================================================
-- SYNCHRONIZATION TRIGGER (Seamless backwards-compatibility with app_documents)
-- ==============================================================================
create or replace function public.sync_app_document_to_relational()
returns trigger language plpgsql security definer as $$
begin
  if NEW.collection = 'rooms' then
    insert into public.rooms (id, name, available, updated_at)
    values (
      NEW.id,
      coalesce(NEW.data ->> 'name', NEW.id),
      coalesce((NEW.data ->> 'available')::integer, 0),
      now()
    )
    on conflict (id) do update set
      name = excluded.name,
      available = excluded.available,
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
