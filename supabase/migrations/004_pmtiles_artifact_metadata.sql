alter table datasets
  add column if not exists source_layer text,
  add column if not exists minzoom int,
  add column if not exists maxzoom int,
  add column if not exists bounds jsonb,
  add column if not exists artifact_metadata jsonb not null default '{}';
