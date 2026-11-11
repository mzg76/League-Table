-- FIFA League database setup.
-- Paste ALL of this into Supabase → SQL Editor → New query, then tap "Run".
-- Safe to run more than once.

create table if not exists public.players (
  id   text primary key,
  name text not null default '',
  team text not null default ''
);

create table if not exists public.matches (
  id          text primary key,
  home        text not null references public.players(id),
  away        text not null references public.players(id),
  home_goals  int check (home_goals between 0 and 99),
  away_goals  int check (away_goals between 0 and 99),
  created_at  timestamptz not null default now()
);

-- No logins: anyone with the app link can read and write.
alter table public.players enable row level security;
alter table public.matches enable row level security;

drop policy if exists "open access" on public.players;
create policy "open access" on public.players for all to anon, authenticated using (true) with check (true);
drop policy if exists "open access" on public.matches;
create policy "open access" on public.matches for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.players, public.matches to anon, authenticated;

-- Turn on live updates for both tables.
do $$
begin
  begin alter publication supabase_realtime add table public.players; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.matches; exception when duplicate_object then null; end;
end $$;

-- Starting data: 3 players, 6 fixtures (everyone plays everyone home and away).
insert into public.players (id, name, team) values
  ('p1', 'Zayn',  'United'),
  ('p2', 'Adil',  'Spurs'),
  ('p3', 'Anant', 'Chelsea')
on conflict (id) do nothing;

insert into public.matches (id, home, away, created_at) values
  ('seed-1', 'p1', 'p2', '2026-01-01T00:00:00Z'),
  ('seed-2', 'p2', 'p3', '2026-01-01T00:01:00Z'),
  ('seed-3', 'p3', 'p1', '2026-01-01T00:02:00Z'),
  ('seed-4', 'p2', 'p1', '2026-01-01T00:03:00Z'),
  ('seed-5', 'p3', 'p2', '2026-01-01T00:04:00Z'),
  ('seed-6', 'p1', 'p3', '2026-01-01T00:05:00Z')
on conflict (id) do nothing;
