-- Ad-hoc race-only guest rows (sail + class, no club_guest boat) and link-to-official-entry
-- without deleting the audit row (replaces promote_race_guest_entry delete behaviour).

-- -----------------------------------------------------------------------------
-- Schema: nullable boat_id, ad-hoc fields, link to official race_entries
-- -----------------------------------------------------------------------------

alter table public.race_guest_entries
  add column adhoc_sail_number text,
  add column adhoc_rya_class_key text references public.boat_classes (class_key),
  add column linked_race_entry_id uuid references public.race_entries (id) on delete set null,
  add column link_status text not null default 'unlinked';

alter table public.race_guest_entries
  alter column boat_id drop not null;

alter table public.race_guest_entries
  drop constraint if exists race_guest_entries_link_status_chk;

alter table public.race_guest_entries
  add constraint race_guest_entries_link_status_chk check (
    link_status in ('unlinked', 'pending_admin', 'confirmed')
  );

alter table public.race_guest_entries
  drop constraint if exists race_guest_entries_boat_or_adhoc_chk;

alter table public.race_guest_entries
  add constraint race_guest_entries_boat_or_adhoc_chk check (
    (
      boat_id is not null
      and adhoc_sail_number is null
      and adhoc_rya_class_key is null
    )
    or (
      boat_id is null
      and adhoc_sail_number is not null
      and length(trim(adhoc_sail_number)) > 0
      and adhoc_rya_class_key is not null
    )
  );

alter table public.race_guest_entries
  drop constraint if exists race_guest_entries_race_id_boat_id_key;

create unique index if not exists race_guest_entries_race_boat_unique_partial_idx
  on public.race_guest_entries (race_id, boat_id)
  where boat_id is not null;

create index if not exists race_guest_entries_linked_race_entry_id_idx
  on public.race_guest_entries (linked_race_entry_id)
  where linked_race_entry_id is not null;

-- -----------------------------------------------------------------------------
-- Trigger: legacy guest boat OR ad-hoc class valid for race club catalogue
-- -----------------------------------------------------------------------------

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

  if new.boat_id is not null then
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
  elsif new.adhoc_sail_number is not null and new.adhoc_rya_class_key is not null then
    if not exists (
      select 1
      from public.boat_classes bc
      where bc.class_key = new.adhoc_rya_class_key
        and (bc.created_for_group_id is null or bc.created_for_group_id = grp)
    ) then
      raise exception 'Ad-hoc class must be a catalogue class for this club';
    end if;
  else
    raise exception 'Race guest entry requires either a guest boat or ad-hoc sail and class';
  end if;

  return new;
end;
$$;

drop trigger if exists race_guest_entries_group_match on public.race_guest_entries;

create trigger race_guest_entries_group_match
  before insert or update of race_id, boat_id, adhoc_sail_number, adhoc_rya_class_key
  on public.race_guest_entries
  for each row
  execute function public.enforce_race_guest_entry_group_match();

-- -----------------------------------------------------------------------------
-- Replace promote RPC (deleted guest row) with confirm link (audit retained)
-- -----------------------------------------------------------------------------

drop function if exists public.promote_race_guest_entry(uuid);

create or replace function public.confirm_race_guest_entry_link(
  p_guest_entry_id uuid,
  p_race_entry_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_group uuid;
  v_guest_race uuid;
  v_target_race uuid;
  v_gf_ro timestamptz;
  v_gf_off timestamptz;
  v_has_guest_finish boolean;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  select s.group_id, ge.race_id
  into v_group, v_guest_race
  from public.race_guest_entries ge
  join public.races r on r.id = ge.race_id
  join public.series s on s.id = r.series_id
  where ge.id = p_guest_entry_id;

  if v_group is null then
    raise exception 'Guest race entry not found';
  end if;

  if not exists (
    select 1 from public.group_memberships m
    where m.group_id = v_group
      and m.user_id = v_actor
      and m.role in ('club_admin', 'race_officer')
  ) then
    raise exception 'Only club admins or race officers can confirm a guest link';
  end if;

  select e.race_id into v_target_race
  from public.race_entries e
  where e.id = p_race_entry_id;

  if v_target_race is null then
    raise exception 'Official race entry not found';
  end if;

  if v_guest_race is distinct from v_target_race then
    raise exception 'Guest row and official entry must be for the same race';
  end if;

  if exists (
    select 1 from public.race_guest_entries ge
    where ge.id = p_guest_entry_id
      and ge.link_status = 'confirmed'
      and ge.linked_race_entry_id = p_race_entry_id
  ) then
    return;
  end if;

  if exists (
    select 1 from public.race_guest_entries ge
    where ge.id = p_guest_entry_id
      and ge.link_status = 'confirmed'
      and ge.linked_race_entry_id is distinct from p_race_entry_id
  ) then
    raise exception 'Guest entry is already linked to a different official row';
  end if;

  select gf.ro_finish_at, gf.official_finish_at
  into v_gf_ro, v_gf_off
  from public.race_guest_finishes gf
  where gf.race_guest_entry_id = p_guest_entry_id;

  v_has_guest_finish := v_gf_ro is not null;

  update public.race_entries e
  set
    started_marked_at = coalesce(e.started_marked_at, ge.started_marked_at),
    outcome = case
      when v_has_guest_finish and e.outcome is null then 'finished'::text
      else e.outcome
    end,
    sail_number_override = case
      when e.sail_number_override is not null and length(trim(e.sail_number_override)) > 0
        then e.sail_number_override
      else nullif(
        trim(coalesce(ge.sail_number_override, ge.adhoc_sail_number, '')),
        ''
      )
    end
  from public.race_guest_entries ge
  where e.id = p_race_entry_id
    and ge.id = p_guest_entry_id;

  if v_has_guest_finish then
    insert into public.race_finishes (race_entry_id, ro_finish_at, official_finish_at)
    values (p_race_entry_id, v_gf_ro, coalesce(v_gf_off, v_gf_ro))
    on conflict (race_entry_id) do update set
      ro_finish_at = excluded.ro_finish_at,
      official_finish_at = excluded.official_finish_at;
  end if;

  update public.race_guest_entries ge
  set
    linked_race_entry_id = p_race_entry_id,
    link_status = 'confirmed'
  where ge.id = p_guest_entry_id;
end;
$$;

comment on function public.confirm_race_guest_entry_link(uuid, uuid) is
  'Staff: attach a race_guest_entries audit row to an official race_entries row; copy guest finish times into race_finishes.';

revoke all on function public.confirm_race_guest_entry_link(uuid, uuid) from public;
grant execute on function public.confirm_race_guest_entry_link(uuid, uuid) to authenticated;
