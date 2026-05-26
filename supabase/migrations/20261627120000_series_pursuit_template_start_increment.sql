-- Pursuit class start grid (30 s / 1 min / 2 min) on series generator template.

alter table public.series
  add column if not exists pursuit_template_start_increment_seconds integer;

alter table public.series
  add constraint series_pursuit_template_start_increment_seconds_check
  check (
    pursuit_template_start_increment_seconds is null
    or pursuit_template_start_increment_seconds in (30, 60, 120)
  );

comment on column public.series.pursuit_template_start_increment_seconds is
  'Pursuit class start grid (seconds). Copied to new pursuit races from the generator.';
