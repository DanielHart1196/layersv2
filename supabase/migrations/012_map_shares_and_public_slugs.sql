create table if not exists map_shares (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

alter table map_shares enable row level security;

drop policy if exists "map shares are readable by anyone" on map_shares;
create policy "map shares are readable by anyone"
  on map_shares for select
  using (true);

drop policy if exists "anyone can create map shares" on map_shares;
create policy "anyone can create map shares"
  on map_shares for insert
  with check (true);

create table if not exists public_view_slugs (
  slug text primary key
    check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  map_share_id uuid not null references map_shares(id) on delete cascade,
  owner_id uuid references auth.users on delete set null,
  status text not null default 'active'
    check (status in ('active', 'reserved', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public_view_slugs enable row level security;

create index if not exists public_view_slugs_map_share_id_idx
  on public_view_slugs(map_share_id);

drop policy if exists "active public slugs are readable by anyone" on public_view_slugs;
create policy "active public slugs are readable by anyone"
  on public_view_slugs for select
  using (status = 'active');

drop policy if exists "owners can manage public slugs" on public_view_slugs;
create policy "owners can manage public slugs"
  on public_view_slugs for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
