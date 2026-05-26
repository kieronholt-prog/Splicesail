-- RO start line: read hull metadata for series signups and other entrants; staff may insert
-- race_entries for a sailor when the hull is on series_registration_boats.

-- -----------------------------------------------------------------------------
-- Boat owner check (trigger): must not rely on invoker RLS when reading boats.
-- -----------------------------------------------------------------------------

create or replace function public.enforce_race_entry_boat_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.boat_id is null then
    return new;
  end if;

  if exists (
    select 1
    from public.boats b
    where b.id = new.boat_id
      and b.owner_user_id is not distinct from new.user_id
  ) then
    return new;
  end if;

  -- Club guest hulls (owner_user_id null) are not member race_entries.
  if exists (
    select 1
    from public.boats b
    where b.id = new.boat_id
      and b.club_guest_sailor_id is not null
  ) then
    raise exception 'Guest boats use race guest entries, not member race entries';
  end if;

  -- Race officer / club admin creating a row for a signed-up sailor (start line).
  if exists (
    select 1
    from public.races r
    join public.series s on s.id = r.series_id
    join public.group_memberships m
      on m.group_id = s.group_id
      and m.user_id = auth.uid()
      and m.role in ('club_admin', 'race_officer')
    join public.series_registration_boats srb
      on srb.series_id = r.series_id
      and srb.user_id = new.user_id
      and srb.boat_id = new.boat_id
    where r.id = new.race_id
  ) then
    return new;
  end if;

  raise exception 'Selected boat must belong to you';
end;
$$;

comment on function public.enforce_race_entry_boat_owner() is
  'Member race_entries need owner_user_id = user_id, or staff insert when hull is on series_registration_boats. SECURITY DEFINER so the boats lookup is not blocked by RLS.';

-- -----------------------------------------------------------------------------
-- Boats SELECT: hulls on series signups (amber start-line tiles before race_entries).
-- -----------------------------------------------------------------------------

create policy "boats_select_referenced_by_series_registration"
  on public.boats
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.series_registration_boats srb
      join public.series s on s.id = srb.series_id
      where srb.boat_id = boats.id
        and public.is_group_member(s.group_id)
    )
  );

comment on policy "boats_select_referenced_by_series_registration" on public.boats is
  'Group members may read boats on series signups in their club (RO start line before per-race row exists).';
