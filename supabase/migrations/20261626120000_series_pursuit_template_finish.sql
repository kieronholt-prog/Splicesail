-- Pursuit generator template: finish time anchor (date part is template; race day used when creating races).

alter table public.series
  add column if not exists pursuit_template_finish_at timestamptz;

comment on column public.series.pursuit_template_finish_at is
  'Template instant for pursuit finish wall-clock on each race day (combined with race date when races are generated).';
