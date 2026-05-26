-- Read-only public club results (/results/[slug]) via anon key + RLS.
-- Only groups with a non-empty slug expose data; no membership required.

-- -----------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER — no RLS recursion)
-- -----------------------------------------------------------------------------

create or replace function public.is_public_results_group(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.groups g
    where g.id = gid
      and g.slug is not null
      and length(trim(g.slug)) > 0
  );
$$;

create or replace function public.series_in_public_results_group(sid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.series s
    where s.id = sid
      and public.is_public_results_group(s.group_id)
  );
$$;

create or replace function public.race_in_public_results_group(rid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.races r
    join public.series s on s.id = r.series_id
    where r.id = rid
      and public.is_public_results_group(s.group_id)
  );
$$;

revoke all on function public.is_public_results_group(uuid) from public;
revoke all on function public.series_in_public_results_group(uuid) from public;
revoke all on function public.race_in_public_results_group(uuid) from public;

grant execute on function public.is_public_results_group(uuid) to anon, authenticated;
grant execute on function public.series_in_public_results_group(uuid) to anon, authenticated;
grant execute on function public.race_in_public_results_group(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Grants (SELECT only for anon)
-- -----------------------------------------------------------------------------

grant select on table public.groups to anon;
grant select on table public.series to anon;
grant select on table public.races to anon;
grant select on table public.race_fleets to anon;
grant select on table public.race_entries to anon;
grant select on table public.race_finishes to anon;
grant select on table public.race_guest_entries to anon;
grant select on table public.race_guest_finishes to anon;
grant select on table public.series_scoring_config to anon;
grant select on table public.series_penalty_rules to anon;
grant select on table public.series_discard_rules to anon;
grant select on table public.series_registrations to anon;
grant select on table public.series_registration_boats to anon;
grant select on table public.boats to anon;
grant select on table public.boat_classes to anon;
grant select on table public.boat_class_pn to anon;
grant select on table public.series_class_py to anon;
grant select on table public.group_class_py to anon;
grant select on table public.club_guest_sailors to anon;

-- -----------------------------------------------------------------------------
-- RLS policies (anon SELECT; OR-combined with existing authenticated policies)
-- -----------------------------------------------------------------------------

create policy "groups_select_public_slug_anon"
  on public.groups
  for select
  to anon
  using (slug is not null and length(trim(slug)) > 0);

create policy "series_select_public_results_anon"
  on public.series
  for select
  to anon
  using (public.is_public_results_group(group_id));

create policy "races_select_public_results_anon"
  on public.races
  for select
  to anon
  using (public.series_in_public_results_group(series_id));

create policy "race_fleets_select_public_results_anon"
  on public.race_fleets
  for select
  to anon
  using (public.race_in_public_results_group(race_id));

create policy "race_entries_select_public_results_anon"
  on public.race_entries
  for select
  to anon
  using (public.race_in_public_results_group(race_id));

create policy "race_finishes_select_public_results_anon"
  on public.race_finishes
  for select
  to anon
  using (
    exists (
      select 1
      from public.race_entries re
      where re.id = race_finishes.race_entry_id
        and public.race_in_public_results_group(re.race_id)
    )
  );

create policy "race_guest_entries_select_public_results_anon"
  on public.race_guest_entries
  for select
  to anon
  using (public.race_in_public_results_group(race_id));

create policy "race_guest_finishes_select_public_results_anon"
  on public.race_guest_finishes
  for select
  to anon
  using (
    exists (
      select 1
      from public.race_guest_entries ge
      where ge.id = race_guest_finishes.race_guest_entry_id
        and public.race_in_public_results_group(ge.race_id)
    )
  );

create policy "series_scoring_config_select_public_results_anon"
  on public.series_scoring_config
  for select
  to anon
  using (public.series_in_public_results_group(series_id));

create policy "series_penalty_rules_select_public_results_anon"
  on public.series_penalty_rules
  for select
  to anon
  using (public.series_in_public_results_group(series_id));

create policy "series_discard_rules_select_public_results_anon"
  on public.series_discard_rules
  for select
  to anon
  using (public.series_in_public_results_group(series_id));

create policy "series_registrations_select_public_results_anon"
  on public.series_registrations
  for select
  to anon
  using (public.series_in_public_results_group(series_id));

create policy "series_registration_boats_select_public_results_anon"
  on public.series_registration_boats
  for select
  to anon
  using (public.series_in_public_results_group(series_id));

create policy "series_class_py_select_public_results_anon"
  on public.series_class_py
  for select
  to anon
  using (public.series_in_public_results_group(series_id));

create policy "group_class_py_select_public_results_anon"
  on public.group_class_py
  for select
  to anon
  using (public.is_public_results_group(group_id));

create policy "boat_classes_select_public_results_anon"
  on public.boat_classes
  for select
  to anon
  using (
    created_for_group_id is null
    or public.is_public_results_group(created_for_group_id)
  );

create policy "boat_class_pn_select_public_results_anon"
  on public.boat_class_pn
  for select
  to anon
  using (
    exists (
      select 1
      from public.boat_classes bc
      where bc.class_key = boat_class_pn.class_key
        and (
          bc.created_for_group_id is null
          or public.is_public_results_group(bc.created_for_group_id)
        )
    )
  );

create policy "boats_select_public_results_anon"
  on public.boats
  for select
  to anon
  using (
    exists (
      select 1
      from public.race_entries re
      where re.boat_id = boats.id
        and public.race_in_public_results_group(re.race_id)
    )
    or exists (
      select 1
      from public.race_guest_entries ge
      where ge.boat_id = boats.id
        and public.race_in_public_results_group(ge.race_id)
    )
    or exists (
      select 1
      from public.race_guest_entries ge
      join public.boats gb on gb.id = ge.boat_id
      where gb.linked_boat_id = boats.id
        and public.race_in_public_results_group(ge.race_id)
    )
    or exists (
      select 1
      from public.series_registration_boats srb
      join public.series s on s.id = srb.series_id
      where srb.boat_id = boats.id
        and public.is_public_results_group(s.group_id)
    )
    or (
      club_guest_sailor_id is not null
      and exists (
        select 1
        from public.club_guest_sailors gs
        where gs.id = boats.club_guest_sailor_id
          and public.is_public_results_group(gs.group_id)
          and exists (
            select 1
            from public.race_guest_entries ge
            where ge.boat_id = boats.id
              and public.race_in_public_results_group(ge.race_id)
          )
      )
    )
  );

create policy "club_guest_sailors_select_public_results_anon"
  on public.club_guest_sailors
  for select
  to anon
  using (
    public.is_public_results_group(group_id)
    and exists (
      select 1
      from public.boats b
      join public.race_guest_entries ge on ge.boat_id = b.id
      where b.club_guest_sailor_id = club_guest_sailors.id
        and public.race_in_public_results_group(ge.race_id)
    )
  );

create policy "profiles_select_public_results_anon"
  on public.profiles
  for select
  to anon
  using (
    exists (
      select 1
      from public.race_entries re
      where re.user_id = profiles.id
        and public.race_in_public_results_group(re.race_id)
    )
    or exists (
      select 1
      from public.boats b
      join public.race_entries re on re.boat_id = b.id
      where b.owner_user_id = profiles.id
        and public.race_in_public_results_group(re.race_id)
    )
    or exists (
      select 1
      from public.series_registration_boats srb
      join public.series s on s.id = srb.series_id
      join public.boats b on b.id = srb.boat_id
      where b.owner_user_id = profiles.id
        and public.is_public_results_group(s.group_id)
    )
    or exists (
      select 1
      from public.club_guest_sailors cgs
      join public.boats b on b.club_guest_sailor_id = cgs.id
      join public.race_guest_entries ge on ge.boat_id = b.id
      where cgs.linked_user_id = profiles.id
        and public.race_in_public_results_group(ge.race_id)
    )
  );
