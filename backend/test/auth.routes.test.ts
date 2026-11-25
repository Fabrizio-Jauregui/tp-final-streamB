import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { createApp } from '../src/app.ts';
import { migrateUp } from '../src/database/migrator.ts';
import { startTestPostgres, stopTestPostgres, type TestPostgres } from './support/postgres.js';

const migrationDirectory = fileURLToPath(new URL('../migrations/', import.meta.url));
const secret = 'test-only-access-token-secret-with-at-least-32-bytes';
const password = 'correct-horse-battery-staple';
let postgres: TestPostgres;
let client: Client;
let app: ReturnType<typeof createApp>;

describe('authentication HTTP routes', () => {
  beforeAll(async () => {
    postgres = await startTestPostgres();
    client = postgres.client;
    await migrateUp(client, migrationDirectory);
    const configuredCreateApp = createApp as unknown as (options: Record<string, unknown>) => ReturnType<typeof createApp>;
    app = configuredCreateApp({ database: client, accessTokenSecret: secret, accessTokenTtlSeconds: 60 });
  }, 30_000);

  afterAll(async () => {
    if (postgres) await stopTestPostgres(postgres);
  }, 30_000);

  it('rejects an access-token secret shorter than the documented minimum', () => {
    const configuredCreateApp = createApp as unknown as (options: Record<string, unknown>) => ReturnType<typeof createApp>;
    expect(() => configuredCreateApp({ database: client, accessTokenSecret: 'short' }))
      .toThrow('ACCESS_TOKEN_SECRET debe contener al menos 32 bytes.');
  });

  it('registers clients with a password hash and returns no credential fields', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        fullName: '  Ana Pérez  ',
        email: ' Ana.Perez@Example.test ',
        phone: ' 555-0101 ',
        password,
        organization: '  Productora Sur  ',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      fullName: 'Ana Pérez',
      email: 'Ana.Perez@Example.test',
      phone: '555-0101',
      organization: 'Productora Sur',
      role: 'client',
    });
    expect(response.body.id).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toContain(password);
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');

    const stored = await client.query<{ email_normalized: string; password_hash: string; role: string }>(
      'SELECT email_normalized, password_hash, role FROM users WHERE id = $1',
      [response.body.id],
    );
    expect(stored.rows[0]).toMatchObject({
      email_normalized: 'ana.perez@example.test',
      role: 'client',
    });
    expect(stored.rows[0]?.password_hash).toMatch(/^\$argon2id\$/);
    expect(stored.rows[0]?.password_hash).not.toBe(password);
  });

  it('rejects duplicate normalized emails with 409', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ fullName: 'Duplicate Test', email: 'same@example.test', phone: '555-0102', password })
      .expect(201);

    await request(app)
      .post('/api/auth/register')
      .send({ fullName: 'Duplicate Test', email: ' SAME@Example.test ', phone: '555-0103', password })
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('email_already_registered'));
  });

  it('never accepts a public role and validates required registration fields', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ fullName: 'Escalation Attempt', email: 'admin@example.test', phone: '555-0104', password, role: 'admin' })
      .expect(400);

    await request(app)
      .post('/api/auth/register')
      .send({ fullName: '', email: 'not-an-email', phone: '', password: '' })
      .expect(400);

    const result = await client.query('SELECT id FROM users WHERE email_normalized = $1', ['admin@example.test']);
    expect(result.rows).toHaveLength(0);
  });

  it('authenticates with a Bearer JWT and persists its session', async () => {
    const registration = await request(app)
      .post('/api/auth/register')
      .send({ fullName: 'Login Test', email: 'login@example.test', phone: '555-0105', password })
      .expect(201);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: ' LOGIN@Example.test ', password })
      .expect(200);

    expect(login.body).toMatchObject({ tokenType: 'Bearer', expiresIn: 60 });
    expect(login.body.accessToken).toEqual(expect.any(String));
    expect(login.body.user).toMatchObject({ id: registration.body.id, role: 'client' });
    expect(JSON.stringify(login.body)).not.toContain(password);
    expect(JSON.stringify(login.body)).not.toContain('passwordHash');
    expect(JSON.stringify(login.body)).not.toContain(secret);

    const payload = JSON.parse(Buffer.from(login.body.accessToken.split('.')[1], 'base64url').toString('utf8')) as { jti: string };
    const session = await client.query<{ user_id: string; expires_at: Date; revoked_at: Date | null }>(
      'SELECT user_id, expires_at, revoked_at FROM auth_sessions WHERE token_id = $1',
      [payload.jti],
    );
    expect(session.rows).toHaveLength(1);
    expect(session.rows[0]).toMatchObject({ user_id: registration.body.id, revoked_at: null });
  });

  it('returns the same unauthorized response for an unknown email or incorrect password', async () => {
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'missing@example.test', password })
      .expect(401);
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.test', password: 'wrong-password' })
      .expect(401);
    expect(unknownEmail.body.error.code).toBe('invalid_credentials');
    expect(wrongPassword.body.error.code).toBe('invalid_credentials');
  });

  it('revokes the current session on logout', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.test', password })
      .expect(200);

    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(204);

    const payload = JSON.parse(Buffer.from(login.body.accessToken.split('.')[1], 'base64url').toString('utf8')) as { jti: string };
    const session = await client.query<{ revoked_at: Date | null }>(
      'SELECT revoked_at FROM auth_sessions WHERE token_id = $1',
      [payload.jti],
    );
    expect(session.rows[0]?.revoked_at).not.toBeNull();

    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(401);
  });
});
