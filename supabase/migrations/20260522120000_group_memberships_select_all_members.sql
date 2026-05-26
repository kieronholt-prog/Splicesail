-- Sailors previously only saw their own row (policy allowed self OR club_admin).
-- Member directory on the club page should list every member for anyone in that club.

drop policy if exists "group_memberships_select_member_or_admin" on public.group_memberships;

create policy "group_memberships_select_member_or_admin"
  on public.group_memberships
  for select
  to authenticated
  using (public.is_group_member(group_id));

comment on policy "group_memberships_select_member_or_admin" on public.group_memberships is
  'Any member of a group may read all membership rows in that group. Uses SECURITY DEFINER is_group_member to avoid RLS recursion.';
