-- Seed Warsash Sailing Club (WSC) marks and courses into group_sailing_* tables.

create or replace function public.seed_wsc_sailing_area(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_group_admin(p_group_id) then
    raise exception 'Only club administrators can seed WSC sailing area';
  end if;

  if not exists (select 1 from public.groups g where g.id = p_group_id) then
    return false;
  end if;

  if exists (select 1 from public.group_sailing_marks m where m.group_id = p_group_id) then
    return false;
  end if;

  insert into public.group_sailing_marks (group_id, name, lat, lon, mark_kind, description, sort_order)
  values
    (p_group_id, 'START/FINISH', 50.85151, -1.30851, 'fixed', 'Committee line', 0),
    (p_group_id, 'BUOY 11', 50.84878, -1.30796, 'fixed', null, 1),
    (p_group_id, 'PILE 1', 50.83904, -1.3106, 'fixed', null, 2),
    (p_group_id, 'PILE 2', 50.83991, -1.3128, 'fixed', null, 3),
    (p_group_id, 'PILE 3', 50.84081, -1.31075, 'fixed', null, 4),
    (p_group_id, 'PILE 4', 50.84155, -1.31376, 'fixed', null, 5),
    (p_group_id, 'PILE 5', 50.84231, -1.31192, 'fixed', null, 6),
    (p_group_id, 'PILE 6', 50.84378, -1.31383, 'fixed', null, 7),
    (p_group_id, 'PILE 7', 50.84333, -1.31151, 'fixed', null, 8),
    (p_group_id, 'PILE 8', 50.84544, -1.31176, 'fixed', null, 9),
    (p_group_id, 'PILE 9', 50.84635, -1.30927, 'fixed', null, 10),
    (p_group_id, 'PILE 10', 50.84831, -1.30974, 'fixed', null, 11),
    (p_group_id, 'WARSASH SC', 50.8435, -1.3207, 'fixed', null, 12),
    (p_group_id, 'HAMBLE PT', 50.8358, -1.311, 'fixed', null, 13),
    (p_group_id, 'BALD HEAD', 50.83, -1.3012, 'fixed', null, 14),
    (p_group_id, 'WILLIAM', 50.8277, -1.2932, 'fixed', null, 15),
    (p_group_id, 'CORONATION', 50.8258, -1.2937, 'fixed', null, 16),
    (p_group_id, 'CHIEFTAIN TR', 50.8242, -1.2818, 'fixed', null, 17),
    (p_group_id, 'FUMESY', 50.8202, -1.291, 'fixed', null, 18),
    (p_group_id, 'LAID MK A', 50.83733, -1.31583, 'laid', 'Laid mark A', 19),
    (p_group_id, 'LAID MK B', 50.83494, -1.30201, 'laid', 'Laid mark B', 20),
    (p_group_id, 'LAID MK C', 50.84948, -1.31796, 'laid', 'Laid mark C', 21),
    (p_group_id, 'LAID MK D', 50.82394, -1.29986, 'laid', 'Laid mark D', 22);

  insert into public.group_sailing_courses (group_id, course_letter, display_name, course_type, mark_sequence, marks_preamble, sort_order)
  values
    (p_group_id, 'A', 'A — SC', 'SC', '[["BUOY 11","S"],["PILE 6","S"],["PILE 10","S"]]'::jsonb, '[]'::jsonb, 0),
    (p_group_id, 'B', 'B — SC', 'SC', '[["PILE 2","P"],["PILE 3","P"],["PILE 10","P"]]'::jsonb, '[]'::jsonb, 1),
    (p_group_id, 'C', 'C — SC', 'SC', '[["BUOY 11","S"],["PILE 1","S"],["PILE 2","S"]]'::jsonb, '[]'::jsonb, 2),
    (p_group_id, 'D', 'D — SC (HW)', 'SC', '[["PILE 2","S"],["WARSASH SC","S"],["PILE 10","S"]]'::jsonb, '[]'::jsonb, 3),
    (p_group_id, 'E', 'E — SC (HW)', 'SC', '[["PILE 10","P"],["WARSASH SC","P"],["PILE 2","P"]]'::jsonb, '[]'::jsonb, 4),
    (p_group_id, 'F', 'F — SC', 'SC', '[["PILE 2","S"],["LAID MK A","P"],["HAMBLE PT","P"],["PILE 5","P"]]'::jsonb, '[]'::jsonb, 5),
    (p_group_id, 'G', 'G — SC', 'SC', '[["PILE 5","S"],["HAMBLE PT","S"],["LAID MK A","S"],["PILE 2","P"]]'::jsonb, '[]'::jsonb, 6),
    (p_group_id, 'H', 'H — SC (HW)', 'SC', '[["PILE 10","P"],["WARSASH SC","P"],["HAMBLE PT","P"]]'::jsonb, '[]'::jsonb, 7),
    (p_group_id, 'I', 'I — SC (HW)', 'SC', '[["HAMBLE PT","S"],["WARSASH SC","S"],["PILE 10","S"]]'::jsonb, '[]'::jsonb, 8),
    (p_group_id, 'J', 'J — SC', 'SC', '[["PILE 3","S"],["BALD HEAD","S"],["HAMBLE PT","S"]]'::jsonb, '[]'::jsonb, 9),
    (p_group_id, 'K', 'K — SC', 'SC', '[["HAMBLE PT","P"],["BALD HEAD","P"],["PILE 3","P"]]'::jsonb, '[]'::jsonb, 10),
    (p_group_id, 'M', 'M — SC (avoid LW)', 'SC', '[["LAID MK B","S"],["HAMBLE PT","S"],["LAID MK B","S"],["HAMBLE PT","S"],["PILE 2","S"]]'::jsonb, '[["PILE 3","P"]]'::jsonb, 11),
    (p_group_id, 'N', 'N — SC', 'SC', '[["PILE 5","S"],["HAMBLE PT","S"],["WARSASH SC","S"],["PILE 2","P"]]'::jsonb, '[]'::jsonb, 12),
    (p_group_id, 'P', 'P — SC', 'SC', '[["PILE 2","S"],["WARSASH SC","P"],["HAMBLE PT","P"],["PILE 5","P"]]'::jsonb, '[]'::jsonb, 13),
    (p_group_id, 'Q', 'Q — SC (HW)', 'SC', '[["LAID MK C","P"],["WARSASH SC","P"],["PILE 2","P"]]'::jsonb, '[["PILE 2","S"]]'::jsonb, 14),
    (p_group_id, 'R', 'R — MC (HW)', 'MC', '[["PILE 2","S"],["WARSASH SC","S"],["PILE 10","S"]]'::jsonb, '[]'::jsonb, 15),
    (p_group_id, 'S', 'S — MC', 'MC', '[["WILLIAM","S"],["LAID MK D","S"],["HAMBLE PT","S"]]'::jsonb, '[["HAMBLE PT","P"]]'::jsonb, 16),
    (p_group_id, 'T', 'T — MC', 'MC', '[["BALD HEAD","P"],["CORONATION","P"],["WILLIAM","P"]]'::jsonb, '[["HAMBLE PT","P"]]'::jsonb, 17),
    (p_group_id, 'U', 'U — MC', 'MC', '[["WILLIAM","S"],["CORONATION","S"],["HAMBLE PT","S"]]'::jsonb, '[["HAMBLE PT","P"]]'::jsonb, 18),
    (p_group_id, 'V', 'V — LC', 'LC', '[["CHIEFTAIN TR","S"],["FUMESY","S"]]'::jsonb, '[["HAMBLE PT","P"]]'::jsonb, 19),
    (p_group_id, 'W', 'W — LC', 'LC', '[["WILLIAM","S"],["CHIEFTAIN TR","S"],["FUMESY","S"]]'::jsonb, '[["HAMBLE PT","P"]]'::jsonb, 20),
    (p_group_id, 'X', 'X — LC', 'LC', '[["FUMESY","P"],["CHIEFTAIN TR","P"],["WILLIAM","P"]]'::jsonb, '[["HAMBLE PT","P"]]'::jsonb, 21),
    (p_group_id, 'Y', 'Y — LC', 'LC', '[["WILLIAM","S"],["CORONATION","P"],["CHIEFTAIN TR","S"],["FUMESY","S"],["BALD HEAD","S"]]'::jsonb, '[["HAMBLE PT","P"]]'::jsonb, 22),
    (p_group_id, 'CUSTOM', 'Custom — build your course', 'custom', '[]'::jsonb, '[]'::jsonb, 23);

  return true;
end;
$$;

comment on function public.seed_wsc_sailing_area(uuid) is
  'Idempotent: inserts WSC 2026/27 marks and courses (A–Y + CUSTOM) for a club if none exist yet.';

revoke all on function public.seed_wsc_sailing_area(uuid) from public;
grant execute on function public.seed_wsc_sailing_area(uuid) to authenticated;
grant execute on function public.seed_wsc_sailing_area(uuid) to service_role;

-- Auto-seed any existing Warsash club row(s).
do $$
declare
  gid uuid;
  seeded int := 0;
begin
  for gid in
    select g.id
    from public.groups g
    where lower(coalesce(g.slug, '')) in ('warsash', 'wsc', 'warsash-sc')
       or g.name ilike '%warsash%'
  loop
    if public.seed_wsc_sailing_area(gid) then
      seeded := seeded + 1;
    end if;
  end loop;
  raise notice 'WSC sailing area seed: % club(s) seeded', seeded;
end;
$$;
