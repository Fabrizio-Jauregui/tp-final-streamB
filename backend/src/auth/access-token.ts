import { SignJWT, jwtVerify } from 'jose';

export interface AccessTokenClaims {
  subject: string;
  tokenId: string;
  expiresAt: number;
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(
  userId: string,
  tokenId: string,
  issuedAt: number,
  expiresAt: number,
  secret: string,
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setJti(tokenId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(secretKey(secret));
}

export async function verifyAccessToken(
  token: string,
  secret: string,
  currentDate: Date,
): Promise<AccessTokenClaims> {
  const { payload, protectedHeader } = await jwtVerify(token, secretKey(secret), {
    algorithms: ['HS256'],
    currentDate,
  });

  if (
    protectedHeader.typ !== 'JWT'
    || typeof payload.sub !== 'string'
    || typeof payload.jti !== 'string'
    || typeof payload.exp !== 'number'
  ) {
    throw new Error('JWT claims are invalid.');
  }

  return { subject: payload.sub, tokenId: payload.jti, expiresAt: payload.exp };
}
