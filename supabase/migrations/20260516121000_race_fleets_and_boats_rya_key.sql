-- Race fleets (within a scheduled race): start offset, PN/class banding, signalling.
-- Boat links to catalogue via rya_class_key for reliable fleet matching.

alter table public.boats
  add column if not exists rya_class_key text;

comment on column public.boats.rya_class_key is 'Primary key into rya_class_py; hull class picked from catalogue.';

alter table public.boats
  drop constraint if exists boats_rya_class_key_fkey;

alter table public.boats
  add constraint boats_rya_class_key_fkey
  foreign key (rya_class_key)
  references public.rya_class_py (class_key)
  on delete restrict;

create table public.race_fleets (
  id uuid primary key default gen_random_uuid (),
  race_id uuid not null references public.races (id) on delete cascade,
  sort_order int not null default 0,
  name text not null check (length(trim(name)) > 0),
  start_offset_minutes int not null default 0
    check (start_offset_minutes >= 0 and start_offset_minutes <= 60),
  filter_mode text not null
    check (filter_mode in ('class_keys', 'py_range')),
  class_keys text[] not null default '{}'::text[],
  py_min int,
  py_max int,
  flag_mode text not null default 'ics'
    check (flag_mode in ('ics', 'image_url')),
  ics_signal text,
  flag_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (filter_mode = 'class_keys')
    or (
      filter_mode = 'py_range'
      and py_min is not null
      and py_max is not null
      and py_min between 400 and 2500
      and py_max between 400 and 2500
      and py_min <= py_max
    )
  ),
  check (
    filter_mode <> 'class_keys'
    or (cardinality(class_keys) >= 1)
  ),
  check (
    flag_mode <> 'ics'
    or coalesce(trim(ics_signal), '') <> ''
    or coalesce(trim(flag_image_url), '') <> ''
  ),
  check (
    flag_mode <> 'image_url'
    or coalesce(trim(flag_image_url), '') <> ''
    or coalesce(trim(ics_signal), '') <> ''
  )
);

comment on table public.race_fleets is 'Split starts within one race; matching uses boat catalogue class or effective PN.';
comment on column public.race_fleets.flag_mode is 'ics: show international code name; image_url: hosted flag artwork.';
comment on column public.race_fleets.flag_image_url is 'Public HTTPS URL or Supabase Storage path rendered by app.';
comment on column public.race_fleets.sort_order is 'Lower numbers matched first when assigning sailor to fleet.';

create index race_fleets_race_idx on public.race_fleets (race_id);

create or replace function public.race_fleets_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger race_fleets_set_updated_at
  before update on public.race_fleets
  for each row
  execute function public.race_fleets_set_updated_at();

alter table public.race_fleets enable row level security;

create policy "race_fleets_select_group_member"
  on public.race_fleets
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.races r
      join public.series s on s.id = r.series_id
      where r.id = race_fleets.race_id
        and public.is_group_member(s.group_id)
    )
  );

create policy "race_fleets_insert_staff"
  on public.race_fleets
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.races r
      join public.series s on s.id = r.series_id
      join public.group_memberships m
        on m.group_id = s.group_id and m.user_id = auth.uid()
      where r.id = race_fleets.race_id
        and m.role in ('club_admin', 'race_officer')
    )
  );

create policy "race_fleets_update_staff"
  on public.race_fleets
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.races r
      join public.series s on s.id = r.series_id
      join public.group_memberships m
        on m.group_id = s.group_id and m.user_id = auth.uid()
      where r.id = race_fleets.race_id
        and m.role in ('club_admin', 'race_officer')
    )
  )
  with check (
    exists (
      select 1
      from public.races r
      join public.series s on s.id = r.series_id
      join public.group_memberships m
        on m.group_id = s.group_id and m.user_id = auth.uid()
      where r.id = race_fleets.race_id
        and m.role in ('club_admin', 'race_officer')
    )
  );

create policy "race_fleets_delete_staff"
  on public.race_fleets
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.races r
      join public.series s on s.id = r.series_id
      join public.group_memberships m
        on m.group_id = s.group_id and m.user_id = auth.uid()
      where r.id = race_fleets.race_id
        and m.role in ('club_admin', 'race_officer')
    )
  );

grant select, insert, update, delete on table public.race_fleets to authenticated;
grant all on table public.race_fleets to service_role;

alter table public.race_entries
  add column if not exists fleet_id uuid references public.race_fleets (id) on delete set null;

comment on column public.race_entries.fleet_id is 'Fleet start group assigned from boat vs race_fleets rules.';

create index race_entries_fleet_idx on public.race_entries (fleet_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fleet_flags',
  'fleet_flags',
  true,
  1048576,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id)
do nothing;

-- -----------------------------------------------------------------------------
-- Fleet flag objects (authenticated upload / update / delete)
-- -----------------------------------------------------------------------------
create policy "fleet_flags_objects_public_read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'fleet_flags');

create policy "fleet_flags_objects_authenticated_insert"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'fleet_flags');

create policy "fleet_flags_objects_authenticated_update"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'fleet_flags')
  with check (bucket_id = 'fleet_flags');

create policy "fleet_flags_objects_authenticated_delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'fleet_flags');
