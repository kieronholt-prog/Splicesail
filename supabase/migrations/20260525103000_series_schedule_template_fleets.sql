-- Persist "Applicable fleets" choices for schedule template (used by Save + Generate races).

alter table public.series
  add column if not exists schedule_template_fleets jsonb;

comment on column public.series.schedule_template_fleets is
  'Applicable group_fleets + start offsets saved with schedule template (array of {group_fleet_id, start_offset_minutes}). Null if unset.';
