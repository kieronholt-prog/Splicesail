-- Wave A: series + races (scoped to group). Members read; club_admin writes.

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table public.series (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now()
);

comment on table public.series is 'Race series within one club (group).';

create index series_group_id_idx on public.series (group_id);

create table public.races (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  scheduled_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.races is 'Scheduled race within a series.';

create index races_series_id_idx on public.races (series_id);
create index races_scheduled_at_idx on public.races (scheduled_at);

-- -----------------------------------------------------------------------------
-- RLS: series
-- -----------------------------------------------------------------------------

alter table public.series enable row level security;

create policy "series_select_member"
  on public.series
  for select
  to authenticated
  using (public.is_group_member(group_id));

create policy "series_insert_admin"
  on public.series
  for insert
  to authenticated
  with check (public.is_group_admin(group_id));

create policy "series_update_admin"
  on public.series
  for update
  to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

create policy "series_delete_admin"
  on public.series
  for delete
  to authenticated
  using (public.is_group_admin(group_id));

grant select, insert, update, delete on table public.series to authenticated;
grant all on table public.series to service_role;

-- -----------------------------------------------------------------------------
-- RLS: races
-- -----------------------------------------------------------------------------

alter table public.races enable row level security;

create policy "races_select_group_member"
  on public.races
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.series s
      where s.id = races.series_id
        and public.is_group_member(s.group_id)
    )
  );

create policy "races_insert_group_admin"
  on public.races
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.series s
      where s.id = races.series_id
        and public.is_group_admin(s.group_id)
    )
  );

create policy "races_update_group_admin"
  on public.races
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.series s
      where s.id = races.series_id
        and public.is_group_admin(s.group_id)
    )
  )
  with check (
    exists (
      select 1
      from public.series s
      where s.id = races.series_id
        and public.is_group_admin(s.group_id)
    )
  );

create policy "races_delete_group_admin"
  on public.races
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.series s
      where s.id = races.series_id
        and public.is_group_admin(s.group_id)
    )
  );

grant select, insert, update, delete on table public.races to authenticated;
grant all on table public.races to service_role;
