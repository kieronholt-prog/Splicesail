-- Denormalized GPS cache on submissions so RO can read tracks via submissions RLS (no storage dependency).

alter table public.race_track_submissions
  add column if not exists track_points_cache jsonb;

comment on column public.race_track_submissions.track_points_cache is
  'GPS [{lat,lon,time},…] for RO fleet map; written when sailor caches track or staff backfills from storage.';

create or replace function public.set_track_submission_points_cache(
  p_submission_id uuid,
  p_points jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sub public.race_track_submissions%rowtype;
begin
  select * into sub from public.race_track_submissions where id = p_submission_id;
  if not found then
    raise exception 'submission not found';
  end if;

  if sub.user_id = auth.uid() then
    null;
  elsif sub.analysis_mode = 'collated' and public.is_group_race_staff(sub.group_id) then
    null;
  else
    raise exception 'not allowed';
  end if;

  update public.race_track_submissions
  set track_points_cache = p_points, updated_at = now()
  where id = p_submission_id;
end;
$$;

revoke all on function public.set_track_submission_points_cache(uuid, jsonb) from public;
grant execute on function public.set_track_submission_points_cache(uuid, jsonb) to authenticated;

-- Combined staff storage read: cached JSON path or original upload path.
drop policy if exists race_tracks_storage_staff_read_json on storage.objects;

drop policy if exists race_tracks_storage_staff_read on storage.objects;

create policy race_tracks_storage_staff_read_collated on storage.objects
  for select to authenticated
  using (
    bucket_id = 'race-tracks'
    and exists (
      select 1
      from public.race_track_submissions s
      where s.analysis_mode = 'collated'
        and public.is_group_race_staff(s.group_id)
        and (
          name = s.user_id::text || '/' || s.external_activity_id || '.json'
          or (s.storage_path is not null and name = s.storage_path)
        )
    )
  );
