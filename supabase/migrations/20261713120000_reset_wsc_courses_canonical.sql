-- Hard-reset all WSC courses to match the Course Selector app (index.html) canonical data.
-- Scoped to clubs that have a mark named 'START/FINISH' (i.e. WSC clubs only).
-- START/FINISH is placed at position 0 of mark_sequence; preamble marks are in marks_preamble.
-- Course S: corrected — removes the spurious trailing HAMBLE PT(S) from the Splice seed.

WITH wsc AS (
  SELECT DISTINCT group_id FROM group_sailing_marks WHERE name = 'START/FINISH'
)

-- ── Short courses ─────────────────────────────────────────────────────────────

, a AS (UPDATE group_sailing_courses SET
  marks_preamble = '[]'::jsonb,
  mark_sequence  = '[["START/FINISH","S"],["BUOY 11","S"],["PILE 6","S"],["PILE 10","S"]]'::jsonb
  WHERE course_letter='A' AND group_id IN (SELECT group_id FROM wsc) RETURNING 1)

, b AS (UPDATE group_sailing_courses SET
  marks_preamble = '[]'::jsonb,
  mark_sequence  = '[["START/FINISH","S"],["PILE 2","P"],["PILE 3","P"],["PILE 10","P"]]'::jsonb
  WHERE course_letter='B' AND group_id IN (SELECT group_id FROM wsc) RETURNING 1)

, c AS (UPDATE group_sailing_courses SET
  marks_preamble = '[]'::jsonb,
  mark_sequence  = '[["START/FINISH","S"],["BUOY 11","S"],["PILE 1","S"],["PILE 2","S"]]'::jsonb
  WHERE course_letter='C' AND group_id IN (SELECT group_id FROM wsc) RETURNING 1)

, d AS (UPDATE group_sailing_courses SET
  marks_preamble = '[]'::jsonb,
  mark_sequence  = '[["START/FINISH","S"],["PILE 2","S"],["WARSASH SC","S"],["PILE 10","S"]]'::jsonb
  WHERE course_letter='D' AND group_id IN (SELECT group_id FROM wsc) RETURNING 1)

, e AS (UPDATE group_sailing_courses SET
  marks_preamble = '[]'::jsonb,
  mark_sequence  = '[["START/FINISH","S"],["PILE 10","P"],["WARSASH SC","P"],["PILE 2","P"]]'::jsonb
  WHERE course_letter='E' AND group_id IN (SELECT group_id FROM wsc) RETURNING 1)

, f AS (UPDATE group_sailing_courses SET
  marks_preamble = '[]'::jsonb,
  mark_sequence  = '[["START/FINISH","S"],["PILE 2","S"],["LAID MK A","P"],["HAMBLE PT","P"],["PILE 5","P"]]'::jsonb
  WHERE course_letter='F' AND group_id IN (SELECT group_id FROM wsc) RETURNING 1)

, g AS (UPDATE group_sailing_courses SET
  marks_preamble = '[]'::jsonb,
  mark_sequence  = '[["START/FINISH","S"],["PILE 5","S"],["HAMBLE PT","S"],["LAID MK A","S"],["PILE 2","P"]]'::jsonb
  WHERE course_letter='G' AND group_id IN (SELECT group_id FROM wsc) RETURNING 1)

, h AS (UPDATE group_sailing_courses SET
  marks_preamble = '[]'::jsonb,
  mark_sequence  = '[["START/FINISH","S"],["PILE 10","P"],["WARSASH SC","P"],["HAMBLE PT","P"]]'::jsonb
  WHERE course_letter='H' AND group_id IN (SELECT group_id FROM wsc) RETURNING 1)

, i AS (UPDATE group_sailing_courses SET
  marks_preamble = '[]'::jsonb,
  mark_sequence  = '[["START/FINISH","S"],["HAMBLE PT","S"],["WARSASH SC","S"],["PILE 10","S"]]'::jsonb
  WHERE course_letter='I' AND group_id IN (SELECT group_id FROM wsc) RETURNING 1)

, j AS (UPDATE group_sailing_courses SET
  marks_preamble = '[]'::jsonb,
  mark_sequence  = '[["START/FINISH","S"],["PILE 3","S"],["BALD HEAD","S"],["HAMBLE PT","S"]]'::jsonb
  WHERE course_letter='J' AND group_id IN (SELECT group_id FROM wsc) RETURNING 1)

, k AS (UPDATE group_sailing_courses SET
  marks_preamble = '[]'::jsonb,
  mark_sequence  = '[["START/FINISH","S"],["HAMBLE PT","P"],["BALD HEAD","P"],["PILE 3","P"]]'::jsonb
  WHERE course_letter='K' AND group_id IN (SELECT group_id FROM wsc) RETURNING 1)

, m AS (UPDATE group_sailing_courses SET
  marks_preamble = '[["PILE 3","P"]]'::jsonb,
  mark_sequence  = '[["START/FINISH","S"],["LAID MK B","S"],["HAMBLE PT","S"],["LAID MK B","S"],["HAMBLE PT","S"],["PILE 2","S"]]'::jsonb
  WHERE course_letter='M' AND group_id IN (SELECT group_id FROM wsc) RETURNING 1)

, n AS (UPDATE group_sailing_courses SET
  marks_preamble = '[]'::jsonb,
  mark_sequence  = '[["START/FINISH","S"],["PILE 5","S"],["HAMBLE PT","S"],["WARSASH SC","S"],["PILE 2","P"]]'::jsonb
  WHERE course_letter='N' AND group_id IN (SELECT group_id FROM wsc) RETURNING 1)

, p AS (UPDATE group_sailing_courses SET
  marks_preamble = '[]'::jsonb,
  mark_sequence  = '[["START/FINISH","S"],["PILE 2","S"],["WARSASH SC","P"],["HAMBLE PT","P"],["PILE 5","P"]]'::jsonb
  WHERE course_letter='P' AND group_id IN (SELECT group_id FROM wsc) RETURNING 1)

, q AS (UPDATE group_sailing_courses SET
  marks_preamble = '[["PILE 2","S"]]'::jsonb,
  mark_sequence  = '[["START/FINISH","S"],["LAID MK C","P"],["WARSASH SC","P"],["PILE 2","P"]]'::jsonb
  WHERE course_letter='Q' AND group_id IN (SELECT group_id FROM wsc) RETURNING 1)

-- ── Medium courses ─────────────────────────────────────────────────────────────

, r AS (UPDATE group_sailing_courses SET
  marks_preamble = '[]'::jsonb,
  mark_sequence  = '[["START/FINISH","S"],["PILE 2","S"],["WARSASH SC","S"],["PILE 10","S"]]'::jsonb
  WHERE course_letter='R' AND group_id IN (SELECT group_id FROM wsc) RETURNING 1)

  -- Course S: fixed — Course Selector has lap=[WILLIAM,LAID MK D] only (no trailing HAMBLE PT)
, s AS (UPDATE group_sailing_courses SET
  marks_preamble = '[["HAMBLE PT","P"]]'::jsonb,
  mark_sequence  = '[["START/FINISH","S"],["WILLIAM","S"],["LAID MK D","S"]]'::jsonb
  WHERE course_letter='S' AND group_id IN (SELECT group_id FROM wsc) RETURNING 1)

, t AS (UPDATE group_sailing_courses SET
  marks_preamble = '[["HAMBLE PT","P"]]'::jsonb,
  mark_sequence  = '[["START/FINISH","S"],["BALD HEAD","P"],["CORONATION","P"],["WILLIAM","P"]]'::jsonb
  WHERE course_letter='T' AND group_id IN (SELECT group_id FROM wsc) RETURNING 1)

, u AS (UPDATE group_sailing_courses SET
  marks_preamble = '[["HAMBLE PT","P"]]'::jsonb,
  mark_sequence  = '[["START/FINISH","S"],["WILLIAM","S"],["CORONATION","S"],["HAMBLE PT","S"]]'::jsonb
  WHERE course_letter='U' AND group_id IN (SELECT group_id FROM wsc) RETURNING 1)

-- ── Long courses ───────────────────────────────────────────────────────────────

, v AS (UPDATE group_sailing_courses SET
  marks_preamble = '[["HAMBLE PT","P"]]'::jsonb,
  mark_sequence  = '[["START/FINISH","S"],["CHIEFTAIN TR","S"],["FUMESY","S"]]'::jsonb
  WHERE course_letter='V' AND group_id IN (SELECT group_id FROM wsc) RETURNING 1)

, w AS (UPDATE group_sailing_courses SET
  marks_preamble = '[["HAMBLE PT","P"]]'::jsonb,
  mark_sequence  = '[["START/FINISH","S"],["WILLIAM","S"],["CHIEFTAIN TR","S"],["FUMESY","S"]]'::jsonb
  WHERE course_letter='W' AND group_id IN (SELECT group_id FROM wsc) RETURNING 1)

, x AS (UPDATE group_sailing_courses SET
  marks_preamble = '[["HAMBLE PT","P"]]'::jsonb,
  mark_sequence  = '[["START/FINISH","S"],["FUMESY","P"],["CHIEFTAIN TR","P"],["WILLIAM","P"]]'::jsonb
  WHERE course_letter='X' AND group_id IN (SELECT group_id FROM wsc) RETURNING 1)

, y AS (UPDATE group_sailing_courses SET
  marks_preamble = '[["HAMBLE PT","P"]]'::jsonb,
  mark_sequence  = '[["START/FINISH","S"],["WILLIAM","S"],["CORONATION","P"],["CHIEFTAIN TR","S"],["FUMESY","S"],["BALD HEAD","S"]]'::jsonb
  WHERE course_letter='Y' AND group_id IN (SELECT group_id FROM wsc) RETURNING 1)

SELECT 'done' AS result;
