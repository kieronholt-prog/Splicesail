-- Club-level fleet definitions (organisation templates; distinct from per-race race_fleets and sailor boats).

create table public.group_fleets (
  id uuid primary key default gen_random_uuid (),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

comment on table public.group_fleets is 'Named fleet groupings for a club (maintenance UI); optional link from race setup later.';

create index group_fleets_group_id_idx on public.group_fleets (group_id);

create or replace function public.group_fleets_set_updated_at()
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

create trigger group_fleets_set_updated_at
  before update on public.group_fleets
  for each row
  execute function public.group_fleets_set_updated_at();

alter table public.group_fleets enable row level security;

create policy "group_fleets_select_member"
  on public.group_fleets
  for select
  to authenticated
  using (public.is_group_member(group_id));

create policy "group_fleets_insert_admin"
  on public.group_fleets
  for insert
  to authenticated
  with check (public.is_group_admin(group_id));

create policy "group_fleets_update_admin"
  on public.group_fleets
  for update
  to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

create policy "group_fleets_delete_admin"
  on public.group_fleets
  for delete
  to authenticated
  using (public.is_group_admin(group_id));

grant select, insert, update, delete on table public.group_fleets to authenticated;
grant all on table public.group_fleets to service_role;
