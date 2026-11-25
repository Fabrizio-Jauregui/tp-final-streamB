CREATE TYPE condition_stage AS ENUM ('pickup', 'return');
CREATE TYPE condition_value AS ENUM ('correct', 'damaged', 'missing');

CREATE TABLE maintenance_blocks (
  id UUID PRIMARY KEY,
  asset_unit_id UUID NOT NULL REFERENCES asset_units (id) ON DELETE RESTRICT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  admin_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL,
  cancelled_at TIMESTAMPTZ,
  CONSTRAINT maintenance_blocks_valid_period CHECK (ends_at > starts_at)
);

CREATE INDEX maintenance_blocks_active_period_gist
  ON maintenance_blocks USING gist (
    asset_unit_id,
    tstzrange(starts_at, ends_at, '[)')
  )
  WHERE cancelled_at IS NULL;

CREATE TABLE condition_events (
  id UUID PRIMARY KEY,
  operation_id UUID NOT NULL,
  reservation_id UUID NOT NULL REFERENCES reservations (id) ON DELETE RESTRICT,
  asset_unit_id UUID NOT NULL REFERENCES asset_units (id) ON DELETE RESTRICT,
  stage condition_stage NOT NULL,
  condition condition_value NOT NULL,
  note TEXT,
  admin_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  recorded_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE allocation_change_events (
  id UUID PRIMARY KEY,
  reservation_id UUID NOT NULL REFERENCES reservations (id) ON DELETE RESTRICT,
  old_allocation_id UUID NOT NULL REFERENCES reservation_allocations (id) ON DELETE RESTRICT,
  new_allocation_id UUID NOT NULL REFERENCES reservation_allocations (id) ON DELETE RESTRICT,
  admin_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE in_app_notices (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  reservation_id UUID REFERENCES reservations (id) ON DELETE RESTRICT,
  kind VARCHAR(40) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  read_at TIMESTAMPTZ
);
