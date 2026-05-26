-- Per-sailor subscribe URLs for series iCalendar feeds (calendar apps poll without session cookies).

create table public.series_calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  series_id uuid not null references public.series (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, series_id)
);

comment on table public.series_calendar_feeds is
  'Opaque token URLs for subscribed series calendars; one feed per user per series.';

create index series_calendar_feeds_token_idx on public.series_calendar_feeds (token);
create index series_calendar_feeds_series_id_idx on public.series_calendar_feeds (series_id);

alter table public.series_calendar_feeds enable row level security;

create policy "series_calendar_feeds_select_own"
  on public.series_calendar_feeds
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "series_calendar_feeds_insert_own"
  on public.series_calendar_feeds
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_group_member(group_id)
    and exists (
      select 1
      from public.series s
      where s.id = series_id
        and s.group_id = series_calendar_feeds.group_id
    )
  );

create policy "series_calendar_feeds_delete_own"
  on public.series_calendar_feeds
  for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on table public.series_calendar_feeds to authenticated;
grant all on table public.series_calendar_feeds to service_role;

-- Token lookup + payload for calendar pollers (no session cookie).
create or replace function public.series_calendar_feed_payload(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feed public.series_calendar_feeds%rowtype;
  v_series public.series%rowtype;
  v_club_name text;
  v_races jsonb;
  v_tombstones jsonb;
begin
  select * into v_feed from public.series_calendar_feeds where token = p_token;
  if not found then
    return null;
  end if;

  if not exists (
    select 1
    from public.group_memberships gm
    where gm.group_id = v_feed.group_id
      and gm.user_id = v_feed.user_id
  ) then
    return null;
  end if;

  select * into v_series from public.series where id = v_feed.series_id;
  if not found or v_series.group_id is distinct from v_feed.group_id then
    return null;
  end if;

  select g.name into v_club_name from public.groups g where g.id = v_feed.group_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'name', r.name,
        'scheduled_at', r.scheduled_at,
        'race_type', r.race_type
      )
      order by r.scheduled_at asc
    ),
    '[]'::jsonb
  )
  into v_races
  from public.races r
  where r.series_id = v_feed.series_id
    and r.scheduled_at is not null;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'uid', t.uid,
        'summary', t.summary,
        'start_utc', t.start_utc,
        'end_utc', t.end_utc
      )
    ),
    '[]'::jsonb
  )
  into v_tombstones
  from public.calendar_event_tombstones t
  where t.series_id = v_feed.series_id;

  return jsonb_build_object(
    'calendar_name', v_series.name || ' — ' || coalesce(v_club_name, 'Club'),
    'club_name', coalesce(v_club_name, 'Club'),
    'series_name', v_series.name,
    'races', v_races,
    'tombstones', v_tombstones
  );
end;
$$;

comment on function public.series_calendar_feed_payload(uuid) is
  'Returns series race schedule JSON for an subscribed calendar token when the owner is still a club member.';

revoke all on function public.series_calendar_feed_payload(uuid) from public;
grant execute on function public.series_calendar_feed_payload(uuid) to anon;
grant execute on function public.series_calendar_feed_payload(uuid) to authenticated;
grant execute on function public.series_calendar_feed_payload(uuid) to service_role;
