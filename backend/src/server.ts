import { createApp } from './app.ts';
import { Pool } from 'pg';

const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  throw new Error('PORT debe ser un entero entre 0 y 65535.');
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL es obligatorio para iniciar el backend.');

const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET;
if (!accessTokenSecret || Buffer.byteLength(accessTokenSecret, 'utf8') < 32) {
  throw new Error('ACCESS_TOKEN_SECRET debe contener al menos 32 bytes.');
}

const accessTokenTtlSeconds = Number(process.env.ACCESS_TOKEN_TTL ?? '28800');
if (!Number.isSafeInteger(accessTokenTtlSeconds) || accessTokenTtlSeconds <= 0) {
  throw new Error('ACCESS_TOKEN_TTL debe ser un entero positivo en segundos.');
}

const pool = new Pool({ connectionString: databaseUrl });
const server = createApp({ database: pool, accessTokenSecret, accessTokenTtlSeconds }).listen(port, () => {
  console.info(`Backend escuchando en el puerto ${port}.`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => {
      void pool.end();
    });
  });
}
