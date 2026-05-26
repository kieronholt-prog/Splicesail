-- Persist elapsed and Portsmouth corrected seconds on finish rows (computed in DB on save).
-- Keeps RO finish upserts as a single round-trip; results read stored values.

alter table public.race_finishes
  add column if not exists elapsed_seconds double precision,
  add column if not exists corrected_seconds double precision,
  add column if not exists effective_py integer;

alter table public.race_guest_finishes
  add column if not exists elapsed_seconds double precision,
  add column if not exists corrected_seconds double precision,
  add column if not exists effective_py integer;

comment on column public.race_finishes.elapsed_seconds is
  'Seconds from fleet start signal to official_finish_at; null when start unknown.';
comment on column public.race_finishes.corrected_seconds is
  'Portsmouth corrected seconds (elapsed × 1000 ÷ PN) when series uses portsmouth handicap; null otherwise or when not computable.';
comment on column public.race_finishes.effective_py is
  'PN used for corrected_seconds (entry override → series → club → baseline → boat).';

comment on column public.race_guest_finishes.elapsed_seconds is
  'Seconds from fleet start signal to official_finish_at; null when start unknown.';
comment on column public.race_guest_finishes.corrected_seconds is
  'Portsmouth corrected seconds when series uses portsmouth handicap; null otherwise or when not computable.';
comment on column public.race_guest_finishes.effective_py is
  'PN used for corrected_seconds for this guest finish row.';

-- -----------------------------------------------------------------------------

create or replace function public.resolve_effective_py(
  p_series_id uuid,
  p_group_id uuid,
  p_py_override integer,
  p_class_key text,
  p_boat_py_rating integer
)
returns integer
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_py integer;
begin
  if p_py_override is not null and p_py_override > 0 then
    return p_py_override;
  end if;

  if p_class_key is not null and length(trim(p_class_key)) > 0 then
    select scp.py into v_py
    from public.series_class_py scp
    where scp.series_id = p_series_id and scp.class_key = p_class_key;
    if v_py is not null and v_py > 0 then
      return v_py;
    end if;

    select gcp.py into v_py
    from public.group_class_py gcp
    where gcp.group_id = p_group_id and gcp.class_key = p_class_key;
    if v_py is not null and v_py > 0 then
      return v_py;
    end if;

    select bcp.py into v_py
    from public.boat_class_pn bcp
    where bcp.class_key = p_class_key;
    if v_py is not null and v_py > 0 then
      return v_py;
    end if;
  end if;

  if p_boat_py_rating is not null and p_boat_py_rating > 0 then
    return p_boat_py_rating;
  end if;

  return null;
end;
$$;

-- -----------------------------------------------------------------------------

create or replace function public.effective_fleet_start_at(
  p_race_id uuid,
  p_fleet_id uuid
)
returns timestamptz
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_scheduled timestamptz;
  v_amended timestamptz;
  v_offset integer;
  v_fid uuid;
begin
  select r.scheduled_at into v_scheduled
  from public.races r
  where r.id = p_race_id;

  v_fid := p_fleet_id;
  if v_fid is null then
    select rf.id into v_fid
    from public.race_fleets rf
    where rf.race_id = p_race_id
    order by rf.sort_order nulls last, rf.id
    limit 1;
  end if;

  if v_fid is null then
    return v_scheduled;
  end if;

  select rf.start_signal_at, rf.start_offset_minutes
  into v_amended, v_offset
  from public.race_fleets rf
  where rf.id = v_fid;

  if v_amended is not null then
    return v_amended;
  end if;

  if v_scheduled is null then
    return null;
  end if;

  return v_scheduled + coalesce(v_offset, 0) * interval '1 minute';
end;
$$;

-- -----------------------------------------------------------------------------

create or replace function public.compute_finish_timing_fields(
  p_handicap_system text,
  p_official_finish_at timestamptz,
  p_fleet_start_at timestamptz,
  p_effective_py integer
)
returns table (
  elapsed_seconds double precision,
  corrected_seconds double precision,
  effective_py integer
)
language plpgsql
immutable
security invoker
set search_path = public
as $$
declare
  v_elapsed double precision;
  v_corrected double precision;
begin
  effective_py := p_effective_py;

  if p_official_finish_at is null or p_fleet_start_at is null then
    elapsed_seconds := null;
    corrected_seconds := null;
    return next;
  end if;

  v_elapsed := extract(epoch from (p_official_finish_at - p_fleet_start_at));
  if v_elapsed is null or v_elapsed <= 0 then
    elapsed_seconds := null;
    corrected_seconds := null;
    return next;
  end if;

  elapsed_seconds := v_elapsed;

  if coalesce(p_handicap_system, 'portsmouth') = 'none' then
    corrected_seconds := null;
    return next;
  end if;

  if p_effective_py is null or p_effective_py <= 0 then
    corrected_seconds := null;
    return next;
  end if;

  corrected_seconds := (v_elapsed * 1000.0) / p_effective_py;
  return next;
end;
$$;

-- -----------------------------------------------------------------------------

create or replace function public.race_finishes_compute_timing()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_race_id uuid;
  v_series_id uuid;
  v_group_id uuid;
  v_fleet_id uuid;
  v_handicap text;
  v_class_key text;
  v_boat_py integer;
  v_py_override integer;
  v_effective_py integer;
  v_fleet_start timestamptz;
  v_timing record;
begin
  select
    e.race_id,
    e.fleet_id,
    e.py_override,
    r.series_id,
    s.group_id,
    coalesce(sc.handicap_system, 'portsmouth'),
    nullif(trim(b.rya_class_key), ''),
    b.py_rating
  into
    v_race_id,
    v_fleet_id,
    v_py_override,
    v_series_id,
    v_group_id,
    v_handicap,
    v_class_key,
    v_boat_py
  from public.race_entries e
  inner join public.races r on r.id = e.race_id
  inner join public.series s on s.id = r.series_id
  left join public.series_scoring_config sc on sc.series_id = s.id
  left join public.boats b on b.id = e.boat_id
  where e.id = new.race_entry_id;

  if v_race_id is null then
    new.elapsed_seconds := null;
    new.corrected_seconds := null;
    new.effective_py := null;
    return new;
  end if;

  v_effective_py := public.resolve_effective_py(
    v_series_id,
    v_group_id,
    v_py_override,
    v_class_key,
    v_boat_py
  );

  v_fleet_start := public.effective_fleet_start_at(v_race_id, v_fleet_id);

  select * into v_timing
  from public.compute_finish_timing_fields(
    v_handicap,
    new.official_finish_at,
    v_fleet_start,
    v_effective_py
  );

  new.elapsed_seconds := v_timing.elapsed_seconds;
  new.corrected_seconds := v_timing.corrected_seconds;
  new.effective_py := v_timing.effective_py;

  return new;
end;
$$;

create trigger race_finishes_compute_timing
  before insert or update of official_finish_at, race_entry_id
  on public.race_finishes
  for each row
  execute function public.race_finishes_compute_timing();

-- -----------------------------------------------------------------------------

create or replace function public.race_guest_finishes_compute_timing()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_race_id uuid;
  v_series_id uuid;
  v_group_id uuid;
  v_fleet_id uuid;
  v_handicap text;
  v_class_key text;
  v_boat_py integer;
  v_effective_py integer;
  v_fleet_start timestamptz;
  v_timing record;
begin
  select
    ge.race_id,
    ge.fleet_id,
    r.series_id,
    s.group_id,
    coalesce(sc.handicap_system, 'portsmouth'),
    coalesce(
      nullif(trim(ge.adhoc_rya_class_key), ''),
      nullif(trim(b.rya_class_key), '')
    ),
    b.py_rating
  into
    v_race_id,
    v_fleet_id,
    v_series_id,
    v_group_id,
    v_handicap,
    v_class_key,
    v_boat_py
  from public.race_guest_entries ge
  inner join public.races r on r.id = ge.race_id
  inner join public.series s on s.id = r.series_id
  left join public.series_scoring_config sc on sc.series_id = s.id
  left join public.boats b on b.id = ge.boat_id
  where ge.id = new.race_guest_entry_id;

  if v_race_id is null then
    new.elapsed_seconds := null;
    new.corrected_seconds := null;
    new.effective_py := null;
    return new;
  end if;

  v_effective_py := public.resolve_effective_py(
    v_series_id,
    v_group_id,
    null,
    v_class_key,
    v_boat_py
  );

  v_fleet_start := public.effective_fleet_start_at(v_race_id, v_fleet_id);

  select * into v_timing
  from public.compute_finish_timing_fields(
    v_handicap,
    new.official_finish_at,
    v_fleet_start,
    v_effective_py
  );

  new.elapsed_seconds := v_timing.elapsed_seconds;
  new.corrected_seconds := v_timing.corrected_seconds;
  new.effective_py := v_timing.effective_py;

  return new;
end;
$$;

create trigger race_guest_finishes_compute_timing
  before insert or update of official_finish_at, race_guest_entry_id
  on public.race_guest_finishes
  for each row
  execute function public.race_guest_finishes_compute_timing();

-- Recompute when fleet start or entry PY changes (does not affect finish save latency).

create or replace function public.recompute_race_finishes_timing_for_race(p_race_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.race_finishes rf
  set official_finish_at = rf.official_finish_at
  from public.race_entries e
  where e.id = rf.race_entry_id
    and e.race_id = p_race_id;
$$;

create or replace function public.recompute_race_guest_finishes_timing_for_race(p_race_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.race_guest_finishes gf
  set official_finish_at = gf.official_finish_at
  from public.race_guest_entries ge
  where ge.id = gf.race_guest_entry_id
    and ge.race_id = p_race_id;
$$;

create or replace function public.trg_recompute_finishes_after_fleet_start_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform public.recompute_race_finishes_timing_for_race(new.race_id);
  perform public.recompute_race_guest_finishes_timing_for_race(new.race_id);
  return new;
end;
$$;

create trigger race_fleets_recompute_finish_timing
  after update of start_signal_at, start_offset_minutes
  on public.race_fleets
  for each row
  execute function public.trg_recompute_finishes_after_fleet_start_change();

create or replace function public.trg_recompute_finishes_after_race_schedule_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.scheduled_at is distinct from old.scheduled_at then
    perform public.recompute_race_finishes_timing_for_race(new.id);
    perform public.recompute_race_guest_finishes_timing_for_race(new.id);
  end if;
  return new;
end;
$$;

create trigger races_recompute_finish_timing
  after update of scheduled_at
  on public.races
  for each row
  execute function public.trg_recompute_finishes_after_race_schedule_change();

create or replace function public.trg_recompute_finish_after_entry_py_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.py_override is distinct from old.py_override
     or new.fleet_id is distinct from old.fleet_id then
    update public.race_finishes rf
    set official_finish_at = rf.official_finish_at
    where rf.race_entry_id = new.id;
  end if;
  return new;
end;
$$;

create trigger race_entries_recompute_finish_timing
  after update of py_override, fleet_id
  on public.race_entries
  for each row
  execute function public.trg_recompute_finish_after_entry_py_change();

-- Backfill existing finish rows.

update public.race_finishes rf
set official_finish_at = rf.official_finish_at;

update public.race_guest_finishes gf
set official_finish_at = gf.official_finish_at;
