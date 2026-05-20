-- Reduce feature-ingest and preview-read IO.
--
-- The previous feature count trigger ran once per feature row and updated both
-- datasets and layers for every inserted/deleted feature. Batch uploads insert
-- many rows per statement, so use statement-level transition tables instead.

create index if not exists features_dataset_id_created_at_idx
  on features(dataset_id, created_at);

drop trigger if exists on_feature_change on features;
drop function if exists sync_feature_counts();

create or replace function sync_feature_counts_insert()
returns trigger language plpgsql security definer as $$
begin
  with dataset_counts as (
    select dataset_id, count(*)::int as feature_delta
    from new_rows
    group by dataset_id
  )
  update datasets d
  set feature_count = d.feature_count + dataset_counts.feature_delta,
      updated_at = now()
  from dataset_counts
  where d.id = dataset_counts.dataset_id;

  with layer_counts as (
    select d.layer_id, count(*)::int as feature_delta
    from new_rows nr
    join datasets d on d.id = nr.dataset_id
    group by d.layer_id
  )
  update layers l
  set feature_count = l.feature_count + layer_counts.feature_delta,
      updated_at = now()
  from layer_counts
  where l.id = layer_counts.layer_id;

  return null;
end;
$$;

create or replace function sync_feature_counts_delete()
returns trigger language plpgsql security definer as $$
begin
  with dataset_counts as (
    select dataset_id, count(*)::int as feature_delta
    from old_rows
    group by dataset_id
  )
  update datasets d
  set feature_count = greatest(0, d.feature_count - dataset_counts.feature_delta),
      updated_at = now()
  from dataset_counts
  where d.id = dataset_counts.dataset_id;

  with layer_counts as (
    select d.layer_id, count(*)::int as feature_delta
    from old_rows orows
    join datasets d on d.id = orows.dataset_id
    group by d.layer_id
  )
  update layers l
  set feature_count = greatest(0, l.feature_count - layer_counts.feature_delta),
      updated_at = now()
  from layer_counts
  where l.id = layer_counts.layer_id;

  return null;
end;
$$;

create trigger on_feature_insert_count
  after insert on features
  referencing new table as new_rows
  for each statement execute function sync_feature_counts_insert();

create trigger on_feature_delete_count
  after delete on features
  referencing old table as old_rows
  for each statement execute function sync_feature_counts_delete();
