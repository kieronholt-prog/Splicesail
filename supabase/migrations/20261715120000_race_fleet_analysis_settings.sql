-- Per-race-fleet collated track analysis setup (course, laps, mark positions).
-- Replaces race-wide race_analysis_settings for RO workflow.

create table public.race_fleet_analysis_settings (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  race_fleet_id uuid not null unique references public.race_fleets (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  course_letter text,
  laps int not null default 1 check (laps >= 1 and laps <= 20),
  wind_direction double precision,
  mark_overrides jsonb not null default '{}'::jsonb,
  course_setup jsonb not null default '{}'::jsonb,
  det_settings jsonb not null default '{}'::jsonb,
  ro_confirmed_at timestamptz,
  ro_confirmed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index race_fleet_analysis_settings_race_id_idx on public.race_fleet_analysis_settings (race_id);
create index race_fleet_analysis_settings_group_id_idx on public.race_fleet_analysis_settings (group_id);

comment on table public.race_fleet_analysis_settings is
  'RO-confirmed course and mark setup per race fleet for collated GPS analysis.';

-- Copy existing race-wide settings onto each fleet for the race.
insert into public.race_fleet_analysis_settings (
  race_id,
  race_fleet_id,
  group_id,
  course_letter,
  laps,
  wind_direction,
  mark_overrides,
  course_setup,
  det_settings,
  ro_confirmed_at,
  ro_confirmed_by,
  created_at,
  updated_at
)
select
  ras.race_id,
  rf.id,
  ras.group_id,
  ras.course_letter,
  ras.laps,
  ras.wind_direction,
  ras.mark_overrides,
  ras.course_setup,
  ras.det_settings,
  ras.ro_confirmed_at,
  ras.ro_confirmed_by,
  ras.created_at,
  ras.updated_at
from public.race_analysis_settings ras
join public.race_fleets rf on rf.race_id = ras.race_id;

alter table public.race_fleet_analysis_settings enable row level security;

create policy race_fleet_analysis_settings_staff on public.race_fleet_analysis_settings
  for all to authenticated
  using (public.is_group_race_staff(group_id))
  with check (public.is_group_race_staff(group_id));

create policy race_fleet_analysis_settings_member_select on public.race_fleet_analysis_settings
  for select to authenticated
  using (public.is_group_member(group_id));

comment on table public.race_analysis_settings is
  'Deprecated: use race_fleet_analysis_settings. Retained for rollback; app no longer writes here.';
