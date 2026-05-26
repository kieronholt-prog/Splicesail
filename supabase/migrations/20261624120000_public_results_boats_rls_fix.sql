-- Fix infinite recursion on boats SELECT for anon public results (policy self-joined boats).

create or replace function public.boat_in_public_results(bid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.race_entries re
      where re.boat_id = bid
        and public.race_in_public_results_group(re.race_id)
    )
    or exists (
      select 1
      from public.race_guest_entries ge
      where ge.boat_id = bid
        and public.race_in_public_results_group(ge.race_id)
    )
    or exists (
      select 1
      from public.race_guest_entries ge
      inner join public.boats gb on gb.id = ge.boat_id
      where gb.linked_boat_id = bid
        and public.race_in_public_results_group(ge.race_id)
    )
    or exists (
      select 1
      from public.series_registration_boats srb
      inner join public.series s on s.id = srb.series_id
      where srb.boat_id = bid
        and public.is_public_results_group(s.group_id)
    )
    or exists (
      select 1
      from public.boats b
      inner join public.club_guest_sailors gs on gs.id = b.club_guest_sailor_id
      where b.id = bid
        and b.club_guest_sailor_id is not null
        and public.is_public_results_group(gs.group_id)
        and exists (
          select 1
          from public.race_guest_entries ge
          where ge.boat_id = bid
            and public.race_in_public_results_group(ge.race_id)
        )
    );
$$;

create or replace function public.profile_in_public_results(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.race_entries re
      where re.user_id = pid
        and public.race_in_public_results_group(re.race_id)
    )
    or exists (
      select 1
      from public.series_registration_boats srb
      inner join public.series s on s.id = srb.series_id
      where srb.user_id = pid
        and public.is_public_results_group(s.group_id)
    )
    or exists (
      select 1
      from public.boats b
      inner join public.race_entries re on re.boat_id = b.id
      where b.owner_user_id = pid
        and public.race_in_public_results_group(re.race_id)
    )
    or exists (
      select 1
      from public.club_guest_sailors cgs
      inner join public.boats b on b.club_guest_sailor_id = cgs.id
      inner join public.race_guest_entries ge on ge.boat_id = b.id
      where cgs.linked_user_id = pid
        and public.race_in_public_results_group(ge.race_id)
    );
$$;

revoke all on function public.boat_in_public_results(uuid) from public;
revoke all on function public.profile_in_public_results(uuid) from public;

grant execute on function public.boat_in_public_results(uuid) to anon, authenticated;
grant execute on function public.profile_in_public_results(uuid) to anon, authenticated;

drop policy if exists "boats_select_public_results_anon" on public.boats;

create policy "boats_select_public_results_anon"
  on public.boats
  for select
  to anon
  using (public.boat_in_public_results(id));

drop policy if exists "profiles_select_public_results_anon" on public.profiles;

create policy "profiles_select_public_results_anon"
  on public.profiles
  for select
  to anon
  using (public.profile_in_public_results(id));
