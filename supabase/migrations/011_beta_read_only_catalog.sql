-- Beta lockdown: hosted catalog is public read-only.
-- Hosted writes should happen through trusted admin/service-role tooling until
-- product auth, owners, quotas, and moderation are implemented.

drop policy if exists "anon can create non-private layers" on layers;
drop policy if exists "anon can create datasets for anon layers" on datasets;
drop policy if exists "anon can insert features for anon layers" on features;
drop policy if exists "anon can delete anon non-private layers" on layers;

drop policy if exists "Anyone can upload to layer-files" on storage.objects;
drop policy if exists "Anyone can update layer-files" on storage.objects;
drop policy if exists "Public read access on layer-files" on storage.objects;
drop policy if exists "Public read on layer-files" on storage.objects;

create policy "Public read on layer-files"
  on storage.objects for select
  using (bucket_id = 'layer-files');
