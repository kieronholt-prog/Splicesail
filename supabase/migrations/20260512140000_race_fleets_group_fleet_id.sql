-- Link race fleets to the club fleet they were created from (class flag comes from group_fleets).

alter table public.race_fleets
  add column if not exists group_fleet_id uuid references public.group_fleets (id) on delete set null;

create index if not exists race_fleets_group_fleet_id_idx on public.race_fleets (group_fleet_id);

comment on column public.race_fleets.group_fleet_id is 'Optional link to club fleet; pennant/class flag is read from group_fleets.class_flag.';

-- Best-effort backfill: match race fleet name to club fleet name within the same club.
-- (Target alias `rf` must not appear inside FROM join ON — use WHERE predicates instead.)
update public.race_fleets rf
set group_fleet_id = gf.id
from public.group_fleets gf,
     public.races r,
     public.series s
where rf.race_id = r.id
  and r.series_id = s.id
  and gf.group_id = s.group_id
  and lower(trim(gf.name)) = lower(trim(rf.name))
  and rf.group_fleet_id is null;
