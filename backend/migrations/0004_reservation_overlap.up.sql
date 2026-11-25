CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE reservation_allocations
  ADD CONSTRAINT reservation_allocations_no_active_overlap
  EXCLUDE USING gist (
    asset_unit_id WITH =,
    occupied_period WITH &&
  )
  WHERE (released_at IS NULL);
