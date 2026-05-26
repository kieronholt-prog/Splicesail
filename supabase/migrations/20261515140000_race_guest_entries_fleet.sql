-- Fleet for race-only (adhoc) guest rows — same race_fleets as official entries.

alter table public.race_guest_entries
  add column if not exists fleet_id uuid references public.race_fleets (id) on delete set null;

create index if not exists race_guest_entries_fleet_id_idx
  on public.race_guest_entries (fleet_id)
  where fleet_id is not null;

comment on column public.race_guest_entries.fleet_id is
  'Race start group for this row (from race_fleets rules using ad-hoc class/PY; null if no match or no fleets).';
