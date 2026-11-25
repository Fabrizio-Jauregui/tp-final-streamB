import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { migrateUp } from '../../src/database/migrator.ts';
import { startTestPostgres, stopTestPostgres, type TestPostgres } from '../support/postgres.js';

const migrationDirectory = fileURLToPath(new URL('../../migrations/', import.meta.url));
let postgres: TestPostgres;
let client: Client;

async function insertEquipmentType(rate: string | null): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO equipment_types (id, name, description, hourly_rate_ars, created_at)
     VALUES ($1, $2, 'Test equipment', $3, now())`,
    [id, `Type ${id}`, rate],
  );
  return id;
}

async function insertAssetUnit(equipmentTypeId: string, code: string, status = 'available'): Promise<void> {
  await client.query(
    `INSERT INTO asset_units (id, equipment_type_id, code, status, created_at)
     VALUES ($1, $2, $3, $4, now())`,
    [randomUUID(), equipmentTypeId, code, status],
  );
}

describe('EquipmentType and AssetUnit schema', () => {
  beforeAll(async () => {
    postgres = await startTestPostgres();
    client = postgres.client;
    await migrateUp(client, migrationDirectory);
  }, 30_000);

  afterAll(async () => {
    if (postgres) await stopTestPostgres(postgres);
  }, 30_000);

  it('creates the planned columns, limits, defaults, keys, and foreign key', async () => {
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
        AND table_name IN ('equipment_types', 'asset_units')
    `);

    expect(columns.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ table_name: 'equipment_types', column_name: 'id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'equipment_types', column_name: 'name', data_type: 'character varying', character_maximum_length: 120, is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'equipment_types', column_name: 'description', data_type: 'text', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'equipment_types', column_name: 'hourly_rate_ars', data_type: 'numeric', numeric_precision: 12, numeric_scale: 2, is_nullable: 'YES' }),
      expect.objectContaining({ table_name: 'equipment_types', column_name: 'is_active', data_type: 'boolean', column_default: 'true', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'equipment_types', column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'asset_units', column_name: 'id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'asset_units', column_name: 'equipment_type_id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'asset_units', column_name: 'code', data_type: 'character varying', character_maximum_length: 80, is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'asset_units', column_name: 'status', udt_name: 'asset_status', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'asset_units', column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' }),
    ]));

    const statuses = await client.query<{ enumlabel: string }>(`
      SELECT enumlabel
      FROM pg_enum
      JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname = 'asset_status'
      ORDER BY enumsortorder
    `);
    expect(statuses.rows.map((row) => row.enumlabel)).toEqual([
      'available', 'maintenance', 'missing', 'retired',
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
        AND tc.table_name IN ('equipment_types', 'asset_units')
    `);

    expect(constraints.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ table_name: 'equipment_types', constraint_type: 'PRIMARY KEY', column_name: 'id' }),
      expect.objectContaining({ table_name: 'asset_units', constraint_type: 'PRIMARY KEY', column_name: 'id' }),
      expect.objectContaining({ table_name: 'asset_units', constraint_type: 'UNIQUE', column_name: 'code' }),
      expect.objectContaining({
        table_name: 'asset_units',
        constraint_type: 'FOREIGN KEY',
        column_name: 'equipment_type_id',
        foreign_table_name: 'equipment_types',
        foreign_column_name: 'id',
      }),
    ]));
  });

  it('allows a missing tariff but rejects a negative tariff', async () => {
    const typeId = await insertEquipmentType(null);
    const result = await client.query<{ hourly_rate_ars: string | null }>(
      'SELECT hourly_rate_ars FROM equipment_types WHERE id = $1',
      [typeId],
    );
    expect(result.rows[0]?.hourly_rate_ars).toBeNull();

    await expect(insertEquipmentType('-1.00')).rejects.toMatchObject({ code: '23514' });
  });

  it('enforces unique unit codes and an existing equipment type', async () => {
    const firstTypeId = await insertEquipmentType('100.00');
    const secondTypeId = await insertEquipmentType('200.00');

    await insertAssetUnit(firstTypeId, 'UNIT-001');
    await expect(insertAssetUnit(secondTypeId, 'UNIT-001'))
      .rejects.toMatchObject({ code: '23505' });
    await expect(insertAssetUnit(randomUUID(), 'UNIT-UNKNOWN'))
      .rejects.toMatchObject({ code: '23503' });
  });

  it('rejects unit states outside the planned enum', async () => {
    const typeId = await insertEquipmentType('100.00');
    await expect(insertAssetUnit(typeId, 'UNIT-BAD-STATUS', 'unavailable'))
      .rejects.toMatchObject({ code: '22P02' });
  });
});
