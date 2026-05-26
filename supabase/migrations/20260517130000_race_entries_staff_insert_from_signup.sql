-- Race officers / club admins may create a race_entries row for a sailor hull that is on the
-- series signup but has no per-race row yet (Home tally / race page flow may not have run).

create policy "race_entries_insert_staff_series_signup"
  on public.race_entries for insert to authenticated
  with check (
    exists (
      select 1
      from public.races r
      join public.series s on s.id = r.series_id
      join public.group_memberships m
        on m.group_id = s.group_id and m.user_id = auth.uid()
      join public.series_registration_boats srb
        on srb.series_id = r.series_id
        and srb.user_id = race_entries.user_id
        and srb.boat_id = race_entries.boat_id
      where r.id = race_entries.race_id
        and m.role in ('club_admin', 'race_officer')
    )
  );

comment on policy "race_entries_insert_staff_series_signup" on public.race_entries is
  'Staff may insert a row for (race, sailor, hull) when that hull is on series_registration_boats for the race series.';
