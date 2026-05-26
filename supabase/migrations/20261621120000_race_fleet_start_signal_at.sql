-- Per-fleet actual start signal (RO may amend on race day). Series schedule anchor stays on races.scheduled_at
-- (first fleet / offset 0). Elapsed time uses fleet start_signal_at when set, else scheduled_at + start_offset_minutes.

alter table public.race_fleets
  add column if not exists start_signal_at timestamptz;

comment on column public.race_fleets.start_signal_at is
  'Fleet start signal (UTC). Set by race officer from the start-signals panel; used for elapsed time. When null, derived from races.scheduled_at + start_offset_minutes.';

comment on column public.race_entries.started_marked_at is
  'When RO marked this entry seen in the start area (not the fleet start signal time).';
