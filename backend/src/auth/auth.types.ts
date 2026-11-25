import type { Client } from 'pg';

export type AuthDatabase = Pick<Client, 'query'>;
export type UserRole = 'client' | 'admin';

export interface PublicUser {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  organization: string | null;
  role: UserRole;
}

export interface AuthenticatedUser extends PublicUser {}

export interface RegisterInput {
  fullName: string;
  email: string;
  emailNormalized: string;
  phone: string;
  password: string;
  organization: string | null;
}

export interface LoginInput {
  emailNormalized: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: PublicUser;
}
