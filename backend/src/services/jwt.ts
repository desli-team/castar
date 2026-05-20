/**
 * Castar — JWT Service
 * Signs and verifies JWT tokens using jose library.
 */

import { SignJWT, jwtVerify } from 'jose';
import type { JwtPayload } from '../types';

const TOKEN_EXPIRY = '30d';

/** Sign a JWT for the given userId */
export async function signJwt(userId: string, secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(key);
}

/** Verify a JWT and return the payload. Throws on invalid/expired. */
export async function verifyJwt(token: string, secret: string): Promise<JwtPayload> {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key);
  return payload as unknown as JwtPayload;
}
