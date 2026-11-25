import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { migrateUp } from '../../src/database/migrator.ts';
import { startTestPostgres, stopTestPostgres, type TestPostgres } from '../support/postgres.js';

const migrationDirectory = fileURLToPath(new URL('../../migrations/', import.meta.url));
let postgres: TestPostgres;
let client: Client;

async function insertUser(email: string, emailNormalized: string): Promise<void> {
  await client.query(
    `INSERT INTO users
      (id, full_name, email, email_normalized, phone, password_hash, role, created_at)
     VALUES ($1, 'Test Client', $2, $3, '555-0100', 'test-hash', 'client', now())`,
    [randomUUID(), email, emailNormalized],
  );
}

describe('User and AuthSession schema', () => {
  beforeAll(async () => {
    postgres = await startTestPostgres();
    client = postgres.client;
    await migrateUp(client, migrationDirectory);
  }, 30_000);

  afterAll(async () => {
    if (postgres) await stopTestPostgres(postgres);
  }, 30_000);

  it('creates the planned columns, primary keys, nullability, and session foreign key', async () => {
    const columns = await client.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      udt_name: string;
      is_nullable: string;
      column_default: string | null;
    }>(`
      SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('users', 'auth_sessions')
    `);

    expect(columns.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ table_name: 'users', column_name: 'id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'users', column_name: 'full_name', data_type: 'character varying', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'users', column_name: 'email', data_type: 'character varying', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'users', column_name: 'email_normalized', data_type: 'character varying', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'users', column_name: 'phone', data_type: 'character varying', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'users', column_name: 'organization', data_type: 'character varying', is_nullable: 'YES' }),
      expect.objectContaining({ table_name: 'users', column_name: 'password_hash', data_type: 'text', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'users', column_name: 'role', udt_name: 'user_role', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'users', column_name: 'is_active', data_type: 'boolean', is_nullable: 'NO', column_default: 'true' }),
      expect.objectContaining({ table_name: 'users', column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'auth_sessions', column_name: 'id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'auth_sessions', column_name: 'user_id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'auth_sessions', column_name: 'token_id', data_type: 'uuid', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'auth_sessions', column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'auth_sessions', column_name: 'expires_at', data_type: 'timestamp with time zone', is_nullable: 'NO' }),
      expect.objectContaining({ table_name: 'auth_sessions', column_name: 'revoked_at', data_type: 'timestamp with time zone', is_nullable: 'YES' }),
    ]));

    const roles = await client.query<{ enumlabel: string }>(`
      SELECT enumlabel
      FROM pg_enum
      JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname = 'user_role'
      ORDER BY enumsortorder
    `);
    expect(roles.rows.map((row) => row.enumlabel)).toEqual(['client', 'admin']);

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
        AND tc.table_name IN ('users', 'auth_sessions')
    `);

    expect(constraints.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ table_name: 'users', constraint_type: 'PRIMARY KEY', column_name: 'id' }),
      expect.objectContaining({ table_name: 'auth_sessions', constraint_type: 'PRIMARY KEY', column_name: 'id' }),
      expect.objectContaining({ table_name: 'users', constraint_type: 'UNIQUE', column_name: 'email_normalized' }),
      expect.objectContaining({ table_name: 'auth_sessions', constraint_type: 'UNIQUE', column_name: 'token_id' }),
      expect.objectContaining({
        table_name: 'auth_sessions',
        constraint_type: 'FOREIGN KEY',
        column_name: 'user_id',
        foreign_table_name: 'users',
        foreign_column_name: 'id',
      }),
    ]));
  });

  it('rejects duplicate normalized emails', async () => {
    await insertUser('client@example.test', 'client@example.test');

    await expect(insertUser('Client@Example.test', 'client@example.test'))
      .rejects.toMatchObject({ code: '23505' });
  });

  it('rejects sessions that refer to a missing user', async () => {
    await expect(client.query(
      `INSERT INTO auth_sessions (id, user_id, token_id, created_at, expires_at)
       VALUES ($1, $2, $3, now(), now() + interval '1 hour')`,
      [randomUUID(), randomUUID(), randomUUID()],
    )).rejects.toMatchObject({ code: '23503' });
  });
});
