-- Wave A: public profiles (Wave A checklist — sharing toggles default ON).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  phone text,
  share_track_for_enhanced_analytics boolean not null default true,
  share_start_finish_times_for_results boolean not null default true,
  is_system_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'App user profile; id matches auth.users.';

create index profiles_display_name_idx on public.profiles (display_name);

-- Prevent privilege escalation via the anon/authenticated API surface.
create or replace function public.profiles_guard_admin_column()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.is_system_admin is distinct from old.is_system_admin
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'is_system_admin cannot be modified';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_admin_column
  before update on public.profiles
  for each row
  execute function public.profiles_guard_admin_column();

create or replace function public.profiles_set_updated_at()
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

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.profiles_set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (
    id = auth.uid()
    and is_system_admin = false
  );

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

grant select, insert, update on table public.profiles to authenticated;
grant select on table public.profiles to anon;

-- Lets anon callers query the table without seeing rows (e.g. health checks).
create policy "profiles_select_none_anon"
  on public.profiles
  for select
  to anon
  using (false);

grant all on table public.profiles to service_role;

-- New auth users get a profile row automatically.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
