alter table datasets
  add column if not exists feature_inspector jsonb not null default '{}';
