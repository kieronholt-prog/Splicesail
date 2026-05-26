-- Replace letter/number "scheme" with an optional single class flag character (letter or digit).

alter table public.group_fleets drop constraint if exists group_fleets_class_flag_scheme_check;

alter table public.group_fleets drop column if exists class_flag_scheme;

alter table public.group_fleets add column if not exists class_flag text;

alter table public.group_fleets drop constraint if exists group_fleets_class_flag_check;

alter table public.group_fleets
  add constraint group_fleets_class_flag_check
    check (
      class_flag is null
      or (
        length(btrim(class_flag)) = 1
        and btrim(class_flag) ~ '^[A-Za-z0-9]$'
      )
    );

comment on column public.group_fleets.class_flag is 'Single letter or digit class flag identifier for this fleet (optional).';
