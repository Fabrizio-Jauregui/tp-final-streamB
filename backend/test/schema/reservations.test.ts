import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { migrateUp } from '../../src/database/migrator.ts';
import { startTestPostgres, stopTestPostgres, type TestPostgres } from '../support/postgres.js';

const migrationDirectory = fileURLToPath(new URL('../../migrations/', import.meta.url));
const firstStart = '2030-01-01T10:00:00.000Z';
const firstEnd = '2030-01-01T11:00:00.000Z';
const nextEnd = '2030-01-01T12:00:00.000Z';
let postgres: TestPostgres;
let client: Client;

async function insertUser(): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO users
      (id, full_name, email, email_normalized, phone, password_hash, role, created_at)
     VALUES ($1, 'Reservation Tester', $2, $2, '555-0100', 'test-hash', 'client', now())`,
    [id, `${id}@example.test`],
  );
  return id;
}

async function insertEquipmentType(): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO equipment_types (id, name, description, hourly_rate_ars, created_at)
     VALUES ($1, $2, 'Test equipment', 100.00, now())`,
    [id, `Type ${id}`],
  );
  return id;
}

async function insertAssetUnit(equipmentTypeId: string): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO asset_units (id, equipment_type_id, code, status, created_at)
     VALUES ($1, $2, $3, 'available', now())`,
    [id, equipmentTypeId, `UNIT-${id}`],
  );
  return id;
}

async function insertReservation(
  clientId: string,
  startsAt = firstStart,
  endsAt = firstEnd,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO reservations
      (id, client_id, starts_at, ends_at, status, total_ars, created_at)
     VALUES ($1, $2, $3, $4, 'confirmed', 50.00, now())`,
    [id, clientId, startsAt, endsAt],
  );
  return id;
}

async function insertLine(reservationId: string, equipmentTypeId: string): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO reservation_lines
      (id, reservation_id, equipment_type_id, quantity, hourly_rate_snapshot)
     VALUES ($1, $2, $3, 1, 100.00)`,
    [id, reservationId, equipmentTypeId],
  );
  return id;
}

async function insertAllocation(
  lineId: string,
  unitId: string,
  startsAt = firstStart,
  endsAt = firstEnd,
  bounds = '[)',
  pickedUpAt: string | null = null,
): Promise<void> {
  await client.query(
    `INSERT INTO reservation_allocations
      (id, reservation_line_id, asset_unit_id, occupied_period, assigned_at, picked_up_at)
     VALUES ($1, $2, $3, tstzrange($4::timestamptz, $5::timestamptz, $6), now(), $7)`,
    [randomUUID(), lineId, unitId, startsAt, endsAt, bounds, pickedUpAt],
  );
}

describe('Reservation, ReservationLine, and ReservationAllocation schema', () => {
  beforeAll(async () => {
    postgres = await startTestPostgres();
    client = postgres.client;
    await migrateUp(client, migrationDirectory);
  }, 30_000);

  afterAll(async () => {
    if (postgres) await stopTestPostgres(postgres);
  }, 30_000);

  it('creates the planned columns, statuses, defaults, keys, and relations', async () => {
    const columns = await client.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      udt_name: string;
      is_nullable: string;
      column_default: string | null;
      character_maximum_length: number | null;
      numeric_precision: number | null;
      numeric_scale: number | null;
    }>(`
      SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default,
             character_maximum_length, numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('reservations', 'reservation_lines', 'reservation_allocations')
    `);

    expect(columns.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ table_name: 'reservations', column_name: 'id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'reservations', column_name: 'client_id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'reservations', column_name: 'starts_at', data_type: 'timestamp with time zone', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'reservations', column_name: 'ends_at', data_type: 'timestamp with time zone', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'reservations', column_name: 'status', udt_name: 'reservation_status', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'reservations', column_name: 'total_ars', data_type: 'numeric', numeric_precision: 12, numeric_scale: 2, is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'reservations', column_name: 'currency', data_type: 'character', character_maximum_length: 3, is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'reservations', column_name: 'currency', column_default: expect.stringContaining('ARS') }),
      expect.objectContaining({ table_name: 'reservations', column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'reservations', column_name: 'delivered_at', data_type: 'timestamp with time zone', is_nullable: 'YES' }),
      expect.objectContaining({ table_name: 'reservations', column_name: 'returned_at', data_type: 'timestamp with time zone', is_nullable: 'YES' }),
      expect.objectContaining({ table_name: 'reservations', column_name: 'cancelled_at', data_type: 'timestamp with time zone', is_nullable: 'YES' }),
      expect.objectContaining({ table_name: 'reservations', column_name: 'cancelled_by', data_type: 'uuid', is_nullable: 'YES' }),
      expect.objectContaining({ table_name: 'reservations', column_name: 'cancel_reason', data_type: 'text', is_nullable: 'YES' }),
      expect.objectContaining({ table_name: 'reservation_lines', column_name: 'id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'reservation_lines', column_name: 'reservation_id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'reservation_lines', column_name: 'equipment_type_id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'reservation_lines', column_name: 'quantity', data_type: 'integer', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'reservation_lines', column_name: 'hourly_rate_snapshot', data_type: 'numeric', numeric_precision: 12, numeric_scale: 2, is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'reservation_allocations', column_name: 'id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'reservation_allocations', column_name: 'reservation_line_id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'reservation_allocations', column_name: 'asset_unit_id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'reservation_allocations', column_name: 'occupied_period', udt_name: 'tstzrange', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'reservation_allocations', column_name: 'assigned_at', data_type: 'timestamp with time zone', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'reservation_allocations', column_name: 'released_at', data_type: 'timestamp with time zone', is_nullable: 'YES' }),
      expect.objectContaining({ table_name: 'reservation_allocations', column_name: 'picked_up_at', data_type: 'timestamp with time zone', is_nullable: 'YES' }),
      expect.objectContaining({ table_name: 'reservation_allocations', column_name: 'custody_ended_at', data_type: 'timestamp with time zone', is_nullable: 'YES' }),
    ]));

    const reservationStatuses = await client.query<{ enumlabel: string }>(`
      SELECT enumlabel
      FROM pg_enum
      JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname = 'reservation_status'
      ORDER BY enumsortorder
    `);
    expect(reservationStatuses.rows.map((row) => row.enumlabel)).toEqual([
      'confirmed', 'delivered', 'returned', 'cancelled', 'expired',
    ]);

    const constraints = await client.query<{
      table_name: string;
      constraint_type: string;
      column_name: string | null;
      foreign_table_name: string | null;
      foreign_column_name: string | null;
    }>(`
      SELECT tc.table_name, tc.constraint_type, kcu.column_name,
             ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      LEFT JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_catalog = kcu.constraint_catalog
        AND tc.constraint_schema = kcu.constraint_schema
        AND tc.constraint_name = kcu.constraint_name
        AND tc.table_name = kcu.table_name
      LEFT JOIN information_schema.constraint_column_usage AS ccu
        ON tc.constraint_catalog = ccu.constraint_catalog
        AND tc.constraint_schema = ccu.constraint_schema
        AND tc.constraint_name = ccu.constraint_name
      WHERE tc.table_schema = 'public'
        AND tc.table_name IN ('reservations', 'reservation_lines', 'reservation_allocations')
    `);

    expect(constraints.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ table_name: 'reservations', constraint_type: 'PRIMARY KEY', column_name: 'id' }),
      expect.objectContaining({ table_name: 'reservation_lines', constraint_type: 'PRIMARY KEY', column_name: 'id' }),
      expect.objectContaining({ table_name: 'reservation_allocations', constraint_type: 'PRIMARY KEY', column_name: 'id' }),
      expect.objectContaining({ table_name: 'reservations', constraint_type: 'FOREIGN KEY', column_name: 'client_id', foreign_table_name: 'users', foreign_column_name: 'id' }),
      expect.objectContaining({ table_name: 'reservations', constraint_type: 'FOREIGN KEY', column_name: 'cancelled_by', foreign_table_name: 'users', foreign_column_name: 'id' }),
      expect.objectContaining({ table_name: 'reservation_lines', constraint_type: 'FOREIGN KEY', column_name: 'reservation_id', foreign_table_name: 'reservations', foreign_column_name: 'id' }),
      expect.objectContaining({ table_name: 'reservation_lines', constraint_type: 'FOREIGN KEY', column_name: 'equipment_type_id', foreign_table_name: 'equipment_types', foreign_column_name: 'id' }),
      expect.objectContaining({ table_name: 'reservation_allocations', constraint_type: 'FOREIGN KEY', column_name: 'reservation_line_id', foreign_table_name: 'reservation_lines', foreign_column_name: 'id' }),
      expect.objectContaining({ table_name: 'reservation_allocations', constraint_type: 'FOREIGN KEY', column_name: 'asset_unit_id', foreign_table_name: 'asset_units', foreign_column_name: 'id' }),
    ]));
  });

  it('enforces date, amount, quantity, and semi-open range checks', async () => {
    const userId = await insertUser();
    const equipmentTypeId = await insertEquipmentType();
    const unitId = await insertAssetUnit(equipmentTypeId);
    const reservationId = await insertReservation(userId);
    const lineId = await insertLine(reservationId, equipmentTypeId);

    await expect(client.query(
      `INSERT INTO reservations (id, client_id, starts_at, ends_at, status, total_ars, created_at)
       VALUES ($1, $2, $3, $3, 'confirmed', 50.00, now())`,
      [randomUUID(), userId, firstStart],
    )).rejects.toMatchObject({ code: '23514' });

    await expect(client.query(
      `INSERT INTO reservations (id, client_id, starts_at, ends_at, status, total_ars, created_at)
       VALUES ($1, $2, $3, $4, 'confirmed', -1.00, now())`,
      [randomUUID(), userId, firstStart, firstEnd],
    )).rejects.toMatchObject({ code: '23514' });

    await expect(client.query(
      `INSERT INTO reservations
        (id, client_id, starts_at, ends_at, status, total_ars, created_at, returned_at)
       VALUES ($1, $2, $3, $4, 'returned', 50.00, now(), now())`,
      [randomUUID(), userId, firstStart, firstEnd],
    )).rejects.toMatchObject({ code: '23514' });

    await expect(client.query(
      `INSERT INTO reservation_lines (id, reservation_id, equipment_type_id, quantity, hourly_rate_snapshot)
       VALUES ($1, $2, $3, 0, 100.00)`,
      [randomUUID(), reservationId, equipmentTypeId],
    )).rejects.toMatchObject({ code: '23514' });

    await expect(insertAllocation(lineId, unitId, firstStart, firstStart, '[)'))
      .rejects.toMatchObject({ code: '23514' });
    await expect(insertAllocation(lineId, unitId, firstStart, firstEnd, '[]'))
      .rejects.toMatchObject({ code: '23514' });
  });

  it('preserves released allocation history and permits only one open custody per unit', async () => {
    const userId = await insertUser();
    const equipmentTypeId = await insertEquipmentType();
    const unitId = await insertAssetUnit(equipmentTypeId);
    const firstReservationId = await insertReservation(userId, firstStart, firstEnd);
    const firstLineId = await insertLine(firstReservationId, equipmentTypeId);

    await insertAllocation(firstLineId, unitId);
    await expect(insertAllocation(firstLineId, unitId))
      .rejects.toMatchObject({ code: '23505' });

    await client.query(
      'UPDATE reservation_allocations SET released_at = now() WHERE reservation_line_id = $1 AND asset_unit_id = $2',
      [firstLineId, unitId],
    );
    await insertAllocation(firstLineId, unitId);

    const allocationHistory = await client.query<{ total: string; released: string }>(
      `SELECT COUNT(*)::text AS total, COUNT(released_at)::text AS released
       FROM reservation_allocations
       WHERE reservation_line_id = $1 AND asset_unit_id = $2`,
      [firstLineId, unitId],
    );
    expect(allocationHistory.rows[0]).toEqual({ total: '2', released: '1' });

    await client.query(
      `UPDATE reservation_allocations
       SET released_at = now(), picked_up_at = now()
       WHERE reservation_line_id = $1 AND asset_unit_id = $2 AND released_at IS NULL`,
      [firstLineId, unitId],
    );

    const secondReservationId = await insertReservation(userId, firstEnd, nextEnd);
    const secondLineId = await insertLine(secondReservationId, equipmentTypeId);
    await expect(insertAllocation(secondLineId, unitId, firstEnd, nextEnd, '[)', new Date().toISOString()))
      .rejects.toMatchObject({ code: '23505' });
  });
});
