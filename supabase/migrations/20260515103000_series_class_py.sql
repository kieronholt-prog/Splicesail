-- Series-level Portsmouth overrides (series beats group beats RYA list).

create table if not exists public.series_class_py (
  series_id uuid not null references public.series (id) on delete cascade,
  class_key text not null,
  py int not null check (py between 400 and 2500),
  primary key (series_id, class_key)
);

comment on table public.series_class_py is 'Series PN override; effective PN = series_class_py then group_class_py then rya_class_py.';

create index if not exists series_class_py_series_idx on public.series_class_py (series_id);

alter table public.series_class_py enable row level security;

create policy "series_class_py_select_group_member"
  on public.series_class_py
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.series s
      where s.id = series_class_py.series_id
        and public.is_group_member(s.group_id)
    )
  );

create policy "series_class_py_insert_group_admin"
  on public.series_class_py
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.series s
      where s.id = series_class_py.series_id
        and public.is_group_admin(s.group_id)
    )
  );

create policy "series_class_py_update_group_admin"
  on public.series_class_py
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.series s
      where s.id = series_class_py.series_id
        and public.is_group_admin(s.group_id)
    )
  )
  with check (
    exists (
      select 1
      from public.series s
      where s.id = series_class_py.series_id
        and public.is_group_admin(s.group_id)
    )
  );

create policy "series_class_py_delete_group_admin"
  on public.series_class_py
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.series s
      where s.id = series_class_py.series_id
        and public.is_group_admin(s.group_id)
    )
  );

grant select, insert, update, delete on table public.series_class_py to authenticated;
grant all on table public.series_class_py to service_role;
