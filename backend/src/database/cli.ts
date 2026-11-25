import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { migrateDown, migrateUp } from './migrator.ts';

const migrationDirectory = fileURLToPath(new URL('../../migrations/', import.meta.url));

async function main(): Promise<void> {
  const direction = process.argv[2];
  if (direction !== 'up' && direction !== 'down') {
    throw new Error('Indica la operación: up o down.');
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Define DATABASE_URL para ejecutar migraciones.');
  }

  const pool = new Pool({ connectionString });
  try {
    const client = await pool.connect();
    try {
      if (direction === 'up') {
        const count = await migrateUp(client, migrationDirectory);
        console.info(`Migraciones aplicadas: ${count}.`);
      } else {
        const migration = await migrateDown(client, migrationDirectory);
        console.info(migration ? `Migración revertida: ${migration}.` : 'No hay migraciones para revertir.');
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
