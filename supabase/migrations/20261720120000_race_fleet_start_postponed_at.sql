-- RO AP postponement: visible to phone/watch via mobile next-race API.

alter table public.race_fleets
  add column if not exists start_postponed_at timestamptz null;

comment on column public.race_fleets.start_postponed_at is
  'When set, RO has hoisted AP — fleet start countdown frozen until a new signal or postponement down.';

create or replace function public.apply_race_fleet_start_signal(
  p_race_id uuid,
  p_fleet_id uuid,
  p_start_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old_scheduled timestamptz;
  v_primary_id uuid;
  v_start_ms double precision;
  v_fleet record;
  v_f_ms double precision;
  v_offset integer;
  v_primary_start timestamptz;
  v_primary_offset integer;
  v_min_epoch constant double precision := extract(epoch from timestamptz '2000-01-01 00:00:00+00');
  v_max_offset constant integer := 240;
begin
  if p_start_at is null then
    raise exception 'Invalid start time.';
  end if;

  if extract(epoch from p_start_at) < v_min_epoch then
    raise exception 'Invalid start time: must be on or after year 2000.';
  end if;

  if not exists (
    select 1 from public.race_fleets rf where rf.id = p_fleet_id and rf.race_id = p_race_id
  ) then
    raise exception 'Fleet not found for this race.';
  end if;

  select r.scheduled_at into v_old_scheduled from public.races r where r.id = p_race_id;

  select rf.id into v_primary_id
  from public.race_fleets rf
  where rf.race_id = p_race_id
  order by rf.sort_order nulls last, rf.id
  limit 1;

  v_start_ms := extract(epoch from p_start_at) * 1000.0;

  perform set_config('splice.skip_finish_recompute', 'on', true);

  update public.race_fleets
  set start_signal_at = p_start_at,
      start_postponed_at = null
  where id = p_fleet_id;

  if p_fleet_id = v_primary_id then
    update public.races set scheduled_at = p_start_at where id = p_race_id;

    update public.race_fleets
    set start_offset_minutes = 0
    where id = p_fleet_id;

    for v_fleet in
      select rf.id, rf.start_signal_at, rf.start_offset_minutes
      from public.race_fleets rf
      where rf.race_id = p_race_id and rf.id <> p_fleet_id
    loop
      if v_fleet.start_signal_at is not null
        and extract(epoch from v_fleet.start_signal_at) >= v_min_epoch then
        v_f_ms := extract(epoch from v_fleet.start_signal_at) * 1000.0;
      elsif v_old_scheduled is not null
        and extract(epoch from v_old_scheduled) >= v_min_epoch then
        v_f_ms :=
          extract(epoch from v_old_scheduled) * 1000.0
          + coalesce(v_fleet.start_offset_minutes, 0) * 60000.0;
      else
        continue;
      end if;

      v_offset := greatest(0, round((v_f_ms - v_start_ms) / 60000.0));
      if v_offset <= v_max_offset then
        update public.race_fleets set start_offset_minutes = v_offset where id = v_fleet.id;
      end if;
    end loop;
  elsif v_primary_id is not null then
    select rf.start_signal_at, rf.start_offset_minutes
    into v_primary_start, v_primary_offset
    from public.race_fleets rf
    where rf.id = v_primary_id;

    if v_primary_start is not null
      and extract(epoch from v_primary_start) >= v_min_epoch then
      v_offset := greatest(0, round(extract(epoch from (p_start_at - v_primary_start)) / 60.0));
    elsif v_old_scheduled is not null
      and extract(epoch from v_old_scheduled) >= v_min_epoch then
      v_offset := greatest(
        0,
        round(
          (
            v_start_ms
            - (
              extract(epoch from v_old_scheduled) * 1000.0
              + coalesce(v_primary_offset, 0) * 60000.0
            )
          ) / 60000.0
        )
      );
    else
      v_offset := null;
    end if;

    if v_offset is not null and v_offset <= v_max_offset then
      update public.race_fleets set start_offset_minutes = v_offset where id = p_fleet_id;
    end if;
  end if;

  perform set_config('splice.skip_finish_recompute', 'off', true);

  if exists (
    select 1
    from public.race_entries re
    join public.race_finishes rf on rf.race_entry_id = re.id
    where re.race_id = p_race_id
    limit 1
  ) or exists (
    select 1
    from public.race_guest_entries ge
    join public.race_guest_finishes gf on gf.race_guest_entry_id = ge.id
    where ge.race_id = p_race_id
    limit 1
  ) then
    perform public.recompute_race_finishes_timing_for_race(p_race_id);
    perform public.recompute_race_guest_finishes_timing_for_race(p_race_id);
  end if;
end;
$$;
