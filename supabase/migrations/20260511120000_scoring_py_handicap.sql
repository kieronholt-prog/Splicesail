-- Portsmouth Yardstick handicap, Appendix A–style low-point race scoring inputs,
-- configurable penalty formulas, discard bands, race start signal & results-final flag.

-- -----------------------------------------------------------------------------
-- Boats & entries
-- -----------------------------------------------------------------------------

alter table public.boats
  add column if not exists py_rating integer
  check (py_rating is null or (py_rating >= 400 and py_rating <= 2500));

comment on column public.boats.py_rating is 'Portsmouth Yardstick (RYA PN). Lower is faster; NULL until set.';

alter table public.race_entries
  add column if not exists py_override integer
  check (py_override is null or (py_override >= 400 and py_override <= 2500));

comment on column public.race_entries.py_override is 'Optional PY override for this race only.';

alter table public.race_entries drop constraint if exists race_entries_outcome_check;

alter table public.race_entries add constraint race_entries_outcome_check check (
  outcome is null
  or outcome in ('finished', 'retired', 'dnf', 'dns', 'dsq', 'ocs')
);

-- -----------------------------------------------------------------------------
-- Races: clock zero + inclusion in series aggregates
-- -----------------------------------------------------------------------------

alter table public.races
  add column if not exists start_signal_at timestamptz;

comment on column public.races.start_signal_at is 'Race start signal time (elapsed = finish − start_signal).';

alter table public.races
  add column if not exists results_final boolean not null default false;

comment on column public.races.results_final is 'When true, race counts toward series standings / discard schedule.';

-- -----------------------------------------------------------------------------
-- Series scoring configuration
-- -----------------------------------------------------------------------------

create table public.series_scoring_config (
  series_id uuid primary key references public.series (id) on delete cascade,
  handicap_system text not null default 'portsmouth'
    check (handicap_system in ('none', 'portsmouth')),
  updated_at timestamptz not null default now()
);

comment on table public.series_scoring_config is 'Per-series handicap mode (Portsmouth v1).';

create table public.series_penalty_rules (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series (id) on delete cascade,
  outcome_code text not null
    check (outcome_code in ('dns', 'dnf', 'retired', 'dsq', 'ocs')),
  basis text not null
    check (basis in ('series_entrants', 'race_starters', 'race_finishers', 'fixed')),
  plus integer not null default 0,
  fixed_points numeric(12, 4),
  unique (series_id, outcome_code),
  constraint series_penalty_rules_fixed_ck check (
    (basis = 'fixed' and fixed_points is not null)
    or (basis <> 'fixed' and fixed_points is null)
  )
);

comment on table public.series_penalty_rules is 'Non-finisher points = basis_count + plus (or fixed_points when basis is fixed).';

create table public.series_discard_rules (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series (id) on delete cascade,
  races_from integer not null check (races_from >= 1),
  races_to integer check (races_to is null or races_to >= races_from),
  discards integer not null check (discards >= 0),
  unique (series_id, races_from)
);

comment on table public.series_discard_rules is 'Discard count by number of completed (results_final) races in the series.';

create index series_discard_rules_series_id_idx on public.series_discard_rules (series_id);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.series_scoring_config enable row level security;
alter table public.series_penalty_rules enable row level security;
alter table public.series_discard_rules enable row level security;

create policy "series_scoring_config_select_member"
  on public.series_scoring_config for select to authenticated
  using (
    exists (
      select 1 from public.series s
      where s.id = series_scoring_config.series_id
        and public.is_group_member(s.group_id)
    )
  );

create policy "series_scoring_config_insert_admin"
  on public.series_scoring_config for insert to authenticated
  with check (
    exists (
      select 1 from public.series s
      where s.id = series_scoring_config.series_id
        and public.is_group_admin(s.group_id)
    )
  );

create policy "series_scoring_config_update_admin"
  on public.series_scoring_config for update to authenticated
  using (
    exists (
      select 1 from public.series s
      where s.id = series_scoring_config.series_id
        and public.is_group_admin(s.group_id)
    )
  )
  with check (
    exists (
      select 1 from public.series s
      where s.id = series_scoring_config.series_id
        and public.is_group_admin(s.group_id)
    )
  );

create policy "series_scoring_config_delete_admin"
  on public.series_scoring_config for delete to authenticated
  using (
    exists (
      select 1 from public.series s
      where s.id = series_scoring_config.series_id
        and public.is_group_admin(s.group_id)
    )
  );

create policy "series_penalty_rules_select_member"
  on public.series_penalty_rules for select to authenticated
  using (
    exists (
      select 1 from public.series s
      where s.id = series_penalty_rules.series_id
        and public.is_group_member(s.group_id)
    )
  );

create policy "series_penalty_rules_insert_admin"
  on public.series_penalty_rules for insert to authenticated
  with check (
    exists (
      select 1 from public.series s
      where s.id = series_penalty_rules.series_id
        and public.is_group_admin(s.group_id)
    )
  );

create policy "series_penalty_rules_update_admin"
  on public.series_penalty_rules for update to authenticated
  using (
    exists (
      select 1 from public.series s
      where s.id = series_penalty_rules.series_id
        and public.is_group_admin(s.group_id)
    )
  )
  with check (
    exists (
      select 1 from public.series s
      where s.id = series_penalty_rules.series_id
        and public.is_group_admin(s.group_id)
    )
  );

create policy "series_penalty_rules_delete_admin"
  on public.series_penalty_rules for delete to authenticated
  using (
    exists (
      select 1 from public.series s
      where s.id = series_penalty_rules.series_id
        and public.is_group_admin(s.group_id)
    )
  );

create policy "series_discard_rules_select_member"
  on public.series_discard_rules for select to authenticated
  using (
    exists (
      select 1 from public.series s
      where s.id = series_discard_rules.series_id
        and public.is_group_member(s.group_id)
    )
  );

create policy "series_discard_rules_insert_admin"
  on public.series_discard_rules for insert to authenticated
  with check (
    exists (
      select 1 from public.series s
      where s.id = series_discard_rules.series_id
        and public.is_group_admin(s.group_id)
    )
  );

create policy "series_discard_rules_update_admin"
  on public.series_discard_rules for update to authenticated
  using (
    exists (
      select 1 from public.series s
      where s.id = series_discard_rules.series_id
        and public.is_group_admin(s.group_id)
    )
  )
  with check (
    exists (
      select 1 from public.series s
      where s.id = series_discard_rules.series_id
        and public.is_group_admin(s.group_id)
    )
  );

create policy "series_discard_rules_delete_admin"
  on public.series_discard_rules for delete to authenticated
  using (
    exists (
      select 1 from public.series s
      where s.id = series_discard_rules.series_id
        and public.is_group_admin(s.group_id)
    )
  );

grant select, insert, update, delete on table public.series_scoring_config to authenticated;
grant select, insert, update, delete on table public.series_penalty_rules to authenticated;
grant select, insert, update, delete on table public.series_discard_rules to authenticated;
grant all on table public.series_scoring_config to service_role;
grant all on table public.series_penalty_rules to service_role;
grant all on table public.series_discard_rules to service_role;

-- -----------------------------------------------------------------------------
-- Allow race_officer + club_admin to edit race schedule fields (start signal / final)
-- -----------------------------------------------------------------------------

drop policy if exists "races_update_group_admin" on public.races;

create policy "races_update_group_staff"
  on public.races for update to authenticated
  using (
    exists (
      select 1 from public.series s
      join public.group_memberships m
        on m.group_id = s.group_id and m.user_id = auth.uid()
      where s.id = races.series_id
        and m.role in ('club_admin', 'race_officer')
    )
  )
  with check (
    exists (
      select 1 from public.series s
      join public.group_memberships m
        on m.group_id = s.group_id and m.user_id = auth.uid()
      where s.id = races.series_id
        and m.role in ('club_admin', 'race_officer')
    )
  );

-- -----------------------------------------------------------------------------
-- Seed defaults for existing + future series
-- -----------------------------------------------------------------------------

create or replace function public.seed_series_scoring_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.series_scoring_config (series_id)
  values (new.id);

  insert into public.series_penalty_rules (series_id, outcome_code, basis, plus, fixed_points)
  values
    (new.id, 'dns', 'series_entrants', 1, null),
    (new.id, 'dnf', 'race_starters', 0, null),
    (new.id, 'retired', 'race_starters', 0, null),
    (new.id, 'dsq', 'race_starters', 0, null),
    (new.id, 'ocs', 'race_starters', 0, null);

  insert into public.series_discard_rules (series_id, races_from, races_to, discards)
  values (new.id, 1, null, 0);

  return new;
end;
$$;

drop trigger if exists series_seed_scoring_after_insert on public.series;

create trigger series_seed_scoring_after_insert
  after insert on public.series
  for each row
  execute function public.seed_series_scoring_defaults();

insert into public.series_scoring_config (series_id)
select s.id from public.series s
where not exists (
  select 1 from public.series_scoring_config c where c.series_id = s.id
);

insert into public.series_penalty_rules (series_id, outcome_code, basis, plus, fixed_points)
select s.id, v.outcome, v.basis, v.plus, v.fp
from public.series s
cross join (
  values
    ('dns'::text, 'series_entrants'::text, 1::integer, null::numeric),
    ('dnf', 'race_starters', 0, null),
    ('retired', 'race_starters', 0, null),
    ('dsq', 'race_starters', 0, null),
    ('ocs', 'race_starters', 0, null)
) as v(outcome, basis, plus, fp)
where not exists (
  select 1 from public.series_penalty_rules p
  where p.series_id = s.id and p.outcome_code = v.outcome
);

insert into public.series_discard_rules (series_id, races_from, races_to, discards)
select s.id, 1, null, 0
from public.series s
where not exists (
  select 1 from public.series_discard_rules d where d.series_id = s.id
);
