-- Add start_line and finish_line mark kinds alongside the existing start_finish.
-- Both require lat2/lon2 (they are also two-ended line marks).

alter table public.group_sailing_marks
  drop constraint if exists group_sailing_marks_mark_kind_check;
alter table public.group_sailing_marks
  add constraint group_sailing_marks_mark_kind_check
    check (mark_kind in ('fixed', 'laid', 'start_finish', 'start_line', 'finish_line'));

alter table public.group_sailing_marks
  drop constraint if exists group_sailing_marks_start_finish_ends_check;
alter table public.group_sailing_marks
  add constraint group_sailing_marks_start_finish_ends_check
    check (
      mark_kind not in ('start_finish', 'start_line', 'finish_line')
      or (lat2 is not null and lon2 is not null)
    );
