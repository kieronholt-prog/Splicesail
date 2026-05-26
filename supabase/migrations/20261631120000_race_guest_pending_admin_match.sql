-- When a sailor adds a hull to a series signup, flag matching RO ad-hoc results for admin review.

alter table public.race_guest_entries
  add column if not exists pending_matched_user_id uuid,
  add column if not exists pending_matched_boat_id uuid references public.boats (id) on delete set null;

comment on column public.race_guest_entries.pending_matched_user_id is
  'Series signup sailor proposed for linking when link_status = pending_admin.';
comment on column public.race_guest_entries.pending_matched_boat_id is
  'Fleet boat proposed for linking when link_status = pending_admin.';

create index if not exists race_guest_entries_pending_admin_idx
  on public.race_guest_entries (link_status)
  where link_status = 'pending_admin';

create or replace function public.normalize_sail_for_match(p_sail text)
returns text
language sql
immutable
as $$
  select lower(trim(coalesce(p_sail, '')));
$$;

create or replace function public.mark_pending_adhoc_links_for_series_boat(
  p_series_id uuid,
  p_user_id uuid,
  p_boat_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_sail text;
  v_class text;
  v_updated integer := 0;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if v_actor is distinct from p_user_id then
    raise exception 'Only the signing-up sailor can trigger ad-hoc link matching';
  end if;

  if not exists (
    select 1
    from public.series_registration_boats srb
    where srb.series_id = p_series_id
      and srb.user_id = p_user_id
      and srb.boat_id = p_boat_id
  ) then
    raise exception 'Boat is not on this series signup';
  end if;

  select
    public.normalize_sail_for_match(b.default_sail_number),
    nullif(trim(coalesce(b.rya_class_key, '')), '')
  into v_sail, v_class
  from public.boats b
  where b.id = p_boat_id
    and b.owner_user_id = p_user_id;

  if v_sail = '' or v_class is null then
    return 0;
  end if;

  update public.race_guest_entries ge
  set
    link_status = 'pending_admin',
    pending_matched_user_id = p_user_id,
    pending_matched_boat_id = p_boat_id
  from public.races r
  where ge.race_id = r.id
    and r.series_id = p_series_id
    and ge.boat_id is null
    and ge.link_status = 'unlinked'
    and ge.adhoc_sail_number is not null
    and ge.adhoc_rya_class_key is not null
    and public.normalize_sail_for_match(ge.adhoc_sail_number) = v_sail
    and trim(ge.adhoc_rya_class_key) = v_class
    and exists (
      select 1
      from public.race_guest_finishes gf
      where gf.race_guest_entry_id = ge.id
        and gf.ro_finish_at is not null
    );

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

comment on function public.mark_pending_adhoc_links_for_series_boat(uuid, uuid, uuid) is
  'After series signup: flag unlinked ad-hoc guest rows (with finishes) matching sail + class for admin linking.';

revoke all on function public.mark_pending_adhoc_links_for_series_boat(uuid, uuid, uuid) from public;
grant execute on function public.mark_pending_adhoc_links_for_series_boat(uuid, uuid, uuid) to authenticated;

create or replace function public.trg_series_registration_boats_mark_adhoc_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.mark_pending_adhoc_links_for_series_boat(
    new.series_id,
    new.user_id,
    new.boat_id
  );
  return new;
end;
$$;

drop trigger if exists series_registration_boats_mark_adhoc_pending on public.series_registration_boats;

create trigger series_registration_boats_mark_adhoc_pending
  after insert on public.series_registration_boats
  for each row
  execute function public.trg_series_registration_boats_mark_adhoc_pending();
