-- Spike (option B): allow boats rows owned by a club guest sailor (no auth user) alongside fleet boats.
-- Guest hull rows live in boats with club_guest_sailor_id set; optional linked_boat_id points at the member fleet hull.

-- -----------------------------------------------------------------------------
-- Nullable fleet owner + optional club guest sailor holder (exactly one must be set)
-- -----------------------------------------------------------------------------

alter table public.boats
  alter column owner_user_id drop not null;

alter table public.boats
  add column club_guest_sailor_id uuid references public.club_guest_sailors (id) on delete cascade;

comment on column public.boats.owner_user_id is
  'Signed-in sailor who owns this fleet boat; NULL when the row is club-managed for a guest sailor (see club_guest_sailor_id).';

comment on column public.boats.club_guest_sailor_id is
  'When set, this boats row is maintained by club admins for the named guest sailor; owner_user_id is NULL until promoted / claimed.';

alter table public.boats
  add constraint boats_owner_xor_guest_holder_chk check (
    (owner_user_id is not null and club_guest_sailor_id is null)
    or (owner_user_id is null and club_guest_sailor_id is not null)
  );

create index boats_club_guest_sailor_id_idx on public.boats (club_guest_sailor_id)
  where club_guest_sailor_id is not null;

comment on table public.boats is
  'Fleet dinghy: either owned by auth.users (owner_user_id) or club-managed for a guest sailor (club_guest_sailor_id).';

-- -----------------------------------------------------------------------------
-- RLS: guest-holder boats visible to group members; mutate club_admin only.
-- Promotion (set owner_user_id, clear guest) stays a SECURITY DEFINER RPC later —
-- updates here keep the row guest-managed (both columns XOR per check constraint).
-- -----------------------------------------------------------------------------

create policy "boats_club_guest_select_group_member"
  on public.boats
  for select
  to authenticated
  using (
    club_guest_sailor_id is not null
    and exists (
      select 1
      from public.club_guest_sailors gs
      where gs.id = boats.club_guest_sailor_id
        and public.is_group_member(gs.group_id)
    )
  );

create policy "boats_club_guest_insert_admin"
  on public.boats
  for insert
  to authenticated
  with check (
    owner_user_id is null
    and club_guest_sailor_id is not null
    and exists (
      select 1
      from public.club_guest_sailors gs
      where gs.id = boats.club_guest_sailor_id
        and public.is_group_admin(gs.group_id)
    )
  );

create policy "boats_club_guest_update_admin"
  on public.boats
  for update
  to authenticated
  using (
    club_guest_sailor_id is not null
    and exists (
      select 1
      from public.club_guest_sailors gs
      where gs.id = boats.club_guest_sailor_id
        and public.is_group_admin(gs.group_id)
    )
  )
  with check (
    owner_user_id is null
    and club_guest_sailor_id is not null
    and exists (
      select 1
      from public.club_guest_sailors gs
      where gs.id = boats.club_guest_sailor_id
        and public.is_group_admin(gs.group_id)
    )
  );

create policy "boats_club_guest_delete_admin"
  on public.boats
  for delete
  to authenticated
  using (
    club_guest_sailor_id is not null
    and exists (
      select 1
      from public.club_guest_sailors gs
      where gs.id = boats.club_guest_sailor_id
        and public.is_group_admin(gs.group_id)
    )
  );
