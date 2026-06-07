-- Return distinct property values for filter selectors without loading every
-- feature properties object into the browser. The limit is a page size; callers
-- should continue with p_offset until fewer than p_limit rows are returned.

create index if not exists features_properties_gin_idx
  on features using gin (properties);

create or replace function get_layer_property_values(
  p_layer_id uuid,
  p_field_key text,
  p_limit int default 500,
  p_offset int default 0
)
returns table(value text)
language sql
stable
set search_path = public
as $$
  select distinct f.properties ->> trim(coalesce(p_field_key, '')) as value
  from features f
  join datasets d on d.id = f.dataset_id
  where d.layer_id = p_layer_id
    and length(trim(coalesce(p_field_key, ''))) > 0
    and f.properties ? trim(coalesce(p_field_key, ''))
    and f.properties ->> trim(coalesce(p_field_key, '')) is not null
  order by value
  limit greatest(1, least(1000, coalesce(p_limit, 500)))
  offset greatest(0, coalesce(p_offset, 0));
$$;
