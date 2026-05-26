-- Club directory: any signed-in user can list groups (id, name, slug) to search and request to join.
-- Join requests: pending → club_admin approves (creates sailor membership) or declines.

create policy "groups_select_authenticated_directory"
  on public.groups
  for select
  to authenticated
  using (true);

comment on policy "groups_select_authenticated_directory" on public.groups is
  'Lets any authenticated user browse the clubs directory; combined with groups_select_member via OR.';

-- -----------------------------------------------------------------------------

create table public.group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null
);

comment on table public.group_join_requests is
  'User requests to join a club; club_admin approves (adds membership) or declines.';

create unique index group_join_requests_one_pending_per_user_group
  on public.group_join_requests (group_id, user_id)
  where (status = 'pending');

create index group_join_requests_group_id_status_idx
  on public.group_join_requests (group_id, status);

alter table public.group_join_requests enable row level security;

create policy "group_join_requests_select_own_or_admin"
  on public.group_join_requests
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_group_admin(group_id)
  );

create policy "group_join_requests_insert_self_pending"
  on public.group_join_requests
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and not public.is_group_member(group_id)
  );

create policy "group_join_requests_update_admin"
  on public.group_join_requests
  for update
  to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

grant select, insert, update on table public.group_join_requests to authenticated;
grant all on table public.group_join_requests to service_role;

-- Club admins must see applicants' display names before they are members (no shared group yet).
create policy "profiles_select_pending_join_applicant"
  on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.group_join_requests r
      inner join public.group_memberships m
        on m.group_id = r.group_id
        and m.user_id = auth.uid()
        and m.role = 'club_admin'
      where r.user_id = profiles.id
        and r.status = 'pending'
    )
  );

comment on policy "profiles_select_pending_join_applicant" on public.profiles is
  'Lets club_admin read basic profile rows for users who requested to join that club.';
