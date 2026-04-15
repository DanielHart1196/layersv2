-- Replace the layer-centric import model with a dataset-centric pipeline.
-- Existing uploaded data can be discarded for this migration.

drop trigger if exists on_submission_insert on feature_submissions;
drop function if exists auto_approve_open_submission();
drop trigger if exists on_feature_change on features;
drop trigger if exists on_dataset_change on datasets;
drop function if exists sync_feature_count();
drop function if exists sync_feature_counts();
drop function if exists sync_layer_geometry_type();
drop function if exists recompute_layer_geometry_type(uuid);
drop function if exists get_layer_geojson(uuid);

drop table if exists feature_submissions cascade;
drop table if exists features cascade;
drop table if exists datasets cascade;

alter table layers drop column if exists file_url;
alter table layers drop column if exists tiles_url;
alter table layers drop column if exists field_schema;

create table if not exists datasets (
  id                uuid        primary key default gen_random_uuid(),
  layer_id          uuid        not null references layers(id) on delete cascade,
  name              text        not null,
  geometry_type     text        not null
                                check (geometry_type in ('point', 'line', 'polygon', 'mixed')),
  field_schema      jsonb       not null default '[]',
  render_format     text        check (render_format in ('geojson', 'pmtiles')),
  artifact_url      text,
  feature_count     int         not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table datasets enable row level security;
create index if not exists datasets_layer_id_idx on datasets(layer_id);

create policy "datasets readable if layer is readable"
  on datasets for select
  using (
    exists (
      select 1 from layers
      where id = datasets.layer_id
      and (
        view_access in ('public', 'unlisted')
        or owner_id = auth.uid()
        or exists (
          select 1 from layer_collaborators
          where layer_id = layers.id and user_id = auth.uid()
        )
      )
    )
  );

create policy "owners and contributors can insert datasets"
  on datasets for insert
  with check (
    exists (
      select 1 from layers
      where id = datasets.layer_id
      and (
        owner_id = auth.uid()
        or exists (
          select 1 from layer_collaborators
          where layer_id = layers.id
          and user_id = auth.uid()
          and role in ('contributor', 'moderator', 'owner')
        )
      )
    )
  );

create policy "anon can create datasets for anon layers"
  on datasets for insert
  with check (
    exists (
      select 1 from layers
      where id = datasets.layer_id
      and owner_id is null
      and view_access in ('public', 'unlisted')
    )
  );

create policy "owners can update datasets"
  on datasets for update
  using (
    exists (
      select 1 from layers
      where id = datasets.layer_id and owner_id = auth.uid()
    )
  );

create policy "owners can delete datasets"
  on datasets for delete
  using (
    exists (
      select 1 from layers
      where id = datasets.layer_id and owner_id = auth.uid()
    )
  );

create table if not exists features (
  id          uuid        primary key default gen_random_uuid(),
  dataset_id  uuid        not null references datasets(id) on delete cascade,
  geometry    geometry(Geometry, 4326) not null,
  properties  jsonb       not null default '{}',
  valid_from  timestamptz,
  valid_to    timestamptz,
  created_at  timestamptz not null default now()
);

alter table features enable row level security;
create index if not exists features_geometry_idx on features using gist(geometry);
create index if not exists features_dataset_id_idx on features(dataset_id);
create index if not exists features_valid_from_idx on features(valid_from);
create index if not exists features_valid_to_idx on features(valid_to);

create policy "features readable if layer is readable"
  on features for select
  using (
    exists (
      select 1 from layers
      join datasets on datasets.layer_id = layers.id
      where datasets.id = features.dataset_id
      and (
        view_access in ('public', 'unlisted')
        or owner_id = auth.uid()
        or exists (
          select 1 from layer_collaborators
          where layer_id = layers.id and user_id = auth.uid()
        )
      )
    )
  );

create policy "owners and contributors can insert features"
  on features for insert
  with check (
    exists (
      select 1 from layers
      join datasets on datasets.layer_id = layers.id
      where datasets.id = features.dataset_id
      and (
        owner_id = auth.uid()
        or exists (
          select 1 from layer_collaborators
          where layer_id = layers.id
          and user_id = auth.uid()
          and role in ('contributor', 'moderator', 'owner')
        )
      )
    )
  );

create policy "anon can insert features for anon layers"
  on features for insert
  with check (
    exists (
      select 1 from layers
      join datasets on datasets.layer_id = layers.id
      where datasets.id = features.dataset_id and owner_id is null
    )
  );

create policy "owners can delete features"
  on features for delete
  using (
    exists (
      select 1 from layers
      join datasets on datasets.layer_id = layers.id
      where datasets.id = features.dataset_id and owner_id = auth.uid()
    )
  );

create or replace function recompute_layer_geometry_type(p_layer_id uuid)
returns void language sql security definer as $$
  update layers
  set geometry_type = (
    select case
      when count(*) = 0 then null
      when bool_or(geometry_type = 'mixed') then 'mixed'
      when count(distinct geometry_type) = 1 then max(geometry_type)
      else 'mixed'
    end
    from datasets
    where layer_id = p_layer_id
  ),
  updated_at = now()
  where id = p_layer_id;
$$;

create or replace function sync_feature_counts()
returns trigger language plpgsql security definer as $$
declare
  v_layer_id uuid;
begin
  if TG_OP = 'INSERT' then
    update datasets set feature_count = feature_count + 1, updated_at = now()
    where id = NEW.dataset_id
    returning layer_id into v_layer_id;

    update layers set feature_count = feature_count + 1, updated_at = now()
    where id = v_layer_id;
  elsif TG_OP = 'DELETE' then
    update datasets set feature_count = feature_count - 1, updated_at = now()
    where id = OLD.dataset_id
    returning layer_id into v_layer_id;

    update layers set feature_count = feature_count - 1, updated_at = now()
    where id = v_layer_id;
  end if;
  return null;
end;
$$;

create trigger on_feature_change
  after insert or delete on features
  for each row execute function sync_feature_counts();

create or replace function sync_layer_geometry_type()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'DELETE' then
    perform recompute_layer_geometry_type(OLD.layer_id);
  else
    perform recompute_layer_geometry_type(NEW.layer_id);
  end if;
  return null;
end;
$$;

create trigger on_dataset_change
  after insert or update of geometry_type or delete on datasets
  for each row execute function sync_layer_geometry_type();

create table if not exists feature_submissions (
  id            uuid        primary key default gen_random_uuid(),
  layer_id      uuid        not null references layers(id) on delete cascade,
  dataset_id    uuid        not null references datasets(id) on delete cascade,
  submitted_by  uuid        references auth.users on delete set null,
  feature       jsonb       not null,
  status        text        not null default 'pending'
                            check (status in ('pending', 'approved', 'rejected')),
  note          text,
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz,
  reviewed_by   uuid        references auth.users on delete set null
);

alter table feature_submissions enable row level security;

create policy "anyone can submit to open or moderated layers"
  on feature_submissions for insert
  with check (
    exists (
      select 1 from layers
      where id = feature_submissions.layer_id
      and submit_access in ('open', 'moderated')
    )
  );

create policy "submitters can see their own submissions"
  on feature_submissions for select
  using (submitted_by = auth.uid());

create policy "owners and moderators can see all submissions"
  on feature_submissions for select
  using (
    exists (
      select 1 from layers
      where id = feature_submissions.layer_id
      and (
        owner_id = auth.uid()
        or exists (
          select 1 from layer_collaborators
          where layer_id = layers.id
          and user_id = auth.uid()
          and role in ('moderator', 'owner')
        )
      )
    )
  );

create policy "owners and moderators can update submissions"
  on feature_submissions for update
  using (
    exists (
      select 1 from layers
      where id = feature_submissions.layer_id
      and (
        owner_id = auth.uid()
        or exists (
          select 1 from layer_collaborators
          where layer_id = layers.id
          and user_id = auth.uid()
          and role in ('moderator', 'owner')
        )
      )
    )
  );

create or replace function auto_approve_open_submission()
returns trigger language plpgsql security definer as $$
declare
  v_access text;
  v_geom   geometry;
begin
  select submit_access into v_access from layers where id = NEW.layer_id;

  if v_access = 'open' then
    v_geom := ST_GeomFromGeoJSON((NEW.feature->>'geometry'));
    insert into features (dataset_id, geometry, properties, valid_from, valid_to)
    values (
      NEW.dataset_id,
      v_geom,
      coalesce(NEW.feature->'properties', '{}'),
      (NEW.feature->'properties'->>'valid_from')::timestamptz,
      (NEW.feature->'properties'->>'valid_to')::timestamptz
    );
    NEW.status := 'approved';
    NEW.reviewed_at := now();
  end if;

  return NEW;
end;
$$;

create trigger on_submission_insert
  before insert on feature_submissions
  for each row execute function auto_approve_open_submission();

create or replace function get_layer_geojson(p_layer_id uuid)
returns json language sql stable security definer as $$
  select json_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(
      json_agg(
        json_build_object(
          'type', 'Feature',
          'id', f.id,
          'geometry', ST_AsGeoJSON(f.geometry)::json,
          'properties', f.properties || jsonb_build_object(
            '_id',         f.id,
            '_dataset_id', d.id,
            '_dataset_name', d.name,
            '_valid_from', f.valid_from,
            '_valid_to',   f.valid_to,
            '_created_at', f.created_at
          )
        )
        order by f.created_at
      ),
      '[]'::json
    )
  )
  from features f
  join datasets d on d.id = f.dataset_id
  where d.layer_id = p_layer_id;
$$;
