-- Club admin: whether race-officer "added" (adhoc) boats carry into later series races.

alter table public.groups
  add column ro_added_boats_series_start_line boolean not null default false,
  add column ro_added_boats_series_standings boolean not null default false;

comment on column public.groups.ro_added_boats_series_start_line is
  'When true, adhoc RO-added boats from earlier races in a series appear on the start line of later races (until entered for that race).';

comment on column public.groups.ro_added_boats_series_standings is
  'When true, adhoc RO-added boats count in series standings (aggregated by sail number and class across races).';
