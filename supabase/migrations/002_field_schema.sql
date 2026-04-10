-- Add dataset-level field schema metadata to layers.
alter table layers add column if not exists field_schema jsonb not null default '[]';
