-- Add tiles_url column to layers table
alter table layers add column if not exists tiles_url text;

-- ─── Storage bucket ───────────────────────────────────────────────────────────
-- Run in the Supabase SQL editor after enabling Storage.

insert into storage.buckets (id, name, public)
values ('layer-files', 'layer-files', true)
on conflict (id) do nothing;

-- Allow anyone to read files from the bucket (files are public by design)
create policy "Public read access on layer-files"
  on storage.objects for select
  using (bucket_id = 'layer-files');

-- Allow authenticated users and anon (dev) to upload files
create policy "Anyone can upload to layer-files"
  on storage.objects for insert
  with check (bucket_id = 'layer-files');

-- Allow layer owners to delete their files
create policy "Anyone can update layer-files"
  on storage.objects for update
  using (bucket_id = 'layer-files');
