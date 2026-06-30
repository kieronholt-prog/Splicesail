-- 20260517140000_boats_label_optional.sql was marked applied but its dynamic drop
-- used pg_get_constraintdef LIKE '%trim(label)%', which does not match PostgreSQL's
-- normalized form TRIM(BOTH FROM label). Drop the constraint by name.

alter table public.boats drop constraint if exists boats_label_check;

alter table public.boats alter column label set default '';

comment on column public.boats.label is
  'Optional friendly name; may be blank when sail number and class identify the hull.';
