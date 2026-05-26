-- Merge club_guest_boats into public.boats (guest-holder rows); race_guest_entries references boats.id.

-- -----------------------------------------------------------------------------
-- Guest-holder boats may optionally link to the member's fleet hull (promotion / PY).
-- -----------------------------------------------------------------------------

alter table public.boats
  add column linked_boat_id uuid references public.boats (id) on delete set null;

comment on column public.boats.linked_boat_id is
  'Guest-holder hull only: optional pointer to the linked member fleet boats row (club_guest_sailor_id must be set).';

alter table public.boats
  add constraint boats_linked_boat_only_when_guest_chk check (
    (club_guest_sailor_id is not null)
    or (linked_boat_id is null)
  );

create unique index boats_guest_linked_boat_unique_idx
  on public.boats (linked_boat_id)
  where linked_boat_id is not null;

-- -----------------------------------------------------------------------------
-- Migrate scratch hull rows → boats; repoint race_guest_entries; drop scratch table.
-- -----------------------------------------------------------------------------

do $$
declare
  r record;
  nid uuid;
begin
  create temp table _cgb_map (
    old_id uuid primary key,
    new_boat_id uuid not null unique
  );

  for r in
    select *
    from public.club_guest_boats
    order by created_at
  loop
    insert into public.boats (
      owner_user_id,
      club_guest_sailor_id,
      label,
      class_name,
      default_sail_number,
      handedness,
      crew_template,
      rya_class_key,
      linked_boat_id
    )
    values (
      null,
      r.guest_sailor_id,
      r.label,
      r.class_name,
      r.default_sail_number,
      'double',
      '{
        "helm": {"use_account_owner": true, "contact_name": null, "contact_phone": null},
        "crew": [
          {"use_account_owner": true, "contact_name": null, "contact_phone": null}
        ]
      }'::jsonb,
      r.rya_class_key,
      r.linked_boat_id
    )
    returning id into nid;

    insert into _cgb_map (old_id, new_boat_id) values (r.id, nid);
  end loop;

  alter table public.race_guest_entries
    add column boat_id uuid references public.boats (id) on delete restrict;

  update public.race_guest_entries ge
  set boat_id = m.new_boat_id
  from _cgb_map m
  where ge.guest_boat_id = m.old_id;

  if exists (select 1 from public.race_guest_entries where boat_id is null) then
    raise exception 'race_guest_entries boat_id backfill failed';
  end if;

  alter table public.race_guest_entries alter column boat_id set not null;

  alter table public.race_guest_entries
    drop constraint race_guest_entries_guest_boat_id_fkey;

  drop index if exists public.race_guest_entries_guest_boat_id_idx;

  -- Trigger references guest_boat_id in UPDATE OF — drop before removing the column.
  drop trigger if exists race_guest_entries_group_match on public.race_guest_entries;

  alter table public.race_guest_entries
    drop column guest_boat_id;
end $$;

drop trigger if exists race_guest_entries_group_match on public.race_guest_entries;

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
    select 1
    from public.boats b
    inner join public.club_guest_sailors gs on gs.id = b.club_guest_sailor_id
    where b.id = new.boat_id
      and gs.group_id = grp
      and b.owner_user_id is null
  ) then
    raise exception 'Guest boat must belong to this race''s club';
  end if;
  return new;
end;
$$;

create trigger race_guest_entries_group_match
  before insert or update of race_id, boat_id on public.race_guest_entries
  for each row
  execute function public.enforce_race_guest_entry_group_match();

alter table public.race_guest_entries
  add constraint race_guest_entries_race_id_boat_id_key unique (race_id, boat_id);

create index race_guest_entries_boat_id_idx on public.race_guest_entries (boat_id);

drop trigger if exists club_guest_boats_set_updated_at on public.club_guest_boats;

drop policy if exists "club_guest_boats_select_same_group_member" on public.club_guest_boats;
drop policy if exists "club_guest_boats_mutate_admin" on public.club_guest_boats;

drop table public.club_guest_boats;

-- -----------------------------------------------------------------------------
-- Promotion RPC: guest race row uses boats (guest-holder) + linked_boat_id.
-- -----------------------------------------------------------------------------

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
  join public.boats gb on gb.id = ge.boat_id
  join public.club_guest_sailors gs on gs.id = gb.club_guest_sailor_id
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
