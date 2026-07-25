-- Server-side filtered GeoJSON export for default-scoped layer startup.
-- This avoids loading every feature into the browser when defaults can be
-- represented as simple property comparisons.

create or replace function get_layer_geojson_filtered(
  p_layer_id uuid,
  p_conditions jsonb default '[]'::jsonb,
  p_combinator text default 'all'
)
returns json language sql stable security definer as $$
  with conditions as (
    select
      trim(condition.value ->> 'field') as field,
      coalesce(condition.value ->> 'op', '==') as op,
      coalesce(condition.value ->> 'type', 'text') as value_type,
      condition.value ->> 'value' as value
    from jsonb_array_elements(coalesce(p_conditions, '[]'::jsonb)) as condition(value)
    where trim(coalesce(condition.value ->> 'field', '')) <> ''
  ),
  matched_features as (
    select f.*, d.id as dataset_id, d.name as dataset_name
    from features f
    join datasets d on d.id = f.dataset_id
    where d.layer_id = p_layer_id
      and (
        not exists (select 1 from conditions)
        or (
          lower(coalesce(p_combinator, 'all')) = 'any'
          and exists (
            select 1
            from conditions c
            where case
              when c.op in ('>', '>=', '<', '<=') then
                case
                  when (f.properties ->> c.field) ~ '^-?[0-9]+(\.[0-9]+)?$'
                    and c.value ~ '^-?[0-9]+(\.[0-9]+)?$'
                    and c.op = '>' then (f.properties ->> c.field)::numeric > c.value::numeric
                  when (f.properties ->> c.field) ~ '^-?[0-9]+(\.[0-9]+)?$'
                    and c.value ~ '^-?[0-9]+(\.[0-9]+)?$'
                    and c.op = '>=' then (f.properties ->> c.field)::numeric >= c.value::numeric
                  when (f.properties ->> c.field) ~ '^-?[0-9]+(\.[0-9]+)?$'
                    and c.value ~ '^-?[0-9]+(\.[0-9]+)?$'
                    and c.op = '<' then (f.properties ->> c.field)::numeric < c.value::numeric
                  when (f.properties ->> c.field) ~ '^-?[0-9]+(\.[0-9]+)?$'
                    and c.value ~ '^-?[0-9]+(\.[0-9]+)?$'
                    and c.op = '<=' then (f.properties ->> c.field)::numeric <= c.value::numeric
                  else false
                end
              when c.op in ('==', '=') then coalesce(f.properties ->> c.field, '') = coalesce(c.value, '')
              when c.op = '!=' then coalesce(f.properties ->> c.field, '') <> coalesce(c.value, '')
              else false
            end
          )
        )
        or (
          lower(coalesce(p_combinator, 'all')) <> 'any'
          and not exists (
            select 1
            from conditions c
            where not (
              case
              when c.op in ('>', '>=', '<', '<=') then
                case
                  when (f.properties ->> c.field) ~ '^-?[0-9]+(\.[0-9]+)?$'
                    and c.value ~ '^-?[0-9]+(\.[0-9]+)?$'
                    and c.op = '>' then (f.properties ->> c.field)::numeric > c.value::numeric
                  when (f.properties ->> c.field) ~ '^-?[0-9]+(\.[0-9]+)?$'
                    and c.value ~ '^-?[0-9]+(\.[0-9]+)?$'
                    and c.op = '>=' then (f.properties ->> c.field)::numeric >= c.value::numeric
                  when (f.properties ->> c.field) ~ '^-?[0-9]+(\.[0-9]+)?$'
                    and c.value ~ '^-?[0-9]+(\.[0-9]+)?$'
                    and c.op = '<' then (f.properties ->> c.field)::numeric < c.value::numeric
                  when (f.properties ->> c.field) ~ '^-?[0-9]+(\.[0-9]+)?$'
                    and c.value ~ '^-?[0-9]+(\.[0-9]+)?$'
                    and c.op = '<=' then (f.properties ->> c.field)::numeric <= c.value::numeric
                  else false
                end
              when c.op in ('==', '=') then coalesce(f.properties ->> c.field, '') = coalesce(c.value, '')
              when c.op = '!=' then coalesce(f.properties ->> c.field, '') <> coalesce(c.value, '')
              else false
              end
            )
          )
        )
      )
  )
  select json_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(
      json_agg(
        json_build_object(
          'type', 'Feature',
          'id', f.id,
          'geometry', ST_AsGeoJSON(f.geometry)::json,
          'properties', f.properties || jsonb_build_object(
            '_id', f.id,
            '_dataset_id', f.dataset_id,
            '_dataset_name', f.dataset_name,
            '_valid_from', f.valid_from,
            '_valid_to', f.valid_to,
            '_created_at', f.created_at
          )
        )
        order by f.created_at
      ),
      '[]'::json
    )
  )
  from matched_features f;
$$;
