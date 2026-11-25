CREATE TYPE asset_status AS ENUM ('available', 'maintenance', 'missing', 'retired');

CREATE TABLE equipment_types (
  id UUID PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  hourly_rate_ars NUMERIC(12, 2),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT equipment_types_hourly_rate_nonnegative
    CHECK (hourly_rate_ars IS NULL OR hourly_rate_ars >= 0)
);

CREATE TABLE asset_units (
  id UUID PRIMARY KEY,
  equipment_type_id UUID NOT NULL REFERENCES equipment_types (id) ON DELETE RESTRICT,
  code VARCHAR(80) NOT NULL UNIQUE,
  status asset_status NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
