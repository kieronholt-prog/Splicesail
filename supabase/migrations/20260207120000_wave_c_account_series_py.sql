-- Wave C: account intro flag, PY class table, series schedule fields, optional group PY overrides.

-- -----------------------------------------------------------------------------
-- profiles: first-time account redirect gate
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists has_finished_account_intro boolean not null default false;

comment on column public.profiles.has_finished_account_intro is 'After first visit/save on Account, login sends user home instead of /account.';

-- -----------------------------------------------------------------------------
-- RYA / system default PY by class (backend can expand; seed minimal set)
-- -----------------------------------------------------------------------------

create table if not exists public.rya_class_py (
  class_key text primary key,
  display_name text not null,
  py int not null check (py between 400 and 2500)
);

comment on table public.rya_class_py is 'System default Portsmouth numbers by normalized class key; group overrides in group_class_py.';

insert into public.rya_class_py (class_key, display_name, py) values
  ('ilca_7', 'ILCA 7', 1103),
  ('ilca_6', 'ILCA 6', 1150),
  ('ilca_4', 'ILCA 4', 1208),
  ('laser', 'Laser / ILCA 7', 1103),
  ('gp14', 'GP14', 1133),
  ('rs_200', 'RS200', 1046),
  ('rs_400', 'RS400', 942),
  ('rs_500', 'RS500', 966),
  ('merlin_rocket', 'Merlin Rocket', 980),
  ('dart_16', 'Dart 16', 1030)
on conflict (class_key) do nothing;

alter table public.rya_class_py enable row level security;

create policy "rya_class_py_select_authenticated"
  on public.rya_class_py
  for select
  to authenticated
  using (true);

grant select on table public.rya_class_py to authenticated;
grant all on table public.rya_class_py to service_role;

-- -----------------------------------------------------------------------------
-- Group-level PY override (optional; series can prefer this over system default)
-- -----------------------------------------------------------------------------

create table if not exists public.group_class_py (
  group_id uuid not null references public.groups (id) on delete cascade,
  class_key text not null,
  py int not null check (py between 400 and 2500),
  primary key (group_id, class_key)
);

comment on table public.group_class_py is 'Club override for Portsmouth number per class_key (same normalization as boats).';

create index group_class_py_group_idx on public.group_class_py (group_id);

alter table public.group_class_py enable row level security;

create policy "group_class_py_select_member"
  on public.group_class_py
  for select
  to authenticated
  using (public.is_group_member(group_id));

create policy "group_class_py_insert_admin"
  on public.group_class_py
  for insert
  to authenticated
  with check (public.is_group_admin(group_id));

create policy "group_class_py_update_admin"
  on public.group_class_py
  for update
  to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

create policy "group_class_py_delete_admin"
  on public.group_class_py
  for delete
  to authenticated
  using (public.is_group_admin(group_id));

grant select, insert, update, delete on table public.group_class_py to authenticated;
grant all on table public.group_class_py to service_role;

-- -----------------------------------------------------------------------------
-- series: start sequence & automated schedule template
-- -----------------------------------------------------------------------------

alter table public.series
  add column if not exists start_sequence text not null default '5_4_1_go';

alter table public.series
  add constraint series_start_sequence_check
  check (start_sequence in ('10_5_1_go', '5_4_1_go', '3_2_1_go'))
  not valid;

alter table public.series validate constraint series_start_sequence_check;

alter table public.series add column if not exists race_periodicity text;

alter table public.series
  add constraint series_race_periodicity_check
  check (
    race_periodicity is null
    or race_periodicity in ('daily', 'weekly', 'monthly')
  )
  not valid;

alter table public.series validate constraint series_race_periodicity_check;

alter table public.series add column if not exists races_per_period int;

alter table public.series
  add constraint series_races_per_period_check
  check (
    races_per_period is null
    or (races_per_period >= 1 and races_per_period <= 20)
  )
  not valid;

alter table public.series validate constraint series_races_per_period_check;

alter table public.series add column if not exists minutes_between_races int;

alter table public.series
  add constraint series_gap_check
  check (
    minutes_between_races is null
    or (minutes_between_races >= 1 and minutes_between_races <= 24 * 60)
  )
  not valid;

alter table public.series validate constraint series_gap_check;

alter table public.series add column if not exists schedule_first_start_at timestamptz;

comment on column public.series.start_sequence is 'Countdown horns end at scheduled race start time; applies to all races in series.';
comment on column public.series.race_periodicity is 'daily | weekly | monthly template for generating races.';
comment on column public.series.schedule_first_start_at is 'UTC instant of race 1 in period 1 (template for generators).';
