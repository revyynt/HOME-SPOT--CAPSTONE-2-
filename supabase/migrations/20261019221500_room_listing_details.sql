-- ==============================================================================
-- Room Listing Details (Landing Page, Property Detail & Admin Listings Sync)
-- ==============================================================================

alter table public.rooms
  add column if not exists detail_id integer null,
  add column if not exists type text null,
  add column if not exists badge text null,
  add column if not exists image text null,
  add column if not exists main_image text null,
  add column if not exists panorama text null,
  add column if not exists description text null,
  add column if not exists size text null,
  add column if not exists capacity integer null;

-- Update sync trigger so app_documents ('rooms') syncs all listing fields to public.rooms
create or replace function public.sync_app_document_to_relational()
returns trigger language plpgsql security definer as $$
begin
  if NEW.collection = 'rooms' then
    insert into public.rooms (
      id, name, available, price, amenities, detail_id, type, badge,
      image, main_image, panorama, description, size, capacity, updated_at
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

-- Seed full room data in app_documents (which also fires sync trigger to public.rooms)
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
      'features', jsonb_build_array('4 People', 'Bathroom'),
      'description', 'Premium commercial space ideal for business operations. Spacious unit suitable for small offices, retail, or service-based businesses with comfortable working capacity.'
    )
  )
on conflict (collection, id) do update set
  data = excluded.data || jsonb_build_object(
    'available', coalesce((public.app_documents.data ->> 'available')::integer, (excluded.data ->> 'available')::integer)
  ),
  updated_at = now();
