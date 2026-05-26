-- How automated race rows are produced from the template.

alter table public.series
  add column if not exists schedule_generation_mode text;

alter table public.series
  drop constraint if exists series_schedule_generation_mode_check;

alter table public.series
  add constraint series_schedule_generation_mode_check
  check (schedule_generation_mode is null or schedule_generation_mode in ('single_race', 'series'));

comment on column public.series.schedule_generation_mode is
  'single_race: one race on starts_on at first start time; series: repeating schedule from starts_on through ends_on.';
