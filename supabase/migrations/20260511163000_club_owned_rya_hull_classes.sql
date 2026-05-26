-- Club-managed hull handicap rows extend rya_class_py so boats and fleet rules keep a single FK.
-- National catalogue: created_for_group_id is null.

alter table public.rya_class_py
  add column if not exists created_for_group_id uuid references public.groups (id) on delete cascade;

create index if not exists rya_class_py_created_for_group_idx
  on public.rya_class_py (created_for_group_id)
  where created_for_group_id is not null;

comment on column public.rya_class_py.created_for_group_id is
  'When set, PN row is visible only within that club (local hull definition). Null rows are shared RYA catalogue.';

drop policy if exists "rya_class_py_select_authenticated" on public.rya_class_py;

create policy "rya_class_py_select_catalog"
  on public.rya_class_py
  for select
  to authenticated
  using (
    created_for_group_id is null
    or public.is_group_member (created_for_group_id)
  );

grant insert, update, delete on table public.rya_class_py to authenticated;

create policy "rya_class_py_insert_group_admin_own"
  on public.rya_class_py
  for insert
  to authenticated
  with check (
    created_for_group_id is not null
    and public.is_group_admin (created_for_group_id)
  );

create policy "rya_class_py_update_group_admin_own"
  on public.rya_class_py
  for update
  to authenticated
  using (
    created_for_group_id is not null
    and public.is_group_admin (created_for_group_id)
  )
  with check (
    created_for_group_id is not null
    and public.is_group_admin (created_for_group_id)
  );

create policy "rya_class_py_delete_group_admin_own"
  on public.rya_class_py
  for delete
  to authenticated
  using (
    created_for_group_id is not null
    and public.is_group_admin (created_for_group_id)
  );
