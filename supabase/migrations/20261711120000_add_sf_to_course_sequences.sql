-- Prepend each club's Start/Finish mark to the mark_sequence of all existing courses.
-- Uses the lowest sort_order start_finish mark for the group.
-- Skips courses whose mark_sequence already begins with a start_finish mark.

WITH club_sf AS (
  SELECT DISTINCT ON (group_id)
    group_id,
    name
  FROM group_sailing_marks
  WHERE mark_kind = 'start_finish'
  ORDER BY group_id, sort_order
)
UPDATE group_sailing_courses gc
SET mark_sequence =
  jsonb_build_array(jsonb_build_array(sf.name, 'S'::text))
  || COALESCE(gc.mark_sequence, '[]'::jsonb)
FROM club_sf sf
WHERE gc.group_id = sf.group_id
  -- Skip if mark_sequence already starts with a start_finish mark for this club
  AND NOT (
    COALESCE(jsonb_array_length(gc.mark_sequence), 0) > 0
    AND EXISTS (
      SELECT 1
      FROM group_sailing_marks gsm
      WHERE gsm.group_id = gc.group_id
        AND gsm.mark_kind = 'start_finish'
        AND (gc.mark_sequence -> 0 -> 0) = to_jsonb(gsm.name)
    )
  );
