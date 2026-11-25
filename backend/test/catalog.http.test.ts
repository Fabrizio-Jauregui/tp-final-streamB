import { createHmac, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { createApp } from '../src/app.ts';
import { migrateUp } from '../src/database/migrator.ts';
import { startTestPostgres, stopTestPostgres, type TestPostgres } from './support/postgres.js';

const migrationDirectory = fileURLToPath(new URL('../migrations/', import.meta.url));
const secret = 'test-only-access-token-secret-with-at-least-32-bytes';
let postgres: TestPostgres;
let client: Client;
let app: ReturnType<typeof createApp>;

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signToken(payload: Record<string, unknown>): string {
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}`;
  const signature = createHmac('sha256', secret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

async function issueSession(role: 'client' | 'admin'): Promise<{ token: string; userId: string }> {
  const userId = randomUUID();
  const tokenId = randomUUID();
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 3600;
  await client.query(
    `INSERT INTO users
      (id, full_name, email, email_normalized, phone, password_hash, role, created_at)
     VALUES ($1, 'Catalog Tester', $2, $2, '555-0100', 'unused-test-hash', $3, now())`,
    [userId, `${userId}@example.test`, role],
  );
  await client.query(
    `INSERT INTO auth_sessions (id, user_id, token_id, created_at, expires_at)
     VALUES ($1, $2, $3, now(), to_timestamp($4))`,
    [randomUUID(), userId, tokenId, expiresAt],
  );
  return {
    token: signToken({ sub: userId, jti: tokenId, iat: issuedAt, exp: expiresAt }),
    userId,
  };
}

async function createEquipmentType(input: {
  name: string;
  rate: string | null;
  active?: boolean;
}): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO equipment_types (id, name, description, hourly_rate_ars, is_active, created_at)
     VALUES ($1, $2, 'Descripción de prueba', $3, $4, now())`,
    [id, input.name, input.rate, input.active ?? true],
  );
  return id;
}

describe('catalog and inventory HTTP routes', () => {
  beforeAll(async () => {
    postgres = await startTestPostgres();
    client = postgres.client;
    await migrateUp(client, migrationDirectory);
    const configuredCreateApp = createApp as unknown as (options: Record<string, unknown>) => ReturnType<typeof createApp>;
    app = configuredCreateApp({ database: client, accessTokenSecret: secret, accessTokenTtlSeconds: 3600 });
  }, 30_000);

  afterAll(async () => {
    if (postgres) await stopTestPostgres(postgres);
  }, 30_000);

  it('shows active public types and current tariffs without exposing physical units', async () => {
    const rentableId = await createEquipmentType({ name: 'Cámara', rate: '1250.50' });
    const noTariffId = await createEquipmentType({ name: 'Micrófono', rate: null });
    await createEquipmentType({ name: 'Archived camera', rate: '800.00', active: false });
    await client.query(
      `INSERT INTO asset_units (id, equipment_type_id, code, status, created_at)
       VALUES ($1, $2, 'CAM-PRIVATE-1', 'available', now())`,
      [randomUUID(), rentableId],
    );

    const response = await request(app).get('/api/equipment-types').expect(200);
    expect(response.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: rentableId, name: 'Cámara', hourlyRate: '1250.50', isRentable: true }),
      expect.objectContaining({ id: noTariffId, name: 'Micrófono', hourlyRate: null, isRentable: false }),
    ]));
    expect(response.body).toHaveLength(2);
    expect(JSON.stringify(response.body)).not.toContain('Archived camera');
    expect(JSON.stringify(response.body)).not.toContain('CAM-PRIVATE-1');
    expect(JSON.stringify(response.body)).not.toContain('status');
  });

  it('protects administrative catalog reads and includes inactive types', async () => {
    const activeId = await createEquipmentType({ name: 'Luz activa', rate: '100.00' });
    const inactiveId = await createEquipmentType({ name: 'Luz archivada', rate: null, active: false });
    const customer = await issueSession('client');
    const admin = await issueSession('admin');

    await request(app).get('/api/admin/equipment-types').expect(401);
    await request(app).get('/api/admin/equipment-types').set('Authorization', `Bearer ${customer.token}`).expect(403);
    const response = await request(app)
      .get('/api/admin/equipment-types')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(response.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: activeId, isActive: true }),
      expect.objectContaining({ id: inactiveId, isActive: false, hourlyRate: null }),
    ]));
  });

  it('creates and updates equipment types with validated nullable tariffs', async () => {
    const admin = await issueSession('admin');
    const created = await request(app)
      .post('/api/admin/equipment-types')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Trípode', description: 'Trípode profesional', hourlyRate: '250.00' })
      .expect(201);

    expect(created.body).toMatchObject({
      name: 'Trípode', description: 'Trípode profesional', hourlyRate: '250.00', isActive: true,
    });

    const updated = await request(app)
      .patch(`/api/admin/equipment-types/${created.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ hourlyRate: null, isActive: false })
      .expect(200);
    expect(updated.body).toMatchObject({ hourlyRate: null, isActive: false });

    await request(app)
      .post('/api/admin/equipment-types')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Tarifa inválida', description: 'Inválida', hourlyRate: '-1.00' })
      .expect(400);
    await request(app)
      .post('/api/admin/equipment-types')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Tarifa inválida', description: 'Inválida', hourlyRate: '1.001' })
      .expect(400);
    await request(app)
      .post('/api/admin/equipment-types')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Campo desconocido', description: 'No permitido', unexpected: true })
      .expect(400);

    const publicCatalog = await request(app).get('/api/equipment-types').expect(200);
    expect(publicCatalog.body).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: created.body.id })]));
  });

  it('creates units, rejects duplicate codes, and filters the admin inventory', async () => {
    const admin = await issueSession('admin');
    const typeId = await createEquipmentType({ name: 'Proyector', rate: '1500.00' });
    const created = await request(app)
      .post('/api/admin/units')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ equipmentTypeId: typeId, code: 'PROJ-001', status: 'available' })
      .expect(201);

    expect(created.body).toMatchObject({ equipmentTypeId: typeId, equipmentTypeName: 'Proyector', code: 'PROJ-001', status: 'available' });
    await request(app)
      .post('/api/admin/units')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ equipmentTypeId: typeId, code: 'PROJ-001', status: 'available' })
      .expect(409);
    await request(app)
      .post('/api/admin/units')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ equipmentTypeId: randomUUID(), code: 'NO-TYPE-1', status: 'available' })
      .expect(404);
    await request(app)
      .post('/api/admin/units')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ equipmentTypeId: typeId, code: 'BAD-STATUS', status: 'broken' })
      .expect(400);
    await request(app).get(`/api/admin/units?equipmentTypeId=${typeId}&status=available`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual([expect.objectContaining({ id: created.body.id, status: 'available' })]);
      });
  });

  it('changes unit status, rejects an open physical custody, and keeps future allocations manageable', async () => {
    const admin = await issueSession('admin');
    const customer = await issueSession('client');
    const typeId = await createEquipmentType({ name: 'Grabador', rate: '300.00' });
    const unitId = randomUUID();
    await client.query(
      `INSERT INTO asset_units (id, equipment_type_id, code, status, created_at)
       VALUES ($1, $2, 'REC-001', 'available', now())`,
      [unitId, typeId],
    );

    await request(app)
      .patch(`/api/admin/units/${unitId}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ status: 'maintenance' })
      .expect(403);
    await request(app)
      .patch(`/api/admin/units/${randomUUID()}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'maintenance' })
      .expect(404);
    await request(app)
      .patch(`/api/admin/units/${unitId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'broken' })
      .expect(400);

    const futureReservationId = randomUUID();
    const futureLineId = randomUUID();
    await client.query(
      `INSERT INTO reservations (id, client_id, starts_at, ends_at, status, total_ars, created_at)
       VALUES ($1, $2, now() + interval '2 days', now() + interval '3 days', 'confirmed', 300, now())`,
      [futureReservationId, customer.userId],
    );
    await client.query(
      `INSERT INTO reservation_lines (id, reservation_id, equipment_type_id, quantity, hourly_rate_snapshot)
       VALUES ($1, $2, $3, 1, 300)`,
      [futureLineId, futureReservationId, typeId],
    );
    await client.query(
      `INSERT INTO reservation_allocations (id, reservation_line_id, asset_unit_id, occupied_period, assigned_at)
       VALUES ($1, $2, $3, tstzrange(now() + interval '2 days', now() + interval '3 days', '[)'), now())`,
      [randomUUID(), futureLineId, unitId],
    );

    await request(app)
      .patch(`/api/admin/units/${unitId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'maintenance' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('maintenance'));
    const preservedAllocation = await client.query<{ released_at: Date | null }>(
      `SELECT a.released_at
       FROM reservation_allocations a
       WHERE a.reservation_line_id = $1 AND a.asset_unit_id = $2`,
      [futureLineId, unitId],
    );
    expect(preservedAllocation.rows).toHaveLength(1);
    expect(preservedAllocation.rows[0]?.released_at).toBeNull();

    const custodyReservationId = randomUUID();
    const custodyLineId = randomUUID();
    await client.query(
      `INSERT INTO reservations (id, client_id, starts_at, ends_at, status, total_ars, created_at, delivered_at)
       VALUES ($1, $2, now() - interval '1 hour', now() + interval '1 hour', 'delivered', 300, now(), now())`,
      [custodyReservationId, customer.userId],
    );
    await client.query(
      `INSERT INTO reservation_lines (id, reservation_id, equipment_type_id, quantity, hourly_rate_snapshot)
       VALUES ($1, $2, $3, 1, 300)`,
      [custodyLineId, custodyReservationId, typeId],
    );
    await client.query(
      `INSERT INTO reservation_allocations
        (id, reservation_line_id, asset_unit_id, occupied_period, assigned_at, picked_up_at)
       VALUES ($1, $2, $3, tstzrange(now() - interval '1 hour', now() + interval '1 hour', '[)'), now(), now())`,
      [randomUUID(), custodyLineId, unitId],
    );

    await request(app)
      .patch(`/api/admin/units/${unitId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'retired' })
      .expect(409);
  });
});
