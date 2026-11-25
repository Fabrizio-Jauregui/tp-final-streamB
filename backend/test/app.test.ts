import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';

describe('GET /health', () => {
  it('returns a healthy JSON response', async () => {
    await request(createApp())
      .get('/health')
      .expect(200)
      .expect('Content-Type', /application\/json/)
      .expect({ status: 'ok' });
  });
});
