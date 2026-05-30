ALTER TABLE group_sailing_courses
  ADD COLUMN IF NOT EXISTS cross_sf_each_lap BOOLEAN NOT NULL DEFAULT false;
