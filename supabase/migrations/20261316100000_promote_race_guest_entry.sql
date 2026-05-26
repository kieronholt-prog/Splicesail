-- Promote a scratch race row into a normal race_entries row (+ finishes, registration).
-- SECURITY DEFINER: callers are authenticated staff checked inside the function.

create or replace function public.promote_race_guest_entry(p_guest_entry_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_group uuid;
  v_series uuid;
  v_race uuid;
  v_linked_user uuid;
  v_linked_boat uuid;
  v_boat_owner uuid;
  v_started timestamptz;
  v_sail text;
  v_ro timestamptz;
  v_off timestamptz;
  v_new_entry uuid;
  v_has_finish boolean;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  select
    s.group_id,
    r.series_id,
    ge.race_id,
    gs.linked_user_id,
    gb.linked_boat_id,
    ge.started_marked_at,
    ge.sail_number_override
  into
    v_group,
    v_series,
    v_race,
    v_linked_user,
    v_linked_boat,
    v_started,
    v_sail
  from public.race_guest_entries ge
  join public.club_guest_boats gb on gb.id = ge.guest_boat_id
  join public.club_guest_sailors gs on gs.id = gb.guest_sailor_id
  join public.races r on r.id = ge.race_id
  join public.series s on s.id = r.series_id
  where ge.id = p_guest_entry_id;

  if v_group is null then
    raise exception 'Scratch race row not found';
  end if;

  if not exists (
    select 1 from public.group_memberships m
    where m.group_id = v_group
      and m.user_id = v_actor
      and m.role in ('club_admin', 'race_officer')
  ) then
    raise exception 'Only club admins or race officers can promote scratch rows';
  end if;

  if v_linked_user is null or v_linked_boat is null then
    raise exception 'Link scratch sailor and hull to a permanent boat before promoting';
  end if;

  select b.owner_user_id into v_boat_owner from public.boats b where b.id = v_linked_boat;
  if v_boat_owner is distinct from v_linked_user then
    raise exception 'Linked boat must belong to the linked member';
  end if;

  if exists (
    select 1 from public.race_entries e
    where e.race_id = v_race
      and e.user_id = v_linked_user
      and e.boat_id is not distinct from v_linked_boat
  ) then
    raise exception 'An official race entry already exists for this sailor and hull';
  end if;

  insert into public.series_registrations (series_id, user_id)
  values (v_series, v_linked_user)
  on conflict (series_id, user_id) do nothing;

  insert into public.series_registration_boats (series_id, user_id, boat_id, is_primary)
  values (v_series, v_linked_user, v_linked_boat, false)
  on conflict (series_id, user_id, boat_id) do nothing;

  select exists (
    select 1 from public.race_guest_finishes gf where gf.race_guest_entry_id = p_guest_entry_id
  ) into v_has_finish;

  insert into public.race_entries (
    race_id,
    user_id,
    boat_id,
    sail_number_override,
    started_marked_at,
    outcome
  )
  values (
    v_race,
    v_linked_user,
    v_linked_boat,
    nullif(trim(coalesce(v_sail, '')), ''),
    v_started,
    case when v_has_finish then 'finished'::text else null end
  )
  returning id into v_new_entry;

  select gf.ro_finish_at, gf.official_finish_at into v_ro, v_off
  from public.race_guest_finishes gf
  where gf.race_guest_entry_id = p_guest_entry_id;

  if v_ro is not null then
    insert into public.race_finishes (race_entry_id, ro_finish_at, official_finish_at)
    values (v_new_entry, v_ro, coalesce(v_off, v_ro));
  end if;

  delete from public.race_guest_entries where id = p_guest_entry_id;

  return v_new_entry;
end;
$$;

comment on function public.promote_race_guest_entry(uuid) is
  'Club staff: convert scratch race_guest_entries row into race_entries (+ finishes); ensures series signup hull linkage.';

revoke all on function public.promote_race_guest_entry(uuid) from public;
grant execute on function public.promote_race_guest_entry(uuid) to authenticated;
