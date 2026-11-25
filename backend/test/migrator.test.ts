import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { startTestPostgres, stopTestPostgres, type TestPostgres } from './support/postgres.js';

const migrationDirectory = fileURLToPath(new URL('./fixtures/migrations/', import.meta.url));
let postgres: TestPostgres;
let client: Client;

describe('migrator with an isolated PostgreSQL database', () => {
  beforeAll(async () => {
    postgres = await startTestPostgres();
    client = postgres.client;
  }, 30_000);

  afterAll(async () => {
    if (postgres) await stopTestPostgres(postgres);
  }, 30_000);

  it('connects, applies a migration, and rolls it back', async () => {
    const connection = await client.query<{ version: string }>('SELECT version() AS version');
    expect(connection.rows[0]?.version).toContain('PostgreSQL');

    const { migrateDown, migrateUp } = await import('../src/database/migrator.ts');
    expect(await migrateUp(client, migrationDirectory)).toBe(1);

    const created = await client.query<{ table_name: string | null }>(
      "SELECT to_regclass('public.t02_migration_probe') AS table_name",
    );
    expect(created.rows[0]?.table_name).toBe('t02_migration_probe');

    expect(await migrateUp(client, migrationDirectory)).toBe(0);
    expect(await migrateDown(client, migrationDirectory)).toBe('0001_test_probe');

    const rolledBack = await client.query<{ table_name: string | null }>(
      "SELECT to_regclass('public.t02_migration_probe') AS table_name",
    );
    expect(rolledBack.rows[0]?.table_name).toBeNull();

    const history = await client.query<{ applied: string }>(
      'SELECT count(*)::text AS applied FROM schema_migrations',
    );
    expect(history.rows[0]?.applied).toBe('0');
  }, 30_000);
});
