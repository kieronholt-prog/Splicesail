-- Prefer SECURITY DEFINER is_group_member (matches race_entries RLS) so boat rows
-- referenced on race_entries are visible to any club member of that series' group.

drop policy if exists "boats_select_referenced_by_group_race_entry" on public.boats;

create policy "boats_select_referenced_by_group_race_entry"
  on public.boats for select to authenticated
  using (
    exists (
      select 1
      from public.race_entries re
      join public.races r on r.id = re.race_id
      join public.series s on s.id = r.series_id
      where re.boat_id = boats.id
        and public.is_group_member(s.group_id)
    )
  );

comment on policy "boats_select_referenced_by_group_race_entry" on public.boats is
  'Group members may read boats that appear on race_entries in their club (RO / start line / finishes). Uses is_group_member like race_entries select.';
