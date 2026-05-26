-- Scratch / guest racing: admins create name-only sailors and club-local guest boats so RO can finish
-- boats without a signed-in sailor. Optionally link guests to signed-up users and boats.

-- -----------------------------------------------------------------------------
-- club_guest_sailors (first / last only; optional link to auth user when they join)
-- -----------------------------------------------------------------------------

create table public.club_guest_sailors (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  first_name text not null check (length(trim(first_name)) > 0),
  last_name text not null check (length(trim(last_name)) > 0),
  linked_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.club_guest_sailors is
  'Club-scratch sailor (no Auth account yet). Optionally linked_user_id ties to member after signup.';

create index club_guest_sailors_group_id_idx on public.club_guest_sailors (group_id);

create trigger club_guest_sailors_set_updated_at
  before update on public.club_guest_sailors
  for each row
  execute function public.profiles_set_updated_at();

alter table public.club_guest_sailors enable row level security;

create policy "club_guest_sailors_select_same_group_member"
  on public.club_guest_sailors
  for select
  to authenticated
  using (public.is_group_member(group_id));

create policy "club_guest_sailors_insert_admin"
  on public.club_guest_sailors
  for insert
  to authenticated
  with check (public.is_group_admin(group_id));

create policy "club_guest_sailors_update_admin"
  on public.club_guest_sailors
  for update
  to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

create policy "club_guest_sailors_delete_admin"
  on public.club_guest_sailors
  for delete
  to authenticated
  using (public.is_group_admin(group_id));

grant select, insert, update, delete on table public.club_guest_sailors to authenticated;
grant all on table public.club_guest_sailors to service_role;

-- -----------------------------------------------------------------------------
-- club_guest_boats (scratch hull metadata; optionally linked_boat_id -> permanent boats)
-- -----------------------------------------------------------------------------

create table public.club_guest_boats (
  id uuid primary key default gen_random_uuid(),
  guest_sailor_id uuid not null references public.club_guest_sailors (id) on delete cascade,
  label text not null check (length(trim(label)) > 0),
  class_name text,
  default_sail_number text,
  rya_class_key text references public.boat_classes (class_key),
  linked_boat_id uuid references public.boats (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.club_guest_boats is
  'Hull record for scratch racing; optionally linked_boat_id points at the sailor’s real boats row.';

comment on column public.club_guest_boats.linked_boat_id is
  'When set, this scratch hull corresponds to rows in public.boats (typically after the sailor joins).';

create index club_guest_boats_guest_sailor_id_idx on public.club_guest_boats (guest_sailor_id);

create unique index club_guest_boats_linked_boat_id_unique_idx
  on public.club_guest_boats (linked_boat_id)
  where linked_boat_id is not null;

create trigger club_guest_boats_set_updated_at
  before update on public.club_guest_boats
  for each row
  execute function public.profiles_set_updated_at();

alter table public.club_guest_boats enable row level security;

create policy "club_guest_boats_select_same_group_member"
  on public.club_guest_boats
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.club_guest_sailors gs
      where gs.id = club_guest_boats.guest_sailor_id
        and public.is_group_member(gs.group_id)
    )
  );

create policy "club_guest_boats_mutate_admin"
  on public.club_guest_boats
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.club_guest_sailors gs
      where gs.id = club_guest_boats.guest_sailor_id
        and public.is_group_admin(gs.group_id)
    )
  )
  with check (
    exists (
      select 1
      from public.club_guest_sailors gs
      where gs.id = club_guest_boats.guest_sailor_id
        and public.is_group_admin(gs.group_id)
    )
  );

grant select, insert, update, delete on table public.club_guest_boats to authenticated;
grant all on table public.club_guest_boats to service_role;

-- -----------------------------------------------------------------------------
-- race_guest_entries (scratch boat in one race — no series_registration)
-- -----------------------------------------------------------------------------

create table public.race_guest_entries (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  guest_boat_id uuid not null references public.club_guest_boats (id) on delete restrict,
  sail_number_override text,
  started_marked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (race_id, guest_boat_id)
);

comment on table public.race_guest_entries is
  'Scratch race participation (parallel to race_entries; no Auth user required).';

create index race_guest_entries_race_id_idx on public.race_guest_entries (race_id);
create index race_guest_entries_guest_boat_id_idx on public.race_guest_entries (guest_boat_id);

create or replace function public.enforce_race_guest_entry_group_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  grp uuid;
begin
  select s.group_id into grp
  from public.races r
  inner join public.series s on s.id = r.series_id
  where r.id = new.race_id;
  if grp is null then
    raise exception 'Race not found';
  end if;
  if not exists (
    select 1 from public.club_guest_boats gb
    inner join public.club_guest_sailors gs on gs.id = gb.guest_sailor_id
    where gb.id = new.guest_boat_id
      and gs.group_id = grp
  ) then
    raise exception 'Guest boat must belong to this race''s club';
  end if;
  return new;
end;
$$;

create trigger race_guest_entries_group_match
  before insert or update of race_id, guest_boat_id on public.race_guest_entries
  for each row
  execute function public.enforce_race_guest_entry_group_match();

create trigger race_guest_entries_set_updated_at
  before update on public.race_guest_entries
  for each row
  execute function public.profiles_set_updated_at();

alter table public.race_guest_entries enable row level security;

create policy "race_guest_entries_select_group_member"
  on public.race_guest_entries
  for select
  to authenticated
  using (
    exists (
      select 1 from public.races r
      join public.series s on s.id = r.series_id
      where r.id = race_guest_entries.race_id
        and public.is_group_member(s.group_id)
    )
  );

create policy "race_guest_entries_insert_staff"
  on public.race_guest_entries
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.races r
      join public.series s on s.id = r.series_id
      join public.group_memberships m on m.group_id = s.group_id and m.user_id = auth.uid()
      where r.id = race_guest_entries.race_id
        and m.role in ('club_admin', 'race_officer')
    )
  );

create policy "race_guest_entries_update_staff"
  on public.race_guest_entries
  for update
  to authenticated
  using (
    exists (
      select 1 from public.races r
      join public.series s on s.id = r.series_id
      join public.group_memberships m on m.group_id = s.group_id and m.user_id = auth.uid()
      where r.id = race_guest_entries.race_id
        and m.role in ('club_admin', 'race_officer')
    )
  )
  with check (
    exists (
      select 1 from public.races r
      join public.series s on s.id = r.series_id
      join public.group_memberships m on m.group_id = s.group_id and m.user_id = auth.uid()
      where r.id = race_guest_entries.race_id
        and m.role in ('club_admin', 'race_officer')
    )
  );

create policy "race_guest_entries_delete_staff"
  on public.race_guest_entries
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.races r
      join public.series s on s.id = r.series_id
      join public.group_memberships m on m.group_id = s.group_id and m.user_id = auth.uid()
      where r.id = race_guest_entries.race_id
        and m.role in ('club_admin', 'race_officer')
    )
  );

grant select, insert, update, delete on table public.race_guest_entries to authenticated;
grant all on table public.race_guest_entries to service_role;

-- -----------------------------------------------------------------------------
-- race_guest_finishes (mirrors race_finishes; keyed on race_guest_entry_id)
-- -----------------------------------------------------------------------------

create table public.race_guest_finishes (
  id uuid primary key default gen_random_uuid(),
  race_guest_entry_id uuid not null references public.race_guest_entries (id) on delete cascade,
  ro_finish_at timestamptz not null,
  official_finish_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (race_guest_entry_id)
);

comment on table public.race_guest_finishes is 'Finish rows for scratch club guest entries (RO-first; official parallels RO).';

create index race_guest_finishes_race_guest_entry_id_idx
  on public.race_guest_finishes (race_guest_entry_id);

create or replace function public.enforce_guest_finish_requires_started()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  stm timestamptz;
begin
  select e.started_marked_at into stm
  from public.race_guest_entries e
  where e.id = new.race_guest_entry_id;
  if stm is null then
    raise exception 'Cannot record finish until RO marks this guest entry as started';
  end if;
  return new;
end;
$$;

create trigger race_guest_finishes_require_started
  before insert or update of race_guest_entry_id, ro_finish_at on public.race_guest_finishes
  for each row
  execute function public.enforce_guest_finish_requires_started();

create trigger race_guest_finishes_default_official
  before insert or update on public.race_guest_finishes
  for each row
  execute function public.race_finishes_default_official();

create trigger race_guest_finishes_set_updated_at
  before update on public.race_guest_finishes
  for each row
  execute function public.race_finishes_set_updated_at();

alter table public.race_guest_finishes enable row level security;

create policy "race_guest_finishes_select_group_member"
  on public.race_guest_finishes
  for select
  to authenticated
  using (
    exists (
      select 1 from public.race_guest_entries ge
      join public.races r on r.id = ge.race_id
      join public.series s on s.id = r.series_id
      where ge.id = race_guest_finishes.race_guest_entry_id
        and public.is_group_member(s.group_id)
    )
  );

create policy "race_guest_finishes_insert_staff"
  on public.race_guest_finishes
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.race_guest_entries ge
      join public.races r on r.id = ge.race_id
      join public.series s on s.id = r.series_id
      join public.group_memberships m on m.group_id = s.group_id and m.user_id = auth.uid()
      where ge.id = race_guest_finishes.race_guest_entry_id
        and m.role in ('club_admin', 'race_officer')
    )
  );

create policy "race_guest_finishes_update_staff"
  on public.race_guest_finishes
  for update
  to authenticated
  using (
    exists (
      select 1 from public.race_guest_entries ge
      join public.races r on r.id = ge.race_id
      join public.series s on s.id = r.series_id
      join public.group_memberships m on m.group_id = s.group_id and m.user_id = auth.uid()
      where ge.id = race_guest_finishes.race_guest_entry_id
        and m.role in ('club_admin', 'race_officer')
    )
  )
  with check (
    exists (
      select 1 from public.race_guest_entries ge
      join public.races r on r.id = ge.race_id
      join public.series s on s.id = r.series_id
      join public.group_memberships m on m.group_id = s.group_id and m.user_id = auth.uid()
      where ge.id = race_guest_finishes.race_guest_entry_id
        and m.role in ('club_admin', 'race_officer')
    )
  );

create policy "race_guest_finishes_delete_admin"
  on public.race_guest_finishes
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.race_guest_entries ge
      join public.races r on r.id = ge.race_id
      join public.series s on s.id = r.series_id
      where ge.id = race_guest_finishes.race_guest_entry_id
        and public.is_group_admin(s.group_id)
    )
  );

grant select, insert, update, delete on table public.race_guest_finishes to authenticated;
grant all on table public.race_guest_finishes to service_role;
