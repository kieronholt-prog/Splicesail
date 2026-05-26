-- Club admin: reverse confirm_race_guest_entry_link — restore sailor-linked results as RO-added boats.

create or replace function public.delink_race_entry_to_ro_added(p_race_entry_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_group uuid;
  v_race_id uuid;
  v_fleet_id uuid;
  v_sail text;
  v_class_key text;
  v_started timestamptz;
  v_guest_id uuid;
  v_ro timestamptz;
  v_off timestamptz;
  v_elapsed double precision;
  v_corrected double precision;
  v_effective_py integer;
  v_finish_pos integer;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  select
    s.group_id,
    r.id,
    e.fleet_id,
    e.started_marked_at,
    nullif(trim(coalesce(e.sail_number_override, b.default_sail_number, '')), ''),
    b.rya_class_key
  into
    v_group,
    v_race_id,
    v_fleet_id,
    v_started,
    v_sail,
    v_class_key
  from public.race_entries e
  inner join public.races r on r.id = e.race_id
  inner join public.series s on s.id = r.series_id
  left join public.boats b on b.id = e.boat_id
  where e.id = p_race_entry_id;

  if v_group is null then
    raise exception 'Race entry not found';
  end if;

  if not exists (
    select 1
    from public.group_memberships m
    where m.group_id = v_group
      and m.user_id = v_actor
      and m.role = 'club_admin'
  ) then
    raise exception 'Only club admins can de-link sailor results';
  end if;

  if v_sail is null or v_class_key is null then
    raise exception 'Boat sail number and class are required to restore an RO-added row';
  end if;

  select
    ro_finish_at,
    official_finish_at,
    elapsed_seconds,
    corrected_seconds,
    effective_py,
    finish_position
  into
    v_ro,
    v_off,
    v_elapsed,
    v_corrected,
    v_effective_py,
    v_finish_pos
  from public.race_finishes
  where race_entry_id = p_race_entry_id;

  select ge.id
  into v_guest_id
  from public.race_guest_entries ge
  where ge.linked_race_entry_id = p_race_entry_id
    and ge.link_status = 'confirmed'
  limit 1;

  if v_guest_id is null then
    select ge.id
    into v_guest_id
    from public.race_guest_entries ge
    where ge.race_id = v_race_id
      and ge.boat_id is null
      and lower(trim(ge.adhoc_sail_number)) = lower(trim(v_sail))
      and ge.adhoc_rya_class_key = v_class_key
      and ge.link_status in ('unlinked', 'pending_admin')
    order by case when ge.link_status = 'pending_admin' then 0 else 1 end
    limit 1;
  end if;

  if v_guest_id is null then
    insert into public.race_guest_entries (
      race_id,
      boat_id,
      adhoc_sail_number,
      adhoc_rya_class_key,
      fleet_id,
      started_marked_at,
      link_status
    )
    values (
      v_race_id,
      null,
      v_sail,
      v_class_key,
      v_fleet_id,
      coalesce(v_started, now()),
      'unlinked'
    )
    returning id into v_guest_id;
  else
    update public.race_guest_entries ge
    set
      link_status = 'unlinked',
      linked_race_entry_id = null,
      pending_matched_user_id = null,
      pending_matched_boat_id = null,
      adhoc_sail_number = coalesce(ge.adhoc_sail_number, v_sail),
      adhoc_rya_class_key = coalesce(ge.adhoc_rya_class_key, v_class_key),
      fleet_id = coalesce(ge.fleet_id, v_fleet_id),
      started_marked_at = coalesce(ge.started_marked_at, v_started)
    where ge.id = v_guest_id;
  end if;

  if v_ro is not null then
    insert into public.race_guest_finishes (
      race_guest_entry_id,
      ro_finish_at,
      official_finish_at,
      elapsed_seconds,
      corrected_seconds,
      effective_py,
      finish_position
    )
    values (
      v_guest_id,
      v_ro,
      coalesce(v_off, v_ro),
      v_elapsed,
      v_corrected,
      v_effective_py,
      v_finish_pos
    )
    on conflict (race_guest_entry_id) do update set
      ro_finish_at = excluded.ro_finish_at,
      official_finish_at = excluded.official_finish_at,
      elapsed_seconds = excluded.elapsed_seconds,
      corrected_seconds = excluded.corrected_seconds,
      effective_py = excluded.effective_py,
      finish_position = excluded.finish_position;
  end if;

  delete from public.race_finishes where race_entry_id = p_race_entry_id;
  delete from public.race_entries where id = p_race_entry_id;

  return v_guest_id;
end;
$$;

comment on function public.delink_race_entry_to_ro_added(uuid) is
  'Club admin: move an official race_entries row back to an unlinked RO-added guest row; copy finish data and remove the sailor entry.';

revoke all on function public.delink_race_entry_to_ro_added(uuid) from public;
grant execute on function public.delink_race_entry_to_ro_added(uuid) to authenticated;
