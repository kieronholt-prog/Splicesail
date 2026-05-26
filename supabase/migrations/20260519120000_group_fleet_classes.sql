-- Link club fleets to RYA boat classes + optional fleet-wide letter/number flag scheme.

alter table public.group_fleets
  add column if not exists class_flag_scheme text;

alter table public.group_fleets
  drop constraint if exists group_fleets_class_flag_scheme_check;

alter table public.group_fleets
  add constraint group_fleets_class_flag_scheme_check
    check (
      class_flag_scheme is null
      or class_flag_scheme in ('letter', 'number')
    );

comment on column public.group_fleets.class_flag_scheme is 'Whether divisions use letter or numeric class identifiers (organisation preference).';

-- -----------------------------------------------------------------------------

create table public.group_fleet_classes (
  fleet_id uuid not null references public.group_fleets (id) on delete cascade,
  class_key text not null references public.rya_class_py (class_key) on delete restrict,
  created_at timestamptz not null default now (),
  primary key (fleet_id, class_key)
);

comment on table public.group_fleet_classes is 'RYA hull classes eligible in a club-defined fleet grouping.';

create index group_fleet_classes_fleet_idx on public.group_fleet_classes (fleet_id);

alter table public.group_fleet_classes enable row level security;

create policy "group_fleet_classes_select_member"
  on public.group_fleet_classes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.group_fleets gf
      where gf.id = group_fleet_classes.fleet_id
        and public.is_group_member(gf.group_id)
    )
  );

create policy "group_fleet_classes_insert_admin"
  on public.group_fleet_classes
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.group_fleets gf
      where gf.id = group_fleet_classes.fleet_id
        and public.is_group_admin(gf.group_id)
    )
  );

create policy "group_fleet_classes_delete_admin"
  on public.group_fleet_classes
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.group_fleets gf
      where gf.id = group_fleet_classes.fleet_id
        and public.is_group_admin(gf.group_id)
    )
  );

grant select, insert, delete on table public.group_fleet_classes to authenticated;
grant all on table public.group_fleet_classes to service_role;
