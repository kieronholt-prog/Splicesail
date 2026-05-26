-- Fleet hull validity window: soft-retire preserves rows for results; active picks use valid_to > now.

alter table public.boats
  add column if not exists valid_from timestamptz,
  add column if not exists valid_to timestamptz;

update public.boats
set
  valid_from = coalesce(created_at, now()),
  valid_to = timestamptz '2099-12-31 23:59:59+00'
where valid_from is null;

alter table public.boats
  alter column valid_from set not null,
  alter column valid_from set default now(),
  alter column valid_to set not null,
  alter column valid_to set default timestamptz '2099-12-31 23:59:59+00';

comment on column public.boats.valid_from is
  'When this hull became active in the sailor’s fleet (system-maintained).';

comment on column public.boats.valid_to is
  'Hull active for new series picks until this time; set to removal time when soft-deleted (racing history unchanged).';

create or replace function public.enforce_series_registration_boat_active()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.boats b
    where b.id = new.boat_id
      and b.valid_to > now()
  ) then
    raise exception 'That hull is not active in the sailor''s fleet.';
  end if;
  return new;
end;
$$;

drop trigger if exists series_registration_boats_boat_must_be_active on public.series_registration_boats;

create trigger series_registration_boats_boat_must_be_active
  before insert on public.series_registration_boats
  for each row
  execute function public.enforce_series_registration_boat_active();
