-- Boat label is optional in the app; sail number is the required hull identity field.
-- Drop the non-empty trim check so label may be blank (still not null; default '').

do $$
declare
  cname text;
begin
  for cname in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.boats'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%trim(label)%'
  loop
    execute format('alter table public.boats drop constraint %I', cname);
  end loop;
end $$;

alter table public.boats alter column label set default '';

comment on column public.boats.label is
  'Optional friendly name; may be blank when sail number and class identify the hull.';
