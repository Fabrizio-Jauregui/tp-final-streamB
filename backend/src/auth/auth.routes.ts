import { Router, type Request } from 'express';
import { ApiError } from '../http/api-error.ts';
import type { Clock } from '../time/clock.ts';
import { requireAuth } from './auth.middleware.ts';
import { AuthService } from './auth.service.ts';
import type { LoginInput, RegisterInput } from './auth.types.ts';

const registrationKeys = new Set(['fullName', 'email', 'phone', 'password', 'organization']);
const loginKeys = new Set(['email', 'password']);

function recordBody(request: Request): Record<string, unknown> {
  const body: unknown = request.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ApiError(400, 'invalid_input', 'El cuerpo debe ser un objeto JSON.');
  }
  return body as Record<string, unknown>;
}

function rejectUnknownKeys(body: Record<string, unknown>, allowed: Set<string>): void {
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    throw new ApiError(400, 'invalid_input', 'El cuerpo contiene campos no permitidos.');
  }
}

function requiredString(body: Record<string, unknown>, key: string, maxLength: number): string {
  const value = body[key];
  if (typeof value !== 'string') {
    throw new ApiError(400, 'invalid_input', `El campo ${key} es obligatorio.`);
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    throw new ApiError(400, 'invalid_input', `El campo ${key} no tiene un formato válido.`);
  }
  return trimmed;
}

function emailAddress(body: Record<string, unknown>): { email: string; emailNormalized: string } {
  const email = requiredString(body, 'email', 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, 'invalid_input', 'El email no tiene un formato válido.');
  }
  return { email, emailNormalized: email.toLowerCase() };
}

function registrationInput(request: Request): RegisterInput {
  const body = recordBody(request);
  rejectUnknownKeys(body, registrationKeys);
  const fullName = requiredString(body, 'fullName', 120);
  const email = emailAddress(body);
  const phone = requiredString(body, 'phone', 32);
  const password = body.password;
  if (typeof password !== 'string' || password.length < 1 || password.length > 1024) {
    throw new ApiError(400, 'invalid_input', 'La contraseña no tiene un formato válido.');
  }

  let organization: string | null = null;
  if (body.organization !== undefined && body.organization !== null) {
    if (typeof body.organization !== 'string' || body.organization.trim().length > 160) {
      throw new ApiError(400, 'invalid_input', 'La organización no tiene un formato válido.');
    }
    organization = body.organization.trim() || null;
  }

  return { fullName, email: email.email, emailNormalized: email.emailNormalized, phone, password, organization };
}

function loginInput(request: Request): LoginInput {
  const body = recordBody(request);
  rejectUnknownKeys(body, loginKeys);
  const { emailNormalized } = emailAddress(body);
  const password = body.password;
  if (typeof password !== 'string' || password.length < 1 || password.length > 1024) {
    throw new ApiError(400, 'invalid_input', 'La contraseña no tiene un formato válido.');
  }
  return { emailNormalized, password };
}

export function createAuthRouter(service: AuthService, accessTokenSecret: string, clock: Clock): Router {
  const router = Router();
  router.post('/register', async (request, response) => {
    const user = await service.register(registrationInput(request));
    response.status(201).json(user);
  });

  router.post('/login', async (request, response) => {
    const result = await service.login(loginInput(request));
    response.status(200).json(result);
  });

  router.post('/logout', requireAuth(service.database, accessTokenSecret, clock), async (_request, response) => {
    await service.revokeSession(response.locals.authSession.tokenId as string);
    response.status(204).end();
  });

  return router;
}
