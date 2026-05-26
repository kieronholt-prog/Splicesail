-- Member-owned boats were only visible to their owner (boats_owner_select).
-- Race officers and other club members need hull metadata for entries in their club's races.

create policy "boats_select_referenced_by_group_race_entry"
  on public.boats for select to authenticated
  using (
    exists (
      select 1
      from public.race_entries re
      join public.races r on r.id = re.race_id
      join public.series s on s.id = r.series_id
      join public.group_memberships m on m.group_id = s.group_id and m.user_id = auth.uid()
      where re.boat_id = boats.id
    )
  );

comment on policy "boats_select_referenced_by_group_race_entry" on public.boats is
  'Group members may read boats that appear on race entries in their club (label, class, default sail for RO/start-line UI).';
