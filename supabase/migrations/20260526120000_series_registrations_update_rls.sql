-- Upsert on series_registrations uses INSERT ... ON CONFLICT DO UPDATE, which requires
-- UPDATE privilege and a FOR UPDATE RLS policy (USING/WITH CHECK). Inserts worked;
-- re-entry or idempotent upsert hit the update leg and failed RLS.

grant update on table public.series_registrations to authenticated;

create policy "series_registrations_update_own_member"
  on public.series_registrations
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.series s
      where s.id = series_registrations.series_id
        and public.is_group_member(s.group_id)
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.series s
      where s.id = series_registrations.series_id
        and public.is_group_member(s.group_id)
    )
  );
