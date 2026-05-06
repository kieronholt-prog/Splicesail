-- RO: mark entries as started (results eligibility). RO/club_admin finishes table (RO-first; official mirrors RO until GPS reconcile).

alter table public.race_entries
  add column if not exists started_marked_at timestamptz;

comment on column public.race_entries.started_marked_at is 'When RO confirmed this boat started (candidate finisher gate).';

-- -----------------------------------------------------------------------------

create table public.race_finishes (
  id uuid primary key default gen_random_uuid(),
  race_entry_id uuid not null references public.race_entries (id) on delete cascade,
  ro_finish_at timestamptz not null,
  official_finish_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (race_entry_id)
);

comment on table public.race_finishes is 'Finish times: RO capture first; official_finish_at starts equal to RO (GPS reconcile later).';

create index race_finishes_race_entry_id_idx on public.race_finishes (race_entry_id);

create or replace function public.race_finishes_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger race_finishes_set_updated_at
  before update on public.race_finishes
  for each row
  execute function public.race_finishes_set_updated_at();

create or replace function public.race_finishes_default_official()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.official_finish_at is null then
    new.official_finish_at := new.ro_finish_at;
  end if;
  return new;
end;
$$;

create trigger race_finishes_default_official
  before insert or update on public.race_finishes
  for each row
  execute function public.race_finishes_default_official();

create or replace function public.enforce_finish_requires_started()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  stm timestamptz;
begin
  select e.started_marked_at into stm
  from public.race_entries e
  where e.id = new.race_entry_id;
  if stm is null then
    raise exception 'Cannot record finish until RO marks this entry as started';
  end if;
  return new;
end;
$$;

create trigger race_finishes_require_started
  before insert or update of race_entry_id, ro_finish_at on public.race_finishes
  for each row
  execute function public.enforce_finish_requires_started();

alter table public.race_finishes enable row level security;

create policy "race_finishes_select_group_member"
  on public.race_finishes for select to authenticated
  using (
    exists (
      select 1
      from public.race_entries e
      join public.races r on r.id = e.race_id
      join public.series s on s.id = r.series_id
      where e.id = race_finishes.race_entry_id
        and public.is_group_member(s.group_id)
    )
  );

create policy "race_finishes_insert_staff"
  on public.race_finishes for insert to authenticated
  with check (
    exists (
      select 1
      from public.race_entries e
      join public.races r on r.id = e.race_id
      join public.series s on s.id = r.series_id
      join public.group_memberships m
        on m.group_id = s.group_id and m.user_id = auth.uid()
      where e.id = race_finishes.race_entry_id
        and m.role in ('club_admin', 'race_officer')
    )
  );

create policy "race_finishes_update_staff"
  on public.race_finishes for update to authenticated
  using (
    exists (
      select 1
      from public.race_entries e
      join public.races r on r.id = e.race_id
      join public.series s on s.id = r.series_id
      join public.group_memberships m
        on m.group_id = s.group_id and m.user_id = auth.uid()
      where e.id = race_finishes.race_entry_id
        and m.role in ('club_admin', 'race_officer')
    )
  )
  with check (
    exists (
      select 1
      from public.race_entries e
      join public.races r on r.id = e.race_id
      join public.series s on s.id = r.series_id
      join public.group_memberships m
        on m.group_id = s.group_id and m.user_id = auth.uid()
      where e.id = race_finishes.race_entry_id
        and m.role in ('club_admin', 'race_officer')
    )
  );

create policy "race_finishes_delete_admin"
  on public.race_finishes for delete to authenticated
  using (
    exists (
      select 1
      from public.race_entries e
      join public.races r on r.id = e.race_id
      join public.series s on s.id = r.series_id
      where e.id = race_finishes.race_entry_id
        and public.is_group_admin(s.group_id)
    )
  );

grant select, insert, update, delete on table public.race_finishes to authenticated;
grant all on table public.race_finishes to service_role;
