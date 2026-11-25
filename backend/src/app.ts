import express, { type Express } from 'express';
import { createAuthRouter } from './auth/auth.routes.ts';
import { AuthService, DEFAULT_ACCESS_TOKEN_TTL_SECONDS } from './auth/auth.service.ts';
import type { AuthDatabase } from './auth/auth.types.ts';
import { errorHandler, notFoundHandler } from './http/api-error.ts';

export interface AppOptions {
  database: AuthDatabase;
  accessTokenSecret: string;
  accessTokenTtlSeconds?: number;
  now?: () => Date;
}

export function createApp(options?: AppOptions): Express {
  const app = express();
  app.use(express.json({ limit: '16kb' }));

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  if (options) {
    if (!options.database || !options.accessTokenSecret) {
      throw new Error('database y ACCESS_TOKEN_SECRET son obligatorios para habilitar autenticación.');
    }
    const now = options.now ?? (() => new Date());
    const service = new AuthService(
      options.database,
      options.accessTokenSecret,
      options.accessTokenTtlSeconds ?? DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
      now,
    );
    app.use('/api/auth', createAuthRouter(service, options.accessTokenSecret, now));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
