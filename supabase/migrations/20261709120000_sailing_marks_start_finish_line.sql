-- Start/finish line support for club sailing marks.
--
-- A start/finish line is stored as a single mark row with TWO positions:
--   (lat, lon)   = committee-boat / line end A
--   (lat2, lon2) = pin / line end B
-- Regular marks (fixed/laid) leave lat2/lon2 null and use the single (lat, lon).

alter table public.group_sailing_marks
  add column if not exists lat2 double precision,
  add column if not exists lon2 double precision;

-- Allow the new 'start_finish' kind alongside the existing fixed/laid marks.
alter table public.group_sailing_marks
  drop constraint if exists group_sailing_marks_mark_kind_check;
alter table public.group_sailing_marks
  add constraint group_sailing_marks_mark_kind_check
    check (mark_kind in ('fixed', 'laid', 'start_finish'));

-- Bounds for the optional second end.
alter table public.group_sailing_marks
  drop constraint if exists group_sailing_marks_lat2_check;
alter table public.group_sailing_marks
  add constraint group_sailing_marks_lat2_check
    check (lat2 is null or (lat2 >= -90 and lat2 <= 90));

alter table public.group_sailing_marks
  drop constraint if exists group_sailing_marks_lon2_check;
alter table public.group_sailing_marks
  add constraint group_sailing_marks_lon2_check
    check (lon2 is null or (lon2 >= -180 and lon2 <= 180));

-- A start/finish line must carry its second end; other kinds must not.
alter table public.group_sailing_marks
  drop constraint if exists group_sailing_marks_start_finish_ends_check;
alter table public.group_sailing_marks
  add constraint group_sailing_marks_start_finish_ends_check
    check (
      mark_kind <> 'start_finish'
      or (lat2 is not null and lon2 is not null)
    );

comment on column public.group_sailing_marks.lat2 is 'Latitude of line end B for start_finish marks (null otherwise).';
comment on column public.group_sailing_marks.lon2 is 'Longitude of line end B for start_finish marks (null otherwise).';
