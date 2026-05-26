-- Sailors choose hull per race entry; hulls on signup have no privileged "primary".

drop index if exists public.series_registration_boats_one_primary_idx;

alter table public.series_registration_boats
  drop column if exists is_primary;

comment on table public.series_registration_boats is 'Boats a sailor attaches to a series signup; hull for racing is chosen on each race entry.';
