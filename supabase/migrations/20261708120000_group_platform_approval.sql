-- Platform approval before new clubs become operational.
-- Existing clubs are backfilled to approved; new rows default to pending.

alter table public.groups
  add column if not exists approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected'));

alter table public.groups
  add column if not exists approval_resolved_at timestamptz;

comment on column public.groups.approval_status is
  'pending until platform approver accepts; rejected clubs stay invisible in the directory.';

update public.groups
set approval_status = 'approved'
where approval_status = 'pending';

-- Membership/admin helpers only apply to approved clubs.
create or replace function public.is_group_approved(gid uuid)
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
      and g.approval_status = 'approved'
  );
$$;

revoke all on function public.is_group_approved(uuid) from public;
grant execute on function public.is_group_approved(uuid) to authenticated, anon;

create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_memberships m
    where m.group_id = gid
      and m.user_id = auth.uid()
      and public.is_group_approved(gid)
  );
$$;

create or replace function public.is_group_admin(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_memberships m
    where m.group_id = gid
      and m.user_id = auth.uid()
      and m.role = 'club_admin'
      and public.is_group_approved(gid)
  );
$$;

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
      and g.approval_status = 'approved'
      and g.slug is not null
      and length(trim(g.slug)) > 0
  );
$$;

-- Directory: only approved clubs are searchable / joinable.
drop policy if exists "groups_select_authenticated_directory" on public.groups;

create policy "groups_select_authenticated_directory"
  on public.groups
  for select
  to authenticated
  using (approval_status = 'approved');

comment on policy "groups_select_authenticated_directory" on public.groups is
  'Approved clubs only in the directory; combined with member/creator policies via OR.';

-- Creator may read their pending or rejected club row.
create policy "groups_select_creator_unapproved"
  on public.groups
  for select
  to authenticated
  using (
    created_by = auth.uid()
    and approval_status in ('pending', 'rejected')
  );

-- Join requests only for approved clubs.
drop policy if exists "group_join_requests_insert_self_pending" on public.group_join_requests;

create policy "group_join_requests_insert_self_pending"
  on public.group_join_requests
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and not public.is_group_member(group_id)
    and public.is_group_approved(group_id)
  );
