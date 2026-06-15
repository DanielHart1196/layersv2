-- Allow the current unauthenticated upload/catalog workflow to delete layers it
-- creates without an owner. Remove or tighten this when auth ownership ships.

create policy "anon can delete anon non-private layers"
  on layers for delete
  using (owner_id is null and view_access in ('public', 'unlisted'));
