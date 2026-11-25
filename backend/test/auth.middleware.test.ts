import { createHmac, randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { requireAuth, requireOwnerOrAdmin, requireRole } from '../src/auth/auth.middleware.ts';
import { fileURLToPath } from 'node:url';
import { migrateUp } from '../src/database/migrator.ts';
import { startTestPostgres, stopTestPostgres, type TestPostgres } from './support/postgres.js';

const migrationDirectory = fileURLToPath(new URL('../migrations/', import.meta.url));
const secret = 'test-only-access-token-secret-with-at-least-32-bytes';
let postgres: TestPostgres;
let client: Client;
let app: Express;

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signToken(payload: Record<string, unknown>, header = { alg: 'HS256', typ: 'JWT' }): string {
  const unsigned = `${encode(header)}.${encode(payload)}`;
  const signature = createHmac('sha256', secret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

async function issueSession(role: 'client' | 'admin' = 'client'): Promise<{ token: string; userId: string; tokenId: string }> {
  const userId = randomUUID();
  const tokenId = randomUUID();
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 3600;
  await client.query(
    `INSERT INTO users
      (id, full_name, email, email_normalized, phone, password_hash, role, created_at)
     VALUES ($1, 'Middleware Tester', $2, $2, '555-0100', 'unused-test-hash', $3, now())`,
    [userId, `${userId}@example.test`, role],
  );
  await client.query(
    `INSERT INTO auth_sessions (id, user_id, token_id, created_at, expires_at)
     VALUES ($1, $2, $3, now(), to_timestamp($4))`,
    [randomUUID(), userId, tokenId, expiresAt],
  );
  const token = signToken({ sub: userId, jti: tokenId, iat: issuedAt, exp: expiresAt });
  return { token, userId, tokenId };
}

describe('authentication and authorization middleware', () => {
  beforeAll(async () => {
    postgres = await startTestPostgres();
    client = postgres.client;
    await migrateUp(client, migrationDirectory);

    app = express();
    app.get('/protected', requireAuth(client, secret), (_request, response) => {
      response.status(200).json({ userId: response.locals.authUser.id, role: response.locals.authUser.role });
    });
    app.get('/admin', requireAuth(client, secret), requireRole('admin'), (_request, response) => {
      response.status(200).json({ ok: true });
    });
    app.get(
      '/resources/:ownerId',
      requireAuth(client, secret),
      requireOwnerOrAdmin((incoming) => {
        const ownerId = incoming.params.ownerId;
        return Array.isArray(ownerId) ? (ownerId[0] ?? null) : (ownerId ?? null);
      }),
      (_request, response) => response.status(200).json({ ok: true }),
    );
  }, 30_000);

  afterAll(async () => {
    if (postgres) await stopTestPostgres(postgres);
  }, 30_000);

  it('rejects missing bearer tokens, invalid signatures, unsupported algorithms, and expired tokens', async () => {
    await request(app).get('/protected').expect(401);

    const session = await issueSession();
    const parts = session.token.split('.');
    const invalidSignature = `${parts[0]}.${parts[1]}.${parts[2]?.slice(0, -1)}x`;
    await request(app).get('/protected').set('Authorization', `Bearer ${invalidSignature}`).expect(401);

    const issuedAt = Math.floor(Date.now() / 1000);
    const unsupportedAlgorithm = signToken(
      { sub: session.userId, jti: session.tokenId, iat: issuedAt, exp: issuedAt + 3600 },
      { alg: 'HS512', typ: 'JWT' },
    );
    await request(app).get('/protected').set('Authorization', `Bearer ${unsupportedAlgorithm}`).expect(401);

    const expiredToken = signToken({ sub: session.userId, jti: session.tokenId, iat: issuedAt - 3600, exp: issuedAt - 1 });
    await request(app).get('/protected').set('Authorization', `Bearer ${expiredToken}`).expect(401);
  });

  it('rejects revoked sessions and inactive accounts', async () => {
    const revoked = await issueSession();
    await client.query('UPDATE auth_sessions SET revoked_at = now() WHERE token_id = $1', [revoked.tokenId]);
    await request(app).get('/protected').set('Authorization', `Bearer ${revoked.token}`).expect(401);

    const inactive = await issueSession();
    await client.query('UPDATE users SET is_active = FALSE WHERE id = $1', [inactive.userId]);
    await request(app).get('/protected').set('Authorization', `Bearer ${inactive.token}`).expect(401);
  });

  it('allows only administrators through admin middleware', async () => {
    const clientSession = await issueSession('client');
    const adminSession = await issueSession('admin');

    await request(app).get('/admin').set('Authorization', `Bearer ${clientSession.token}`).expect(403);
    await request(app).get('/admin').set('Authorization', `Bearer ${adminSession.token}`).expect(200, { ok: true });
  });

  it('allows the owner or an administrator, and hides another client resource as 404', async () => {
    const owner = await issueSession('client');
    const other = await issueSession('client');
    const admin = await issueSession('admin');

    await request(app).get(`/resources/${owner.userId}`).set('Authorization', `Bearer ${owner.token}`).expect(200);
    await request(app).get(`/resources/${owner.userId}`).set('Authorization', `Bearer ${other.token}`).expect(404);
    await request(app).get(`/resources/${owner.userId}`).set('Authorization', `Bearer ${admin.token}`).expect(200);
  });
});
