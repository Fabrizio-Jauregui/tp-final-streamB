import { randomUUID } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import { ApiError } from '../http/api-error.ts';
import { systemClock, type Clock } from '../time/clock.ts';
import { signAccessToken } from './access-token.ts';
import { hashPassword, verifyPassword } from './password.ts';
import type { AuthDatabase, LoginInput, LoginResult, PublicUser, RegisterInput } from './auth.types.ts';

interface UserRow extends QueryResultRow {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  organization: string | null;
  password_hash?: string;
  role: 'client' | 'admin';
  is_active?: boolean;
}

export const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 8 * 60 * 60;

export class AuthService {
  readonly database: AuthDatabase;
  readonly accessTokenTtlSeconds: number;
  private readonly accessTokenSecret: string;
  private readonly clock: Clock;

  constructor(
    database: AuthDatabase,
    accessTokenSecret: string,
    accessTokenTtlSeconds = DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
    clock: Clock = systemClock,
  ) {
    this.database = database;
    this.accessTokenSecret = accessTokenSecret;
    this.accessTokenTtlSeconds = accessTokenTtlSeconds;
    this.clock = clock;
    if (Buffer.byteLength(accessTokenSecret, 'utf8') < 32) {
      throw new Error('ACCESS_TOKEN_SECRET debe contener al menos 32 bytes.');
    }
    if (!Number.isSafeInteger(accessTokenTtlSeconds) || accessTokenTtlSeconds <= 0) {
      throw new Error('ACCESS_TOKEN_TTL debe ser un entero positivo en segundos.');
    }
  }

  async register(input: RegisterInput): Promise<PublicUser> {
    const duplicate = await this.database.query<{ id: string }>(
      'SELECT id FROM users WHERE email_normalized = $1',
      [input.emailNormalized],
    );
    if (duplicate.rows.length > 0) {
      throw new ApiError(409, 'email_already_registered', 'Ya existe una cuenta con ese email.');
    }

    const passwordHash = await hashPassword(input.password);
    const id = randomUUID();

    try {
      const result = await this.database.query<UserRow>(
        `INSERT INTO users
          (id, full_name, email, email_normalized, phone, organization, password_hash, role, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'client', TRUE, $8)
         RETURNING id, full_name, email, phone, organization, role`,
        [id, input.fullName, input.email, input.emailNormalized, input.phone, input.organization, passwordHash, this.clock.now()],
      );
      return this.toPublicUser(result.rows[0]!);
    } catch (error) {
      if (this.postgresCode(error) === '23505') {
        throw new ApiError(409, 'email_already_registered', 'Ya existe una cuenta con ese email.');
      }
      throw error;
    }
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const result = await this.database.query<UserRow>(
      `SELECT id, full_name, email, phone, organization, password_hash, role, is_active
       FROM users WHERE email_normalized = $1`,
      [input.emailNormalized],
    );
    const user = result.rows[0];
    const passwordMatches = user?.password_hash
      ? await verifyPassword(user.password_hash, input.password)
      : false;
    if (!user || !user.is_active || !passwordMatches) {
      throw new ApiError(401, 'invalid_credentials', 'Email o contraseña incorrectos.');
    }

    const now = this.clock.now();
    const issuedAt = Math.floor(now.getTime() / 1000);
    const expiresAt = issuedAt + this.accessTokenTtlSeconds;
    const tokenId = randomUUID();
    await this.database.query(
      `INSERT INTO auth_sessions (id, user_id, token_id, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), user.id, tokenId, now, new Date(expiresAt * 1000)],
    );

    return {
      accessToken: await signAccessToken(user.id, tokenId, issuedAt, expiresAt, this.accessTokenSecret),
      tokenType: 'Bearer',
      expiresIn: this.accessTokenTtlSeconds,
      user: this.toPublicUser(user),
    };
  }

  async revokeSession(tokenId: string): Promise<void> {
    await this.database.query(
      'UPDATE auth_sessions SET revoked_at = $2 WHERE token_id = $1 AND revoked_at IS NULL',
      [tokenId, this.clock.now()],
    );
  }

  private toPublicUser(user: UserRow): PublicUser {
    return {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      phone: user.phone,
      organization: user.organization,
      role: user.role,
    };
  }

  private postgresCode(error: unknown): string | undefined {
    return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : undefined;
  }
}
