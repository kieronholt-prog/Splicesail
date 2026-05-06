-- Wave A: series registration (one signup covers all races in the series).

create table public.series_registrations (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (series_id, user_id)
);

comment on table public.series_registrations is 'Sailor registered for an entire series (v1: series-wide only).';

create index series_registrations_series_id_idx on public.series_registrations (series_id);
create index series_registrations_user_id_idx on public.series_registrations (user_id);

alter table public.series_registrations enable row level security;

-- Members of the club can see who is registered for series in that club.
create policy "series_registrations_select_group_member"
  on public.series_registrations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.series s
      where s.id = series_registrations.series_id
        and public.is_group_member(s.group_id)
    )
  );

-- Sailors register themselves; must belong to the club hosting the series.
create policy "series_registrations_insert_self_member"
  on public.series_registrations
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.series s
      where s.id = series_registrations.series_id
        and public.is_group_member(s.group_id)
    )
  );

-- Withdraw own registration, or club_admin clears entries for their club.
create policy "series_registrations_delete_own_or_admin"
  on public.series_registrations
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.series s
      where s.id = series_registrations.series_id
        and public.is_group_admin(s.group_id)
    )
  );

grant select, insert, delete on table public.series_registrations to authenticated;
grant all on table public.series_registrations to service_role;
