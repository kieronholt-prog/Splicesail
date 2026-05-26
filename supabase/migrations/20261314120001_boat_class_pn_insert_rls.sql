-- Club baseline PN writes use INSERT ... ON CONFLICT (Supabase upsert). The prior migration
-- only granted UPDATE/DELETE and defined policies for SELECT/UPDATE/DELETE. Missing PN rows —
-- possible if hulls predated ensure_boat_class_pn — then INSERT failed with:
-- "new row violates row-level security policy for table boat_class_pn".

grant insert on table public.boat_class_pn to authenticated;

create policy "boat_class_pn_insert_club_own"
  on public.boat_class_pn for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.boat_classes bc
      where bc.class_key = boat_class_pn.class_key
        and bc.created_for_group_id is not null
        and exists (
          select 1
          from public.group_memberships gm
          where gm.group_id = bc.created_for_group_id
            and gm.user_id = auth.uid()
            and gm.role = 'club_admin'
        )
    )
  );
