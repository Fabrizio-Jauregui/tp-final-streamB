import { createServer } from 'node:net';
import { Client } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

export interface TestPostgres {
  database: PGlite;
  server: PGLiteSocketServer;
  client: Client;
}

async function availablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (address === null || typeof address === 'string') {
        probe.close();
        reject(new Error('No se pudo determinar el puerto de prueba.'));
        return;
      }

      probe.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

export async function startTestPostgres(): Promise<TestPostgres> {
  const database = await PGlite.create();
  let server: PGLiteSocketServer | undefined;
  let client: Client | undefined;

  try {
    const port = await availablePort();
    server = new PGLiteSocketServer({ db: database, host: '127.0.0.1', port });
    await server.start();

    client = new Client({
      host: '127.0.0.1',
      port,
      database: 'postgres',
      user: 'postgres',
      password: 'postgres',
      ssl: false,
    });
    await client.connect();

    return { database, server, client };
  } catch (error) {
    await client?.end();
    await server?.stop();
    await database.close();
    throw error;
  }
}

export async function stopTestPostgres(testPostgres: TestPostgres): Promise<void> {
  try {
    await testPostgres.client.end();
  } finally {
    try {
      await testPostgres.server.stop();
    } finally {
      await testPostgres.database.close();
    }
  }
}
