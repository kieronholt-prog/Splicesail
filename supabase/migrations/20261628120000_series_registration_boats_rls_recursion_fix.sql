-- Break boats ↔ series_registration_boats RLS recursion (same pattern as boat_in_public_results).

create or replace function public.boat_referenced_by_group_series_registration(bid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.series_registration_boats srb
    inner join public.series s on s.id = srb.series_id
    where srb.boat_id = bid
      and public.is_group_member(s.group_id)
  );
$$;

comment on function public.boat_referenced_by_group_series_registration(uuid) is
  'SECURITY DEFINER: group members may read boats on series signups; avoids boats ↔ series_registration_boats RLS cycle.';

create or replace function public.boat_owned_by(bid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.boats b
    where b.id = bid
      and b.owner_user_id is not distinct from uid
  );
$$;

comment on function public.boat_owned_by(uuid, uuid) is
  'SECURITY DEFINER: ownership check for series_registration_boats insert without invoking boats RLS.';

revoke all on function public.boat_referenced_by_group_series_registration(uuid) from public;
revoke all on function public.boat_owned_by(uuid, uuid) from public;

grant execute on function public.boat_referenced_by_group_series_registration(uuid) to authenticated;
grant execute on function public.boat_owned_by(uuid, uuid) to authenticated;

drop policy if exists "boats_select_referenced_by_series_registration" on public.boats;

create policy "boats_select_referenced_by_series_registration"
  on public.boats
  for select
  to authenticated
  using (public.boat_referenced_by_group_series_registration(id));

comment on policy "boats_select_referenced_by_series_registration" on public.boats is
  'Group members may read boats on series signups in their club (RO start line before per-race row exists).';

drop policy if exists "series_registration_boats_insert_self" on public.series_registration_boats;

create policy "series_registration_boats_insert_self"
  on public.series_registration_boats
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.boat_owned_by(boat_id, auth.uid())
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

-- Invoker read of boats during INSERT re-entered boats RLS (see boats policy above).
create or replace function public.enforce_series_registration_boat_active()
returns trigger
language plpgsql
security definer
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
