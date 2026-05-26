-- DNC (Did not compete): entered but not marked started in the start area.

alter table public.race_entries drop constraint if exists race_entries_outcome_check;

alter table public.race_entries add constraint race_entries_outcome_check check (
  outcome is null
  or outcome in ('finished', 'retired', 'dnf', 'dns', 'dnc', 'dsq', 'ocs')
);

alter table public.series_penalty_rules drop constraint if exists series_penalty_rules_outcome_code_check;

alter table public.series_penalty_rules
  add constraint series_penalty_rules_outcome_code_check
  check (outcome_code in ('dns', 'dnf', 'dnc', 'retired', 'dsq', 'ocs'));

insert into public.series_penalty_rules (series_id, outcome_code, basis, plus, fixed_points)
select s.id, 'dnc', 'series_entrants', 1, null
from public.series s
where not exists (
  select 1 from public.series_penalty_rules p
  where p.series_id = s.id and p.outcome_code = 'dnc'
);

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
    (new.id, 'dnc', 'series_entrants', 1, null),
    (new.id, 'retired', 'race_starters', 0, null),
    (new.id, 'dsq', 'race_starters', 0, null),
    (new.id, 'ocs', 'race_starters', 0, null);

  insert into public.series_discard_rules (series_id, races_from, races_to, discards)
  values (new.id, 1, null, 0);

  return new;
end;
$$;
