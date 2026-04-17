-- ─────────────────────────────────────────────────────────────────────────────
-- Atlas — initial schema
-- Run this in the Supabase SQL editor.
-- Requires the PostGIS extension (enabled by default on Supabase).
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists postgis;

-- ─── Layers ──────────────────────────────────────────────────────────────────

create table layers (
  id                uuid        primary key default gen_random_uuid(),
  owner_id          uuid        references auth.users on delete set null,

  name              text        not null,
  description       text,

  -- What kind of geometry this layer contains (inferred at ingest)
  geometry_type     text        check (geometry_type in ('point', 'line', 'polygon', 'mixed')),

  -- Access control
  view_access       text        not null default 'public'
                                check (view_access in ('public', 'unlisted', 'private')),
  submit_access     text        not null default 'closed'
                                check (submit_access in ('open', 'moderated', 'closed')),
  allow_forks       boolean     not null default true,

  -- Forking lineage
  forked_from       uuid        references layers(id) on delete set null,
  fork_count        int         not null default 0,
  upstream_synced_at timestamptz,

  -- Rendering defaults — drives how the layer looks before any user customisation
  default_style     jsonb       not null default '{
    "renderType": "point",
    "color": "#e74c3c",
    "opacity": 80,
    "radius": 6
  }',

  -- Denormalized summary fields for layer-level UI/runtime decisions.
  feature_count     int         not null default 0,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table layers enable row level security;

create policy "public layers are readable by anyone"
  on layers for select
  using (view_access = 'public');

create policy "unlisted layers are readable by anyone with the id"
  on layers for select
  using (view_access = 'unlisted');

create policy "owners can insert layers"
  on layers for insert
  with check (owner_id = auth.uid());

-- Allow unauthenticated inserts for dev (no owner). Remove once auth is added.
create policy "anon can create non-private layers"
  on layers for insert
  with check (owner_id is null and view_access in ('public', 'unlisted'));

create policy "owners can update their layers"
  on layers for update
  using (owner_id = auth.uid());

create policy "owners can delete their layers"
  on layers for delete
  using (owner_id = auth.uid());


-- --- Datasets -----------------------------------------------------------------
-- Canonical imported data resources linked to exactly one parent layer.

create table datasets (
  id                uuid        primary key default gen_random_uuid(),
  layer_id          uuid        not null references layers(id) on delete cascade,
  name              text        not null,
  license           text,
  license_url       text,
  attribution       text,
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

create index datasets_layer_id_idx on datasets(layer_id);

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


-- ─── Collaborators ────────────────────────────────────────────────────────────

create table layer_collaborators (
  layer_id  uuid  references layers(id) on delete cascade,
  user_id   uuid  references auth.users on delete cascade,
  role      text  not null default 'contributor'
                  check (role in ('contributor', 'moderator', 'owner')),
  primary key (layer_id, user_id)
);

alter table layer_collaborators enable row level security;

-- Security-definer helpers bypass RLS to break circular policy dependencies.
create or replace function is_layer_owner(p_layer_id uuid)
returns boolean language sql security definer stable as $$
  select exists (select 1 from layers where id = p_layer_id and owner_id = auth.uid())
$$;

create or replace function is_layer_collaborator(p_layer_id uuid)
returns boolean language sql security definer stable as $$
  select exists (select 1 from layer_collaborators where layer_id = p_layer_id and user_id = auth.uid())
$$;

create policy "collaborators readable by layer members"
  on layer_collaborators for select
  using (is_layer_owner(layer_id) or user_id = auth.uid());

create policy "owners manage collaborators"
  on layer_collaborators for all
  using (is_layer_owner(layer_id));

-- Deferred until after layer_collaborators exists
create policy "private layers are readable by owner and collaborators"
  on layers for select
  using (
    view_access = 'private'
    and (owner_id = auth.uid() or is_layer_collaborator(id))
  );


-- ─── Features ─────────────────────────────────────────────────────────────────

create table features (
  id          uuid        primary key default gen_random_uuid(),
  dataset_id  uuid        not null references datasets(id) on delete cascade,

  -- PostGIS handles point / line / polygon in one column
  geometry    geometry(Geometry, 4326) not null,

  -- Everything else: label, value, category, media_url, links, etc.
  -- No fixed schema — flexible by design.
  properties  jsonb       not null default '{}',

  -- Temporal range. Null = always visible.
  valid_from  timestamptz,
  valid_to    timestamptz,

  created_at  timestamptz not null default now()
);

alter table features enable row level security;

-- Spatial index — essential for viewport queries
create index features_geometry_idx  on features using gist(geometry);
create index features_dataset_id_idx on features(dataset_id);
create index features_valid_from_idx on features(valid_from);
create index features_valid_to_idx   on features(valid_to);

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

-- Allow unauthenticated feature inserts for dev. Remove once auth is added.
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

-- Keep feature_count summary fields in sync.
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


-- ─── Submissions ──────────────────────────────────────────────────────────────
-- Used by 'open' and 'moderated' layers.
-- 'open' layers auto-approve via trigger. 'closed' layers bypass this entirely.

create table feature_submissions (
  id            uuid        primary key default gen_random_uuid(),
  layer_id      uuid        not null references layers(id) on delete cascade,
  dataset_id    uuid        not null references datasets(id) on delete cascade,
  submitted_by  uuid        references auth.users on delete set null,  -- null = anonymous
  feature       jsonb       not null,  -- GeoJSON Feature, pending review
  status        text        not null default 'pending'
                            check (status in ('pending', 'approved', 'rejected')),
  note          text,                 -- moderator note on rejection
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

-- Auto-approve submissions for 'open' layers
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


-- ─── Saved views ──────────────────────────────────────────────────────────────

create table saved_views (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users on delete cascade,
  name         text        not null,
  config       jsonb       not null,  -- full layer state snapshot
  is_default   boolean     not null default false,
  share_token  text        unique,    -- set when shared → /v/<token>
  created_at   timestamptz not null default now()
);

alter table saved_views enable row level security;

create policy "users manage their own views"
  on saved_views for all
  using (user_id = auth.uid());

create policy "shared views readable by anyone"
  on saved_views for select
  using (share_token is not null);

-- Only one default view per user
create unique index one_default_view_per_user
  on saved_views(user_id) where is_default = true;


-- ─── GeoJSON export function ──────────────────────────────────────────────────
-- Called directly from the map: ?p_layer_id=<uuid>
-- Returns a GeoJSON FeatureCollection for the layer.

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


-- ─── Storage ──────────────────────────────────────────────────────────────────
-- Public bucket for generated render artifacts.

insert into storage.buckets (id, name, public)
values ('layer-files', 'layer-files', true)
on conflict (id) do nothing;

create policy "Public read on layer-files"
  on storage.objects for select
  using (bucket_id = 'layer-files');

create policy "Anyone can upload to layer-files"
  on storage.objects for insert
  with check (bucket_id = 'layer-files');

create policy "Anyone can update layer-files"
  on storage.objects for update
  using (bucket_id = 'layer-files');
