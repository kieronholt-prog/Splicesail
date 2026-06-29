-- Pursuit / multi-fleet starts can exceed 60 minutes after the primary signal.
-- RO start-signal sync recalculates offsets from signal times.

alter table public.race_fleets
  drop constraint if exists race_fleets_start_offset_minutes_check;

alter table public.race_fleets
  add constraint race_fleets_start_offset_minutes_check
  check (start_offset_minutes >= 0 and start_offset_minutes <= 240);

comment on column public.race_fleets.start_offset_minutes is
  'Minutes after races.scheduled_at (primary fleet signal). Max 240 for pursuit-style offsets.';
