-- Race staff can read cached Strava track JSON for collated fleet analysis (RO map + batch analyse).
create policy race_tracks_storage_staff_read_json on storage.objects
  for select to authenticated
  using (
    bucket_id = 'race-tracks'
    and exists (
      select 1
      from public.race_track_submissions s
      where s.analysis_mode = 'collated'
        and public.is_group_race_staff(s.group_id)
        and name = s.user_id::text || '/' || s.external_activity_id || '.json'
    )
  );
