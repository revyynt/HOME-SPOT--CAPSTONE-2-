-- Room Listing Media Bucket (Card Image, Main Image, 360 Panorama, Gallery)
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

