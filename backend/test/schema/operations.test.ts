import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { migrateUp } from '../../src/database/migrator.ts';
import { startTestPostgres, stopTestPostgres, type TestPostgres } from '../support/postgres.js';

const migrationDirectory = fileURLToPath(new URL('../../migrations/', import.meta.url));
const startsAt = '2030-02-01T10:00:00.000Z';
const endsAt = '2030-02-01T12:00:00.000Z';
let postgres: TestPostgres;
let client: Client;

async function insertUser(role: 'client' | 'admin' = 'admin'): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO users
      (id, full_name, email, email_normalized, phone, password_hash, role, created_at)
     VALUES ($1, 'Operations Tester', $2, $2, '555-0100', 'test-hash', $3, now())`,
    [id, `${id}@example.test`, role],
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

async function insertReservation(clientId: string, equipmentTypeId: string): Promise<{ id: string; lineId: string }> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO reservations
      (id, client_id, starts_at, ends_at, status, total_ars, created_at)
     VALUES ($1, $2, $3, $4, 'confirmed', 200.00, now())`,
    [id, clientId, startsAt, endsAt],
  );

  const lineId = randomUUID();
  await client.query(
    `INSERT INTO reservation_lines
      (id, reservation_id, equipment_type_id, quantity, hourly_rate_snapshot)
     VALUES ($1, $2, $3, 1, 100.00)`,
    [lineId, id, equipmentTypeId],
  );
  return { id, lineId };
}

async function insertAllocation(lineId: string, unitId: string): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO reservation_allocations
      (id, reservation_line_id, asset_unit_id, occupied_period, assigned_at)
     VALUES ($1, $2, $3, tstzrange($4::timestamptz, $5::timestamptz, '[)'), now())`,
    [id, lineId, unitId, startsAt, endsAt],
  );
  return id;
}

describe('maintenance and operational event schemas', () => {
  beforeAll(async () => {
    postgres = await startTestPostgres();
    client = postgres.client;
    await migrateUp(client, migrationDirectory);
  }, 30_000);

  afterAll(async () => {
    if (postgres) await stopTestPostgres(postgres);
  }, 30_000);

  it('creates planned fields, enums, primary keys, and foreign keys', async () => {
    const columns = await client.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      udt_name: string;
      is_nullable: string;
      character_maximum_length: number | null;
    }>(`
      SELECT table_name, column_name, data_type, udt_name, is_nullable, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('maintenance_blocks', 'condition_events', 'allocation_change_events', 'in_app_notices')
    `);

    expect(columns.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ table_name: 'maintenance_blocks', column_name: 'id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'maintenance_blocks', column_name: 'asset_unit_id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'maintenance_blocks', column_name: 'starts_at', data_type: 'timestamp with time zone', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'maintenance_blocks', column_name: 'ends_at', data_type: 'timestamp with time zone', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'maintenance_blocks', column_name: 'reason', data_type: 'text', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'maintenance_blocks', column_name: 'admin_id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'maintenance_blocks', column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'maintenance_blocks', column_name: 'cancelled_at', data_type: 'timestamp with time zone', is_nullable: 'YES' }),
      expect.objectContaining({ table_name: 'condition_events', column_name: 'operation_id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'condition_events', column_name: 'id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'condition_events', column_name: 'reservation_id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'condition_events', column_name: 'asset_unit_id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'condition_events', column_name: 'stage', udt_name: 'condition_stage', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'condition_events', column_name: 'condition', udt_name: 'condition_value', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'condition_events', column_name: 'note', data_type: 'text', is_nullable: 'YES' }),
      expect.objectContaining({ table_name: 'condition_events', column_name: 'admin_id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'condition_events', column_name: 'recorded_at', data_type: 'timestamp with time zone', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'allocation_change_events', column_name: 'reservation_id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'allocation_change_events', column_name: 'id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'allocation_change_events', column_name: 'old_allocation_id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'allocation_change_events', column_name: 'new_allocation_id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'allocation_change_events', column_name: 'admin_id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'allocation_change_events', column_name: 'reason', data_type: 'text', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'allocation_change_events', column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'in_app_notices', column_name: 'user_id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'in_app_notices', column_name: 'id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'in_app_notices', column_name: 'reservation_id', data_type: 'uuid', is_nullable: 'YES' }),
      expect.objectContaining({ table_name: 'in_app_notices', column_name: 'kind', data_type: 'character varying', character_maximum_length: 40, is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'in_app_notices', column_name: 'message', data_type: 'text', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'in_app_notices', column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'in_app_notices', column_name: 'read_at', data_type: 'timestamp with time zone', is_nullable: 'YES' }),
    ]));

    const primaryKeys = await client.query<{ table_name: string; column_name: string }>(`
      SELECT tc.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_catalog = kcu.constraint_catalog
        AND tc.constraint_schema = kcu.constraint_schema
        AND tc.constraint_name = kcu.constraint_name
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name IN ('maintenance_blocks', 'condition_events', 'allocation_change_events', 'in_app_notices')
    `);
    expect(primaryKeys.rows).toEqual(expect.arrayContaining([
      { table_name: 'maintenance_blocks', column_name: 'id' },
      { table_name: 'condition_events', column_name: 'id' },
      { table_name: 'allocation_change_events', column_name: 'id' },
      { table_name: 'in_app_notices', column_name: 'id' },
    ]));

    const enumValues = await client.query<{ typname: string; enumlabel: string }>(`
      SELECT pg_type.typname, pg_enum.enumlabel
      FROM pg_enum JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname IN ('condition_stage', 'condition_value')
      ORDER BY pg_type.typname, pg_enum.enumsortorder
    `);
    expect(enumValues.rows).toEqual([
      { typname: 'condition_stage', enumlabel: 'pickup' },
      { typname: 'condition_stage', enumlabel: 'return' },
      { typname: 'condition_value', enumlabel: 'correct' },
      { typname: 'condition_value', enumlabel: 'damaged' },
      { typname: 'condition_value', enumlabel: 'missing' },
    ]);

    const foreignKeys = await client.query<{
      table_name: string;
      column_name: string;
      foreign_table_name: string;
      foreign_column_name: string;
    }>(`
      SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name,
             ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_catalog = kcu.constraint_catalog
        AND tc.constraint_schema = kcu.constraint_schema
        AND tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_catalog = ccu.constraint_catalog
        AND tc.constraint_schema = ccu.constraint_schema
        AND tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name IN ('maintenance_blocks', 'condition_events', 'allocation_change_events', 'in_app_notices')
    `);
    expect(foreignKeys.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ table_name: 'maintenance_blocks', column_name: 'asset_unit_id', foreign_table_name: 'asset_units', foreign_column_name: 'id' }),
      expect.objectContaining({ table_name: 'maintenance_blocks', column_name: 'admin_id', foreign_table_name: 'users', foreign_column_name: 'id' }),
      expect.objectContaining({ table_name: 'condition_events', column_name: 'reservation_id', foreign_table_name: 'reservations', foreign_column_name: 'id' }),
      expect.objectContaining({ table_name: 'condition_events', column_name: 'asset_unit_id', foreign_table_name: 'asset_units', foreign_column_name: 'id' }),
      expect.objectContaining({ table_name: 'condition_events', column_name: 'admin_id', foreign_table_name: 'users', foreign_column_name: 'id' }),
      expect.objectContaining({ table_name: 'allocation_change_events', column_name: 'reservation_id', foreign_table_name: 'reservations', foreign_column_name: 'id' }),
      expect.objectContaining({ table_name: 'allocation_change_events', column_name: 'old_allocation_id', foreign_table_name: 'reservation_allocations', foreign_column_name: 'id' }),
      expect.objectContaining({ table_name: 'allocation_change_events', column_name: 'new_allocation_id', foreign_table_name: 'reservation_allocations', foreign_column_name: 'id' }),
      expect.objectContaining({ table_name: 'allocation_change_events', column_name: 'admin_id', foreign_table_name: 'users', foreign_column_name: 'id' }),
      expect.objectContaining({ table_name: 'in_app_notices', column_name: 'user_id', foreign_table_name: 'users', foreign_column_name: 'id' }),
      expect.objectContaining({ table_name: 'in_app_notices', column_name: 'reservation_id', foreign_table_name: 'reservations', foreign_column_name: 'id' }),
    ]));
  });

  it('validates maintenance periods and indexes only uncancelled blocks', async () => {
    const adminId = await insertUser();
    const equipmentTypeId = await insertEquipmentType();
    const unitId = await insertAssetUnit(equipmentTypeId);

    await expect(client.query(
      `INSERT INTO maintenance_blocks
        (id, asset_unit_id, starts_at, ends_at, reason, admin_id, created_at)
       VALUES ($1, $2, $3, $3, 'Inspection', $4, now())`,
      [randomUUID(), unitId, startsAt, adminId],
    )).rejects.toMatchObject({ code: '23514' });

    const index = await client.query<{ indexdef: string }>(`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'maintenance_blocks'
        AND indexname = 'maintenance_blocks_active_period_gist'
    `);
    expect(index.rows).toHaveLength(1);
    expect(index.rows[0]?.indexdef.toLowerCase()).toContain('using gist');
    expect(index.rows[0]?.indexdef.toLowerCase()).toContain('where (cancelled_at is null)');

    const blockId = randomUUID();
    await client.query(
      `INSERT INTO maintenance_blocks
        (id, asset_unit_id, starts_at, ends_at, reason, admin_id, created_at)
       VALUES ($1, $2, $3, $4, 'Inspection', $5, now())`,
      [blockId, unitId, startsAt, endsAt, adminId],
    );
    await client.query('UPDATE maintenance_blocks SET cancelled_at = now() WHERE id = $1', [blockId]);
    await client.query(
      `INSERT INTO maintenance_blocks
        (id, asset_unit_id, starts_at, ends_at, reason, admin_id, created_at)
       VALUES ($1, $2, $3, $4, 'Replacement inspection', $5, now())`,
      [randomUUID(), unitId, startsAt, endsAt, adminId],
    );

    const history = await client.query<{ total: string; cancelled: string }>(
      `SELECT COUNT(*)::text AS total, COUNT(cancelled_at)::text AS cancelled
       FROM maintenance_blocks WHERE asset_unit_id = $1`,
      [unitId],
    );
    expect(history.rows[0]).toEqual({ total: '2', cancelled: '1' });
  });

  it('preserves repeated condition and allocation-change events and permits notices without a reservation', async () => {
    const adminId = await insertUser();
    const clientId = await insertUser('client');
    const equipmentTypeId = await insertEquipmentType();
    const firstUnitId = await insertAssetUnit(equipmentTypeId);
    const secondUnitId = await insertAssetUnit(equipmentTypeId);
    const reservation = await insertReservation(clientId, equipmentTypeId);
    const oldAllocationId = await insertAllocation(reservation.lineId, firstUnitId);
    const newAllocationId = await insertAllocation(reservation.lineId, secondUnitId);

    for (const [condition, note] of [['damaged', 'First pickup attempt'], ['correct', 'Retry after repair']] as const) {
      await client.query(
        `INSERT INTO condition_events
          (id, operation_id, reservation_id, asset_unit_id, stage, condition, note, admin_id, recorded_at)
         VALUES ($1, $2, $3, $4, 'pickup', $5, $6, $7, now())`,
        [randomUUID(), randomUUID(), reservation.id, firstUnitId, condition, note, adminId],
      );
    }

    await client.query(
      `INSERT INTO allocation_change_events
        (id, reservation_id, old_allocation_id, new_allocation_id, admin_id, reason, created_at)
       VALUES ($1, $2, $3, $4, $5, 'Replacement unit after incident', now())`,
      [randomUUID(), reservation.id, oldAllocationId, newAllocationId, adminId],
    );
    await client.query(
      `INSERT INTO allocation_change_events
        (id, reservation_id, old_allocation_id, new_allocation_id, admin_id, reason, created_at)
       VALUES ($1, $2, $3, $4, $5, 'Second audited correction', now())`,
      [randomUUID(), reservation.id, newAllocationId, oldAllocationId, adminId],
    );

    await client.query(
      `INSERT INTO in_app_notices (id, user_id, reservation_id, kind, message, created_at)
       VALUES ($1, $2, NULL, 'system', 'Account notice', now())`,
      [randomUUID(), clientId],
    );
    await client.query(
      `INSERT INTO in_app_notices (id, user_id, reservation_id, kind, message, created_at)
       VALUES ($1, $2, $3, 'reservation', 'Reservation notice', now())`,
      [randomUUID(), clientId, reservation.id],
    );

    const eventCount = await client.query<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM condition_events WHERE reservation_id = $1 AND asset_unit_id = $2 AND stage = $3',
      [reservation.id, firstUnitId, 'pickup'],
    );
    expect(eventCount.rows[0]?.total).toBe('2');

    const changeEventCount = await client.query<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM allocation_change_events WHERE reservation_id = $1',
      [reservation.id],
    );
    expect(changeEventCount.rows[0]?.total).toBe('2');

    const noticeCount = await client.query<{ total: string; without_reservation: string }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE reservation_id IS NULL)::text AS without_reservation
       FROM in_app_notices WHERE user_id = $1`,
      [clientId],
    );
    expect(noticeCount.rows[0]).toEqual({ total: '2', without_reservation: '1' });
  });
});
