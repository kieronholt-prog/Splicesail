-- Cancelled iCalendar events when races or series are removed (subscription feed sync).

create table public.calendar_event_tombstones (
  uid text primary key,
  series_id uuid references public.series (id) on delete set null,
  group_id uuid not null references public.groups (id) on delete cascade,
  summary text not null check (length(trim(summary)) > 0),
  start_utc timestamptz not null,
  end_utc timestamptz not null,
  cancelled_at timestamptz not null default now()
);

comment on table public.calendar_event_tombstones is
  'Persisted VEVENT UIDs with STATUS:CANCELLED for subscribed series calendars after race/series removal.';

create index calendar_event_tombstones_series_id_idx
  on public.calendar_event_tombstones (series_id)
  where series_id is not null;

create index calendar_event_tombstones_group_id_idx
  on public.calendar_event_tombstones (group_id);

alter table public.calendar_event_tombstones enable row level security;

create policy "calendar_event_tombstones_select_member"
  on public.calendar_event_tombstones
  for select
  to authenticated
  using (public.is_group_member(group_id));

create policy "calendar_event_tombstones_insert_admin"
  on public.calendar_event_tombstones
  for insert
  to authenticated
  with check (public.is_group_admin(group_id));

create policy "calendar_event_tombstones_update_admin"
  on public.calendar_event_tombstones
  for update
  to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

grant select, insert, update on table public.calendar_event_tombstones to authenticated;
grant all on table public.calendar_event_tombstones to service_role;
