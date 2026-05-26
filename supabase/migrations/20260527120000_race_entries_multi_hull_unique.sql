-- Allow one race entry row per sailor per hull (same race), so tally afloat can be recorded independently per boat_id.

alter table public.race_entries drop constraint if exists race_entries_race_id_user_id_key;

create unique index if not exists race_entries_race_user_boat_uidx
  on public.race_entries (race_id, user_id, boat_id)
  where boat_id is not null;

create unique index if not exists race_entries_race_user_null_boat_uidx
  on public.race_entries (race_id, user_id)
  where boat_id is null;
