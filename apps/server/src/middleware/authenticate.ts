import jwt, { JwtPayload } from "jsonwebtoken";
import { randomUUID } from "crypto";
import { redis } from "../redis/client";
import { config } from "../config";
import { AppError } from "../lib/error";

/**
 * Redis layout for refresh tokens:
 *   refresh:{jti}          -> userId   (TTL = refresh lifetime; existence = "still valid")
 *   user:{userId}:refresh  -> set of jtis (lets us revoke every session for a user)
 */

const refreshKey = (jti: string) => `refresh:${jti}`;
const userSessionsKey = (userId: string) => `user:${userId}:refresh`;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // access token lifetime in seconds
}

export class InvalidRefreshTokenError extends Error {
  constructor(message = "Invalid refresh token") {
    super(message);
  }
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.JWT_ACCESS_SECRET, {
    expiresIn: config.TTL_ACCESS_SECRET,
  });
}

export function verifyAccessToken(token: string): JwtPayload & { sub: string } {
  try {
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET, {
      algorithms: ["HS256"],
    });
    if (typeof payload === "string" || !payload.sub) throw new Error("Malformed token");
    return payload as JwtPayload & { sub: string }
  } catch (error) {
    throw new AppError('UNAUTHORIZED', 'Invalid or expired token', 401)
  };
}

async function issueRefreshToken(userId: string): Promise<string> {
  const jti = randomUUID();
  const token = jwt.sign({ sub: userId, jti }, config.JWT_REFRESH_SECRET, {
    expiresIn: config.TTL_REFRESH_SECRET,
  });

  // MULTI/EXEC: all three commands run as one transaction
  await redis
    .multi()
    .set(refreshKey(jti), userId, { EX: config.TTL_REFRESH_SECRET })
    .sAdd(userSessionsKey(userId), jti)
    .expire(userSessionsKey(userId), config.TTL_REFRESH_SECRET)
    .exec();

  return token;
}

export async function issueTokenPair(userId: string): Promise<TokenPair> {
  return {
    accessToken: signAccessToken(userId),
    refreshToken: await issueRefreshToken(userId),
    expiresIn: config.TTL_ACCESS_SECRET,
  };
}

function decodeRefresh(token: string): { sub: string; jti: string } {
  try {
    const p = jwt.verify(token, config.JWT_REFRESH_SECRET, { algorithms: ["HS256"] });
    if (typeof p === "string" || !p.sub || !p.jti) throw new Error();
    return { sub: p.sub, jti: p.jti };
  } catch {
    throw new InvalidRefreshTokenError();
  }
}

/**
 * Refresh-token ROTATION: every refresh token is single-use.
 * 1. Verify the signature/expiry.
 * 2. DEL refresh:{jti}. DEL returns how many keys it removed, so it doubles as
 *    an atomic "claim": only one concurrent request can get 1.
 * 3. If it returned 0, the token was already used (or revoked). A legitimate
 *    client never does that, so assume theft and kill all of the user's sessions.
 */
export async function rotateRefreshToken(token: string): Promise<TokenPair & { userId: string }> {
  const { sub: userId, jti } = decodeRefresh(token);

  const removed = await redis.del(refreshKey(jti));
  if (removed === 0) {
    await revokeAllSessions(userId);
    throw new InvalidRefreshTokenError("Refresh token reuse detected");
  }
  await redis.sRem(userSessionsKey(userId), jti);

  const pair = await issueTokenPair(userId);
  return { ...pair, userId };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  try {
    const { sub, jti } = decodeRefresh(token);
    await redis.multi().del(refreshKey(jti)).sRem(userSessionsKey(sub), jti).exec();
  } catch {
    // Already invalid or expired: nothing to revoke, logout still succeeds.
  }
}

export async function revokeAllSessions(userId: string): Promise<void> {
  const jtis = await redis.sMembers(userSessionsKey(userId));
  const multi = redis.multi();
  for (const jti of jtis) multi.del(refreshKey(jti));
  multi.del(userSessionsKey(userId));
  await multi.exec();
}