import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Client } from 'pg';

type MigrationClient = Pick<Client, 'query'>;

interface MigrationFile {
  name: string;
  upPath: string;
  downPath: string;
}

interface AppliedMigration {
  name: string;
}

async function listMigrations(directory: string): Promise<MigrationFile[]> {
  const filenames = (await readdir(directory)).sort();
  const migrations: MigrationFile[] = [];

  for (const filename of filenames.filter((file) => file.endsWith('.up.sql'))) {
    const name = filename.slice(0, -'.up.sql'.length);
    if (!/^\d{4}_[a-z0-9_]+$/.test(name)) {
      throw new Error(`Nombre de migración inválido: ${filename}`);
    }

    const upPath = join(directory, filename);
    const downPath = join(directory, `${name}.down.sql`);
    await access(downPath);
    migrations.push({ name, upPath, downPath });
  }

  return migrations;
}

async function ensureMigrationTable(client: MigrationClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function applySqlTransaction(
  client: MigrationClient,
  name: string,
  sql: string,
  recordSql: string,
  parameters: string[],
): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query(recordSql, parameters);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw new Error(`Falló la migración ${name}.`, { cause: error });
  }
}

export async function migrateUp(client: MigrationClient, directory: string): Promise<number> {
  const migrations = await listMigrations(directory);
  await ensureMigrationTable(client);

  const result = await client.query<AppliedMigration>('SELECT name FROM schema_migrations');
  const applied = new Set(result.rows.map((row) => row.name));
  let appliedCount = 0;

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;

    const sql = await readFile(migration.upPath, 'utf8');
    await applySqlTransaction(
      client,
      migration.name,
      sql,
      'INSERT INTO schema_migrations (name) VALUES ($1)',
      [migration.name],
    );
    appliedCount += 1;
  }

  return appliedCount;
}

export async function migrateDown(client: MigrationClient, directory: string): Promise<string | null> {
  const migrations = await listMigrations(directory);
  await ensureMigrationTable(client);

  const result = await client.query<AppliedMigration>(
    'SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1',
  );
  const name = result.rows[0]?.name;
  if (!name) return null;

  const migration = migrations.find((candidate) => candidate.name === name);
  if (!migration) {
    throw new Error(`No se encontró el archivo de migración aplicado ${name}.`);
  }

  const sql = await readFile(migration.downPath, 'utf8');
  await applySqlTransaction(
    client,
    name,
    sql,
    'DELETE FROM schema_migrations WHERE name = $1',
    [name],
  );

  return name;
}
