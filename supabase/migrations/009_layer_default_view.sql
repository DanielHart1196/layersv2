alter table layers
  add column if not exists default_view jsonb not null default '{}';
