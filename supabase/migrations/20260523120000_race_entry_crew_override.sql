-- Optional helm/crew layout for one race without changing the hull's saved boat defaults.

alter table public.race_entries
  add column if not exists crew_template_override jsonb;

comment on column public.race_entries.crew_template_override is
  'Optional CrewTemplate JSON for this race only; NULL means use boats.crew_template.';
