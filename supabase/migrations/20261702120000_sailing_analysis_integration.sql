-- Sailstats integration: club sailing area, track submissions, Strava connections, analysis settings.

-- -----------------------------------------------------------------------------
-- Staff helper (club_admin or race_officer)
-- -----------------------------------------------------------------------------

create or replace function public.is_group_race_staff(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_memberships m
    where m.group_id = gid
      and m.user_id = auth.uid()
      and m.role in ('club_admin', 'race_officer')
  );
$$;

revoke all on function public.is_group_race_staff(uuid) from public;
grant execute on function public.is_group_race_staff(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Club sailing marks and courses
-- -----------------------------------------------------------------------------

create table public.group_sailing_marks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  lat double precision not null check (lat >= -90 and lat <= 90),
  lon double precision not null check (lon >= -180 and lon <= 180),
  mark_kind text not null default 'laid' check (mark_kind in ('fixed', 'laid')),
  chart_ref text,
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, name)
);

create index group_sailing_marks_group_id_idx on public.group_sailing_marks (group_id);

comment on table public.group_sailing_marks is 'Per-club chart marks for GPS track / course analysis.';

create table public.group_sailing_courses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  course_letter text not null check (length(trim(course_letter)) > 0),
  display_name text not null check (length(trim(display_name)) > 0),
  course_type text not null default 'SC' check (course_type in ('SC', 'MC', 'LC', 'custom')),
  mark_sequence jsonb not null default '[]'::jsonb,
  marks_preamble jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, course_letter)
);

create index group_sailing_courses_group_id_idx on public.group_sailing_courses (group_id);

comment on table public.group_sailing_courses is 'Per-club course letters with ordered mark rounding sequence ([name, P|S]).';

-- -----------------------------------------------------------------------------
-- Strava OAuth tokens (server-managed; RLS owner-only)
-- -----------------------------------------------------------------------------

create table public.user_strava_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  strava_athlete_id bigint not null unique,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  firstname text,
  lastname text,
  profile_pic text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_strava_connections is 'Strava OAuth tokens linked to Splice auth users.';

-- -----------------------------------------------------------------------------
-- Track submissions and race analysis
-- -----------------------------------------------------------------------------

create table public.race_track_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  race_id uuid references public.races (id) on delete set null,
  race_entry_id uuid references public.race_entries (id) on delete set null,
  boat_id uuid references public.boats (id) on delete set null,
  proposed_race_id uuid references public.races (id) on delete set null,
  track_source text not null check (track_source in ('strava', 'upload')),
  external_activity_id text not null,
  activity_name text,
  activity_started_at timestamptz not null,
  activity_ended_at timestamptz not null,
  analysis_mode text check (analysis_mode in ('standalone', 'collated')),
  status text not null default 'draft' check (
    status in (
      'draft',
      'pending_confirm',
      'pending_mode',
      'pending_setup',
      'pending_ro',
      'ready',
      'cancelled'
    )
  ),
  storage_path text,
  course_letter text,
  laps int not null default 1 check (laps >= 1 and laps <= 20),
  mark_overrides jsonb not null default '{}'::jsonb,
  course_setup jsonb not null default '{}'::jsonb,
  det_settings jsonb not null default '{}'::jsonb,
  ready_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, external_activity_id)
);

create index race_track_submissions_user_id_idx on public.race_track_submissions (user_id);
create index race_track_submissions_race_id_idx on public.race_track_submissions (race_id);
create index race_track_submissions_group_status_idx on public.race_track_submissions (group_id, status);

comment on table public.race_track_submissions is 'Sailor GPS track linked to a race/boat for standalone or collated analysis.';

create table public.race_analysis_settings (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null unique references public.races (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  course_letter text,
  laps int not null default 1 check (laps >= 1 and laps <= 20),
  wind_direction double precision,
  mark_overrides jsonb not null default '{}'::jsonb,
  course_setup jsonb not null default '{}'::jsonb,
  det_settings jsonb not null default '{}'::jsonb,
  ro_confirmed_at timestamptz,
  ro_confirmed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index race_analysis_settings_group_id_idx on public.race_analysis_settings (group_id);

comment on table public.race_analysis_settings is 'RO-confirmed course/mark setup for collated fleet track analysis on a race.';

create table public.race_track_analyses (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.race_track_submissions (id) on delete cascade,
  stats jsonb not null default '{}'::jsonb,
  tack_scores jsonb not null default '[]'::jsonb,
  gybe_scores jsonb not null default '[]'::jsonb,
  leg_summary jsonb not null default '[]'::jsonb,
  analysis_snapshot jsonb,
  wind_direction double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.race_track_analyses is 'Computed Sailstats analysis output for a track submission.';

-- -----------------------------------------------------------------------------
-- RLS: group sailing area
-- -----------------------------------------------------------------------------

alter table public.group_sailing_marks enable row level security;
alter table public.group_sailing_courses enable row level security;

create policy group_sailing_marks_select on public.group_sailing_marks
  for select to authenticated
  using (public.is_group_member(group_id));

create policy group_sailing_marks_admin_write on public.group_sailing_marks
  for all to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

create policy group_sailing_courses_select on public.group_sailing_courses
  for select to authenticated
  using (public.is_group_member(group_id));

create policy group_sailing_courses_admin_write on public.group_sailing_courses
  for all to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

-- -----------------------------------------------------------------------------
-- RLS: Strava connections (owner only)
-- -----------------------------------------------------------------------------

alter table public.user_strava_connections enable row level security;

create policy user_strava_connections_owner on public.user_strava_connections
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- RLS: track submissions
-- -----------------------------------------------------------------------------

alter table public.race_track_submissions enable row level security;
alter table public.race_analysis_settings enable row level security;
alter table public.race_track_analyses enable row level security;

create policy race_track_submissions_owner on public.race_track_submissions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy race_track_submissions_staff_select on public.race_track_submissions
  for select to authenticated
  using (
    analysis_mode = 'collated'
    and public.is_group_race_staff(group_id)
  );

create policy race_analysis_settings_staff on public.race_analysis_settings
  for all to authenticated
  using (public.is_group_race_staff(group_id))
  with check (public.is_group_race_staff(group_id));

create policy race_analysis_settings_member_select on public.race_analysis_settings
  for select to authenticated
  using (public.is_group_member(group_id));

create policy race_track_analyses_owner on public.race_track_analyses
  for select to authenticated
  using (
    exists (
      select 1
      from public.race_track_submissions s
      where s.id = submission_id
        and s.user_id = auth.uid()
    )
  );

create policy race_track_analyses_collated_participant on public.race_track_analyses
  for select to authenticated
  using (
    exists (
      select 1
      from public.race_track_submissions s
      join public.race_track_submissions mine on mine.race_id = s.race_id
      join public.profiles p on p.id = s.user_id
      where s.id = submission_id
        and s.analysis_mode = 'collated'
        and s.status = 'ready'
        and mine.user_id = auth.uid()
        and mine.race_id = s.race_id
        and mine.analysis_mode = 'collated'
        and mine.status = 'ready'
        and p.share_track_for_enhanced_analytics = true
    )
  );

create policy race_track_analyses_staff on public.race_track_analyses
  for select to authenticated
  using (
    exists (
      select 1
      from public.race_track_submissions s
      where s.id = submission_id
        and public.is_group_race_staff(s.group_id)
    )
  );

create policy race_track_analyses_insert_owner on public.race_track_analyses
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.race_track_submissions s
      where s.id = submission_id
        and s.user_id = auth.uid()
    )
  );

create policy race_track_analyses_update_owner on public.race_track_analyses
  for update to authenticated
  using (
    exists (
      select 1
      from public.race_track_submissions s
      where s.id = submission_id
        and s.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Storage bucket for uploaded tracks
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'race-tracks',
  'race-tracks',
  false,
  52428800,
  array['application/gpx+xml', 'application/xml', 'text/xml', 'application/octet-stream', 'application/json']
)
on conflict (id) do nothing;

create policy race_tracks_storage_owner on storage.objects
  for all to authenticated
  using (
    bucket_id = 'race-tracks'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'race-tracks'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy race_tracks_storage_staff_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'race-tracks'
    and exists (
      select 1
      from public.race_track_submissions s
      where s.storage_path = name
        and s.analysis_mode = 'collated'
        and public.is_group_race_staff(s.group_id)
    )
  );
