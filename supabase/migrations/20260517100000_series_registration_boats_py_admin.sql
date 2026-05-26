-- Series entry boats (which hulls a sailor declared for a series) + restrict PY override on race entries to club admins.

-- -----------------------------------------------------------------------------
-- series_registration_boats
-- -----------------------------------------------------------------------------

create table public.series_registration_boats (
  series_id uuid not null references public.series (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  boat_id uuid not null references public.boats (id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (series_id, user_id, boat_id),
  constraint series_registration_boats_registration_fkey
    foreign key (series_id, user_id)
    references public.series_registrations (series_id, user_id)
    on delete cascade
);

create unique index series_registration_boats_one_primary_idx
  on public.series_registration_boats (series_id, user_id)
  where is_primary;

comment on table public.series_registration_boats is 'Boats a sailor attaches to a series signup; one is primary for auto race entries.';

alter table public.series_registration_boats enable row level security;

create policy "series_registration_boats_select_member"
  on public.series_registration_boats
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.series s
      where s.id = series_registration_boats.series_id
        and public.is_group_member(s.group_id)
    )
  );

create policy "series_registration_boats_insert_self"
  on public.series_registration_boats
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.boats b
      where b.id = series_registration_boats.boat_id
        and b.owner_user_id = auth.uid()
    )
    and exists (
      select 1
      from public.series_registrations sr
      join public.series s on s.id = sr.series_id
      where sr.series_id = series_registration_boats.series_id
        and sr.user_id = series_registration_boats.user_id
        and sr.user_id = auth.uid()
        and public.is_group_member(s.group_id)
    )
  );

create policy "series_registration_boats_delete_self_or_admin"
  on public.series_registration_boats
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.series s
      where s.id = series_registration_boats.series_id
        and public.is_group_admin(s.group_id)
    )
  );

grant select, insert, delete on table public.series_registration_boats to authenticated;
grant all on table public.series_registration_boats to service_role;

-- -----------------------------------------------------------------------------
-- Only club admins may set or change py_override on race entries (sailors & race officers cannot).
-- -----------------------------------------------------------------------------

create or replace function public.enforce_race_entry_py_override_club_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
begin
  if TG_OP = 'INSERT' then
    if new.py_override is null then
      return new;
    end if;
  elsif TG_OP = 'UPDATE' then
    if new.py_override is not distinct from old.py_override then
      return new;
    end if;
  else
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  select exists (
    select 1
    from public.races r
    join public.series s on s.id = r.series_id
    join public.group_memberships m
      on m.group_id = s.group_id and m.user_id = auth.uid()
    where r.id = new.race_id
      and m.role = 'club_admin'
  )
  into allowed;

  if not coalesce(allowed, false) then
    raise exception 'Only club admins may set or change Portsmouth (PY) overrides on race entries';
  end if;

  return new;
end;
$$;

drop trigger if exists race_entries_py_override_admin_only on public.race_entries;

create trigger race_entries_py_override_admin_only
  before insert or update of py_override on public.race_entries
  for each row
  execute function public.enforce_race_entry_py_override_club_admin();

comment on function public.enforce_race_entry_py_override_club_admin() is 'Blocks non–club-admin writers from setting py_override (RLS still allows row updates for other fields).';
