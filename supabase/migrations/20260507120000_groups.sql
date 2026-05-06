-- Wave A: clubs ("groups") and memberships + RLS aligned to planning sketch.

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  slug text unique,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

comment on table public.groups is 'Club / organisation (tenancy boundary).';

create index groups_created_by_idx on public.groups (created_by);

create table public.group_memberships (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (
    role in ('sailor', 'club_admin', 'race_officer')
  ),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

comment on table public.group_memberships is 'User ↔ group role (sailor, club_admin, race_officer).';

create index group_memberships_user_id_idx on public.group_memberships (user_id);
create index group_memberships_group_id_idx on public.group_memberships (group_id);

-- -----------------------------------------------------------------------------
-- Creator becomes club_admin (bypasses RLS via SECURITY DEFINER).
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_memberships (group_id, user_id, role)
  values (new.id, new.created_by, 'club_admin');
  return new;
end;
$$;

create trigger groups_after_insert_creator_membership
  after insert on public.groups
  for each row
  execute function public.handle_new_group();

create or replace function public.groups_freeze_created_by()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'groups.created_by is immutable';
  end if;
  return new;
end;
$$;

create trigger groups_freeze_created_by
  before update on public.groups
  for each row
  execute function public.groups_freeze_created_by();

-- -----------------------------------------------------------------------------
-- Policy helpers (SECURITY DEFINER so membership checks do not recurse with RLS).
-- -----------------------------------------------------------------------------

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
  );
$$;

revoke all on function public.is_group_member(uuid) from public;
revoke all on function public.is_group_admin(uuid) from public;

grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_admin(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- RLS: groups
-- -----------------------------------------------------------------------------

alter table public.groups enable row level security;

create policy "groups_select_member"
  on public.groups
  for select
  to authenticated
  using (public.is_group_member(id));

create policy "groups_insert_creator"
  on public.groups
  for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "groups_update_admin"
  on public.groups
  for update
  to authenticated
  using (public.is_group_admin(id))
  with check (public.is_group_admin(id));

create policy "groups_delete_admin"
  on public.groups
  for delete
  to authenticated
  using (public.is_group_admin(id));

grant select, insert, update, delete on table public.groups to authenticated;
grant all on table public.groups to service_role;

-- -----------------------------------------------------------------------------
-- RLS: group_memberships
-- -----------------------------------------------------------------------------

alter table public.group_memberships enable row level security;

create policy "group_memberships_select_member_or_admin"
  on public.group_memberships
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_group_admin(group_id)
  );

create policy "group_memberships_insert_admin"
  on public.group_memberships
  for insert
  to authenticated
  with check (public.is_group_admin(group_id));

create policy "group_memberships_update_admin"
  on public.group_memberships
  for update
  to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

create policy "group_memberships_delete_admin_or_self"
  on public.group_memberships
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_group_admin(group_id)
  );

grant select, insert, update, delete on table public.group_memberships to authenticated;
grant all on table public.group_memberships to service_role;

-- -----------------------------------------------------------------------------
-- Profiles: allow limited visibility for users who share a group (crew / RO lists).
-- -----------------------------------------------------------------------------

create policy "profiles_select_same_group"
  on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.group_memberships mine
      inner join public.group_memberships peer
        on peer.group_id = mine.group_id
       and peer.user_id = profiles.id
      where mine.user_id = auth.uid()
    )
  );
