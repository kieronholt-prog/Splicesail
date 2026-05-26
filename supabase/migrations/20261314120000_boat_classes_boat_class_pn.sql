-- Baseline Portsmouth numbers live in boat_class_pn; hull metadata (formerly rya_class_py) is boat_classes.

create table public.boat_class_pn (
  class_key text primary key references public.rya_class_py (class_key) on delete cascade,
  py integer not null constraint boat_class_pn_py_check check (py >= 400 and py <= 2500)
);

comment on table public.boat_class_pn is
  'Baseline Portsmouth Yardstick handicap per hull class_key; effective PN = series_class_py then group_class_py then boat_class_pn then boat.py_rating.';

insert into public.boat_class_pn (class_key, py)
select class_key, py
from public.rya_class_py
where py is not null;

alter table public.rya_class_py drop column py;

alter table public.rya_class_py rename to boat_classes;

alter table public.boat_classes rename constraint rya_class_py_pkey to boat_classes_pkey;

alter index if exists rya_class_py_created_for_group_idx rename to boat_classes_created_for_group_idx;

comment on table public.boat_classes is
  'Hull class catalogue (RYA seeds + optional club-local rows); PY is stored in boat_class_pn.';

comment on column public.boats.rya_class_key is 'FK to boat_classes.class_key; hull picked from catalogue.';

comment on table public.series_class_py is
  'Series PN override; chain = series_class_py → group_class_py → boat_class_pn → boat py_rating.';

alter table public.boat_class_pn enable row level security;

create policy "boat_class_pn_select_authenticated"
  on public.boat_class_pn for select
  to authenticated
  using (true);

create policy "boat_class_pn_update_club_own"
  on public.boat_class_pn for update
  to authenticated
  using (
    exists (
      select 1
      from public.boat_classes bc
      where bc.class_key = boat_class_pn.class_key
        and bc.created_for_group_id is not null
        and exists (
          select 1
          from public.group_memberships gm
          where gm.group_id = bc.created_for_group_id
            and gm.user_id = auth.uid()
            and gm.role = 'club_admin'
        )
    )
  )
  with check (
    exists (
      select 1
      from public.boat_classes bc
      where bc.class_key = class_key
        and bc.created_for_group_id is not null
        and exists (
          select 1
          from public.group_memberships gm
          where gm.group_id = bc.created_for_group_id
            and gm.user_id = auth.uid()
            and gm.role = 'club_admin'
        )
    )
  );

create policy "boat_class_pn_delete_club_own"
  on public.boat_class_pn for delete
  to authenticated
  using (
    exists (
      select 1
      from public.boat_classes bc
      where bc.class_key = boat_class_pn.class_key
        and bc.created_for_group_id is not null
        and exists (
          select 1
          from public.group_memberships gm
          where gm.group_id = bc.created_for_group_id
            and gm.user_id = auth.uid()
            and gm.role = 'club_admin'
        )
    )
  );

grant select on table public.boat_class_pn to authenticated;
grant update, delete on table public.boat_class_pn to authenticated;
grant all on table public.boat_class_pn to service_role;

create or replace function public.ensure_boat_class_pn_after_club_hull_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.created_for_group_id is null then
    return NEW;
  end if;
  insert into public.boat_class_pn (class_key, py)
  values (NEW.class_key, 1200)
  on conflict (class_key) do nothing;
  return NEW;
end;
$$;

create trigger boat_classes_insert_ensure_pn
  after insert on public.boat_classes
  for each row
  when (NEW.created_for_group_id is not null)
  execute procedure public.ensure_boat_class_pn_after_club_hull_insert();