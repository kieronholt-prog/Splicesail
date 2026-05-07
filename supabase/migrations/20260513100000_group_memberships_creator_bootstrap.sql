-- Bootstrap membership: creator trigger inserts club_admin before any membership exists,
-- so is_group_admin(group_id) is false. Allow insert when the row matches groups.created_by.

create policy "group_memberships_insert_if_group_creator"
  on public.group_memberships
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and role = 'club_admin'
    and exists (
      select 1
      from public.groups g
      where g.id = group_memberships.group_id
        and g.created_by = auth.uid()
    )
  );

comment on policy "group_memberships_insert_if_group_creator" on public.group_memberships is
  'Lets groups_after_insert_creator_membership trigger add the first club_admin row (chicken-and-egg vs insert_admin).';
