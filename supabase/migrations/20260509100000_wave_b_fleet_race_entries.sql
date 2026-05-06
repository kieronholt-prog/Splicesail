-- Wave B (MVP): sailor fleet (boats + crew template), race entries, afloat/ashore tally.
-- Rig dimensions deferred to rig_settings_json on race_entries (structured UI later).

-- -----------------------------------------------------------------------------
-- Boats (fleet)
-- -----------------------------------------------------------------------------

create table public.boats (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  label text not null check (length(trim(label)) > 0),
  class_name text,
  default_sail_number text,
  handedness text not null default 'double'
    check (handedness in ('single', 'double', 'triple_plus')),
  crew_template jsonb not null default '{
    "helm": {"use_account_owner": true, "contact_name": null, "contact_phone": null},
    "crew": [
      {"use_account_owner": true, "contact_name": null, "contact_phone": null}
    ]
  }'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.boats is 'Sailor fleet boat; crew_template JSON aligns with Wave B helm/crew toggles.';

create index boats_owner_user_id_idx on public.boats (owner_user_id);

create or replace function public.boats_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger boats_set_updated_at
  before update on public.boats
  for each row
  execute function public.boats_set_updated_at();

alter table public.boats enable row level security;

create policy "boats_owner_select"
  on public.boats for select to authenticated
  using (owner_user_id = auth.uid());

create policy "boats_owner_insert"
  on public.boats for insert to authenticated
  with check (owner_user_id = auth.uid());

create policy "boats_owner_update"
  on public.boats for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "boats_owner_delete"
  on public.boats for delete to authenticated
  using (owner_user_id = auth.uid());

grant select, insert, update, delete on table public.boats to authenticated;
grant all on table public.boats to service_role;

-- -----------------------------------------------------------------------------
-- Race entries (per scheduled race)
-- -----------------------------------------------------------------------------

create table public.race_entries (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  boat_id uuid references public.boats (id) on delete set null,
  sail_number_override text,
  tally_afloat_at timestamptz,
  tally_ashore_at timestamptz,
  outcome text check (
    outcome is null
    or outcome in ('finished', 'retired', 'dnf', 'dns')
  ),
  rig_settings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (race_id, user_id)
);

comment on table public.race_entries is 'Sailor participation for one race: boat, tally checkpoints, outcome.';

create index race_entries_race_id_idx on public.race_entries (race_id);
create index race_entries_user_id_idx on public.race_entries (user_id);

create or replace function public.race_entries_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger race_entries_set_updated_at
  before update on public.race_entries
  for each row
  execute function public.race_entries_set_updated_at();

-- Must be registered for the series before entering races in it.
create or replace function public.enforce_race_entry_series_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sid uuid;
begin
  select r.series_id into sid from public.races r where r.id = new.race_id;
  if sid is null then
    raise exception 'Race not found';
  end if;
  if not exists (
    select 1 from public.series_registrations sr
    where sr.series_id = sid and sr.user_id = new.user_id
  ) then
    raise exception 'Register for the series before entering a race';
  end if;
  return new;
end;
$$;

create trigger race_entries_require_series_registration
  before insert or update of race_id, user_id on public.race_entries
  for each row
  execute function public.enforce_race_entry_series_registration();

-- Boat must belong to the entrant when supplied.
create or replace function public.enforce_race_entry_boat_owner()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.boat_id is not null then
    if not exists (
      select 1 from public.boats b
      where b.id = new.boat_id and b.owner_user_id = new.user_id
    ) then
      raise exception 'Selected boat must belong to you';
    end if;
  end if;
  return new;
end;
$$;

create trigger race_entries_boat_owner_check
  before insert or update of boat_id, user_id on public.race_entries
  for each row
  execute function public.enforce_race_entry_boat_owner();

alter table public.race_entries enable row level security;

create policy "race_entries_select_group_member"
  on public.race_entries for select to authenticated
  using (
    exists (
      select 1
      from public.races r
      join public.series s on s.id = r.series_id
      where r.id = race_entries.race_id
        and public.is_group_member(s.group_id)
    )
  );

create policy "race_entries_insert_self"
  on public.race_entries for insert to authenticated
  with check (user_id = auth.uid());

create policy "race_entries_update_self_or_staff"
  on public.race_entries for update to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.races r
      join public.series s on s.id = r.series_id
      join public.group_memberships m
        on m.group_id = s.group_id and m.user_id = auth.uid()
      where r.id = race_entries.race_id
        and m.role in ('club_admin', 'race_officer')
    )
  )
  with check (
    user_id = auth.uid()
    or exists (
      select 1
      from public.races r
      join public.series s on s.id = r.series_id
      join public.group_memberships m
        on m.group_id = s.group_id and m.user_id = auth.uid()
      where r.id = race_entries.race_id
        and m.role in ('club_admin', 'race_officer')
    )
  );

create policy "race_entries_delete_self_or_admin"
  on public.race_entries for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.races r
      join public.series s on s.id = r.series_id
      where r.id = race_entries.race_id
        and public.is_group_admin(s.group_id)
    )
  );

grant select, insert, update, delete on table public.race_entries to authenticated;
grant all on table public.race_entries to service_role;
