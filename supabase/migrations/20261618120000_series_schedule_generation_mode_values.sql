-- Rename schedule_generation_mode values: single_race → single_day, series → date_range
-- Drop the old check first so UPDATEs are not validated against the previous allowed set.

alter table public.series
  drop constraint if exists series_schedule_generation_mode_check;

update public.series
set schedule_generation_mode = 'single_day'
where schedule_generation_mode = 'single_race';

update public.series
set schedule_generation_mode = 'date_range'
where schedule_generation_mode = 'series';

alter table public.series
  add constraint series_schedule_generation_mode_check
  check (schedule_generation_mode is null or schedule_generation_mode in ('single_day', 'date_range'));

comment on column public.series.schedule_generation_mode is
  'single_day: one race on starts_on at first start time; date_range: repeating schedule from starts_on through ends_on.';
