-- Existing `points` data can be dropped for this migration.
drop table if exists points;

create table if not exists tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  path jsonb not null,
  point_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, started_at, ended_at)
);

create index if not exists idx_tracks_user_started_at
  on tracks (user_id, started_at);

alter table tracks enable row level security;

create policy "tracks_select_own"
  on tracks for select
  using (auth.uid() = user_id);

create policy "tracks_insert_own"
  on tracks for insert
  with check (auth.uid() = user_id);

create policy "tracks_update_own"
  on tracks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
