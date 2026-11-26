import type { Request, RequestHandler } from 'express';
import type { QueryResultRow } from 'pg';
import { ApiError, sendApiError } from '../http/api-error.ts';
import { systemClock, type Clock } from '../time/clock.ts';
import { verifyAccessToken } from './access-token.ts';
import type { AuthDatabase, AuthenticatedUser, UserRole } from './auth.types.ts';

interface AuthUserRow extends QueryResultRow {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  organization: string | null;
  role: UserRole;
}

function unauthorized(response: Parameters<RequestHandler>[1]): void {
  sendApiError(response, new ApiError(401, 'unauthorized', 'Se requiere una sesión válida.'));
}

export function requireAuth(
  database: AuthDatabase,
  accessTokenSecret: string,
  clock: Clock = systemClock,
): RequestHandler {
  return async (request, response, next) => {
    const authorization = request.header('authorization');
    const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
    if (!match) {
      unauthorized(response);
      return;
    }

    let claims;
    const currentTime = clock.now();
    try {
      claims = await verifyAccessToken(match[1]!, accessTokenSecret, currentTime);
    } catch {
      unauthorized(response);
      return;
    }

    try {
      const result = await database.query<AuthUserRow>(
        `SELECT u.id, u.full_name, u.email, u.phone, u.organization, u.role
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_id = $1
           AND s.user_id = $2
           AND s.revoked_at IS NULL
           AND s.expires_at > $3
           AND u.is_active = TRUE`,
        [claims.tokenId, claims.subject, currentTime],
      );
      const row = result.rows[0];
      if (!row) {
        unauthorized(response);
        return;
      }

      const user: AuthenticatedUser = {
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        phone: row.phone,
        organization: row.organization,
        role: row.role,
      };
      response.locals.authUser = user;
      response.locals.authSession = { tokenId: claims.tokenId, expiresAt: claims.expiresAt };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(requiredRole: UserRole): RequestHandler {
  return (_request, response, next) => {
    const user = response.locals.authUser as AuthenticatedUser | undefined;
    if (!user) {
      unauthorized(response);
      return;
    }
    if (user.role !== requiredRole) {
      sendApiError(response, new ApiError(403, 'forbidden', 'No tienes permiso para realizar esta acción.'));
      return;
    }
    next();
  };
}

export function requireOwnerOrAdmin(resolveOwnerId: (request: Request) => string | null | Promise<string | null>): RequestHandler {
  return async (request, response, next) => {
    const user = response.locals.authUser as AuthenticatedUser | undefined;
    if (!user) {
      unauthorized(response);
      return;
    }
    if (user.role === 'admin') {
      next();
      return;
    }

    try {
      const ownerId = await resolveOwnerId(request);
      if (ownerId !== user.id) {
        sendApiError(response, new ApiError(404, 'not_found', 'No se encontró el recurso solicitado.'));
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
