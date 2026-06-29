-- Per-course mark position overrides and virtual (course-local) marks.
-- Keys are mark names. Values hold lat/lon (and lat2/lon2 for line marks).
-- Virtual marks (not in group_sailing_marks) additionally carry mark_kind.
ALTER TABLE group_sailing_courses
  ADD COLUMN IF NOT EXISTS course_mark_overrides jsonb NOT NULL DEFAULT '{}';
