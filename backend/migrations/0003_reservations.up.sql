CREATE TYPE reservation_status AS ENUM (
  'confirmed',
  'delivered',
  'returned',
  'cancelled',
  'expired'
);

CREATE TABLE reservations (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status reservation_status NOT NULL,
  total_ars NUMERIC(12, 2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'ARS',
  created_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES users (id) ON DELETE RESTRICT,
  cancel_reason TEXT,
  CONSTRAINT reservations_valid_period CHECK (ends_at > starts_at),
  CONSTRAINT reservations_nonnegative_total CHECK (total_ars >= 0),
  CONSTRAINT reservations_return_requires_delivery
    CHECK (returned_at IS NULL OR delivered_at IS NOT NULL)
);

CREATE TABLE reservation_lines (
  id UUID PRIMARY KEY,
  reservation_id UUID NOT NULL REFERENCES reservations (id) ON DELETE RESTRICT,
  equipment_type_id UUID NOT NULL REFERENCES equipment_types (id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL,
  hourly_rate_snapshot NUMERIC(12, 2) NOT NULL,
  CONSTRAINT reservation_lines_positive_quantity CHECK (quantity > 0)
);

CREATE TABLE reservation_allocations (
  id UUID PRIMARY KEY,
  reservation_line_id UUID NOT NULL REFERENCES reservation_lines (id) ON DELETE RESTRICT,
  asset_unit_id UUID NOT NULL REFERENCES asset_units (id) ON DELETE RESTRICT,
  occupied_period TSTZRANGE NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL,
  released_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  custody_ended_at TIMESTAMPTZ,
  CONSTRAINT reservation_allocations_valid_period
    CHECK (
      NOT isempty(occupied_period)
      AND lower_inc(occupied_period)
      AND NOT upper_inc(occupied_period)
    )
);

CREATE UNIQUE INDEX reservation_allocations_active_line_unit_unique
  ON reservation_allocations (reservation_line_id, asset_unit_id)
  WHERE released_at IS NULL;

CREATE UNIQUE INDEX reservation_allocations_open_custody_unit_unique
  ON reservation_allocations (asset_unit_id)
  WHERE picked_up_at IS NOT NULL AND custody_ended_at IS NULL;
