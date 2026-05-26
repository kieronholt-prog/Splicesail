-- Race types: handicap (Portsmouth), level_rated (positional finish), pursuit (class stagger + positional finish).

alter table public.series
  add column if not exists default_race_type text not null default 'handicap'
    check (default_race_type in ('handicap', 'level_rated', 'pursuit'));

comment on column public.series.default_race_type is
  'Default race_type for races created from the series generator.';

alter table public.series
  add column if not exists pursuit_template_fleet_id uuid references public.group_fleets (id) on delete set null;

comment on column public.series.pursuit_template_fleet_id is
  'Single club fleet used when default_race_type is pursuit (class set + PY for start sheet).';

alter table public.races
  add column if not exists race_type text not null default 'handicap'
    check (race_type in ('handicap', 'level_rated', 'pursuit'));

comment on column public.races.race_type is
  'handicap = Portsmouth corrected time; level_rated = finish position; pursuit = class stagger starts + positional finish.';

alter table public.races
  add column if not exists pursuit_finish_at timestamptz,
  add column if not exists pursuit_first_start_at timestamptz,
  add column if not exists pursuit_start_increment_seconds integer
    check (
      pursuit_start_increment_seconds is null
      or pursuit_start_increment_seconds in (30, 60, 120)
    ),
  add column if not exists pursuit_group_fleet_id uuid references public.group_fleets (id) on delete set null;

comment on column public.races.pursuit_finish_at is 'Target finish time for pursuit race (club wall clock stored as UTC).';
comment on column public.races.pursuit_first_start_at is 'Start time for slowest class (first pursuit gun).';
comment on column public.races.pursuit_start_increment_seconds is 'Round class starts to 30, 60, or 120 second grid.';
comment on column public.races.pursuit_group_fleet_id is 'Club fleet defining pursuit class set and tally scope.';

create table public.race_pursuit_py_overrides (
  race_id uuid not null references public.races (id) on delete cascade,
  class_key text not null references public.boat_classes (class_key) on delete restrict,
  py integer not null check (py >= 400 and py <= 2500),
  primary key (race_id, class_key)
);

comment on table public.race_pursuit_py_overrides is
  'Per-race PY override for pursuit start calculation (independent of entries).';

create table public.race_pursuit_start_slots (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  slot_index integer not null check (slot_index >= 0),
  start_at timestamptz not null,
  sort_order integer not null default 0,
  unique (race_id, slot_index)
);

create index race_pursuit_start_slots_race_id_idx on public.race_pursuit_start_slots (race_id);

comment on table public.race_pursuit_start_slots is
  'Materialised pursuit start intervals; multiple classes may share a slot when rounded to the same time.';

create table public.race_pursuit_start_slot_classes (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.race_pursuit_start_slots (id) on delete cascade,
  class_key text not null references public.boat_classes (class_key) on delete restrict,
  effective_py integer not null check (effective_py >= 400 and effective_py <= 2500),
  unique (slot_id, class_key)
);

create index race_pursuit_start_slot_classes_slot_id_idx
  on public.race_pursuit_start_slot_classes (slot_id);

alter table public.race_finishes
  add column if not exists finish_position integer
    check (finish_position is null or finish_position >= 1);

comment on column public.race_finishes.finish_position is
  'Explicit finish place within fleet for level_rated and pursuit races; null for handicap.';

alter table public.race_guest_finishes
  add column if not exists finish_position integer
    check (finish_position is null or finish_position >= 1);

-- RLS: pursuit tables (member read, admin write; staff read for RO)

alter table public.race_pursuit_py_overrides enable row level security;
alter table public.race_pursuit_start_slots enable row level security;
alter table public.race_pursuit_start_slot_classes enable row level security;

create policy "race_pursuit_py_overrides_select_member"
  on public.race_pursuit_py_overrides for select to authenticated
  using (
    exists (
      select 1 from public.races r
      join public.series s on s.id = r.series_id
      where r.id = race_pursuit_py_overrides.race_id
        and public.is_group_member(s.group_id)
    )
  );

create policy "race_pursuit_py_overrides_write_admin"
  on public.race_pursuit_py_overrides for all to authenticated
  using (
    exists (
      select 1 from public.races r
      join public.series s on s.id = r.series_id
      where r.id = race_pursuit_py_overrides.race_id
        and public.is_group_admin(s.group_id)
    )
  )
  with check (
    exists (
      select 1 from public.races r
      join public.series s on s.id = r.series_id
      where r.id = race_pursuit_py_overrides.race_id
        and public.is_group_admin(s.group_id)
    )
  );

create policy "race_pursuit_start_slots_select_member"
  on public.race_pursuit_start_slots for select to authenticated
  using (
    exists (
      select 1 from public.races r
      join public.series s on s.id = r.series_id
      where r.id = race_pursuit_start_slots.race_id
        and public.is_group_member(s.group_id)
    )
  );

create policy "race_pursuit_start_slots_write_admin"
  on public.race_pursuit_start_slots for all to authenticated
  using (
    exists (
      select 1 from public.races r
      join public.series s on s.id = r.series_id
      where r.id = race_pursuit_start_slots.race_id
        and public.is_group_admin(s.group_id)
    )
  )
  with check (
    exists (
      select 1 from public.races r
      join public.series s on s.id = r.series_id
      where r.id = race_pursuit_start_slots.race_id
        and public.is_group_admin(s.group_id)
    )
  );

create policy "race_pursuit_start_slot_classes_select_member"
  on public.race_pursuit_start_slot_classes for select to authenticated
  using (
    exists (
      select 1 from public.race_pursuit_start_slots sl
      join public.races r on r.id = sl.race_id
      join public.series s on s.id = r.series_id
      where sl.id = race_pursuit_start_slot_classes.slot_id
        and public.is_group_member(s.group_id)
    )
  );

create policy "race_pursuit_start_slot_classes_write_admin"
  on public.race_pursuit_start_slot_classes for all to authenticated
  using (
    exists (
      select 1 from public.race_pursuit_start_slots sl
      join public.races r on r.id = sl.race_id
      join public.series s on s.id = r.series_id
      where sl.id = race_pursuit_start_slot_classes.slot_id
        and public.is_group_admin(s.group_id)
    )
  )
  with check (
    exists (
      select 1 from public.race_pursuit_start_slots sl
      join public.races r on r.id = sl.race_id
      join public.series s on s.id = r.series_id
      where sl.id = race_pursuit_start_slot_classes.slot_id
        and public.is_group_admin(s.group_id)
    )
  );

grant select on table public.race_pursuit_py_overrides to authenticated;
grant select, insert, update, delete on table public.race_pursuit_py_overrides to authenticated;
grant select on table public.race_pursuit_start_slots to authenticated;
grant select, insert, update, delete on table public.race_pursuit_start_slots to authenticated;
grant select on table public.race_pursuit_start_slot_classes to authenticated;
grant select, insert, update, delete on table public.race_pursuit_start_slot_classes to authenticated;

grant all on table public.race_pursuit_py_overrides to service_role;
grant all on table public.race_pursuit_start_slots to service_role;
grant all on table public.race_pursuit_start_slot_classes to service_role;

-- Anon public results read (match series_scoring_config pattern)

grant select on table public.race_pursuit_start_slots to anon;
grant select on table public.race_pursuit_start_slot_classes to anon;

create policy "race_pursuit_start_slots_select_public_results_anon"
  on public.race_pursuit_start_slots for select to anon
  using (public.race_in_public_results_group(race_id));

create policy "race_pursuit_start_slot_classes_select_public_results_anon"
  on public.race_pursuit_start_slot_classes for select to anon
  using (
    exists (
      select 1 from public.race_pursuit_start_slots sl
      where sl.id = race_pursuit_start_slot_classes.slot_id
        and public.race_in_public_results_group(sl.race_id)
    )
  );
