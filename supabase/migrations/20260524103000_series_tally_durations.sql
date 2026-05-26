-- Wave B tally: optional per-series fleet-start-relative windows for afloat vs ashore/declaration UX.

alter table public.series
  add column if not exists tally_open_hours_before_fleet_start numeric(8, 3);

alter table public.series
  add column if not exists tally_close_hours_after_fleet_start numeric(8, 3);

alter table public.series
  drop constraint if exists series_tally_open_hours_non_negative;

alter table public.series
  drop constraint if exists series_tally_close_hours_non_negative;

alter table public.series
  add constraint series_tally_open_hours_non_negative
  check (
    tally_open_hours_before_fleet_start is null
    or tally_open_hours_before_fleet_start >= 0
  );

alter table public.series
  add constraint series_tally_close_hours_non_negative
  check (
    tally_close_hours_after_fleet_start is null
    or tally_close_hours_after_fleet_start >= 0
  );

comment on column public.series.tally_open_hours_before_fleet_start is
  'When set with close hours: tally opens this many hours before this race entry''s fleet start (signal time + fleet offset).';

comment on column public.series.tally_close_hours_after_fleet_start is
  'When set with open hours: tally closes this many hours after fleet start for ashore / declaration.';
