-- Club wall clock for member-facing times and schedule entry (DST via IANA).

alter table public.groups
  add column if not exists iana_timezone text not null default 'UTC';

comment on column public.groups.iana_timezone is
  'IANA time zone id (e.g. Europe/London) for displaying times and interpreting schedule datetime-local inputs; UTC stored in timestamptz.';
