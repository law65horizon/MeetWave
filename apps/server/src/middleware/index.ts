import { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { Socket } from "socket.io";
import cookieParser from "cookie-parser";
import { verifyAccessToken } from "./authenticate";
import { AppRequest } from "../types";
import { getRoom } from "../redis/roomRepository";
import { logger } from "../lib/logger";
import { ACCESS_COOKIE } from "./cookies";
// ADJUST PATH if your auth controller lives elsewhere.
import { findUserById } from "../routes/auth/authController";

export interface AuthenticatedSocket extends Socket {
  data: {
    id: string;
    displayName: string;
    /** Room the handshake was authorised for. The ONLY room this socket may join. */
    requestedRoomId: string;
    /** Set only after a real join. Never set while waiting. */
    roomId?: string;
    /** Set while sitting in the waiting queue. */
    waitingRoomId?: string;
  };
}

export function requireAuth(
  req: AppRequest,
  res: Response,
  next: NextFunction,
) {
  const token = extractToken(req);
  if (!token) {
    // The browser deletes the access cookie when its maxAge passes, so an expired
    // session usually arrives as "no token". The client refreshes on ANY 401.
    return res
      .status(401)
      .json({ error: "Not authenticated", code: "NO_TOKEN" });
  }

  try {
    req.userId = verifyAccessToken(token).sub;
    next();
  } catch (err) {
    const expired = (err as Error).name === "TokenExpiredError";
    return res.status(401).json({
      error: expired ? "Access token expired" : "Invalid access token",
      code: expired ? "TOKEN_EXPIRED" : "TOKEN_INVALID",
    });
  }
}

const parseCookies = cookieParser();

function resolveDisplayName(
  provided: unknown,
  accountName: string | undefined,
  id: string,
): string {
  const clean =
    typeof provided === "string" ? provided.trim().slice(0, 50) : "";
  return clean || accountName?.trim() || `Guest-${id.slice(0, 4)}`;
}

/**
 * Errors are plain Error(code) so the client reads `err.message`:
 * NOT_IN_ROOM | UNAUTHENTICATED | TOKEN_EXPIRED | TOKEN_INVALID | INTERNAL_SERVER_ERROR
 */
export async function socketMiddleware(
  socket: Socket,
  next: (err?: Error) => void,
): Promise<void> {
  try {
    const rawRoomId = socket.handshake.auth?.roomId;
    const demoUserId = socket.handshake.auth?.demoUserId;
    if (typeof rawRoomId !== "string" || !rawRoomId.trim())
      throw new Error("NOT_IN_ROOM");
    const roomId = rawRoomId.toLowerCase().trim();

    await new Promise<void>((resolve) => {
      parseCookies(socket.request as any, {} as any, () => resolve());
    });
    const token = (socket.request as any).cookies?.[ACCESS_COOKIE] as
      string | undefined;

    let userId: string | undefined;
    if (token) {
      try {
        userId = verifyAccessToken(token).sub;
      } catch (err) {
        // Don't silently downgrade a logged-in user to a guest (they would lose host rights).
        // The client should refresh the session and reconnect on TOKEN_EXPIRED.
        throw new Error(
          (err as Error).name === "TokenExpiredError"
            ? "TOKEN_EXPIRED"
            : "TOKEN_INVALID",
        );
      }
    }

    const room = await getRoom(roomId); // may be null: room:join answers ROOM_NOT_FOUND
    if (room?.private && !userId) throw new Error("UNAUTHENTICATED");

    // Look the account name up server-side so we never depend on the client having
    // hydrated its auth store before connecting.
    const accountName = userId ? (await findUserById(userId))?.name : undefined;

    const id = userId ?? demoUserId ?? randomUUID();
    const data = socket.data as AuthenticatedSocket["data"];
    data.id = id;
    data.requestedRoomId = roomId;
    data.displayName = resolveDisplayName(
      socket.handshake.auth?.displayName,
      accountName,
      id,
    );

    next();
  } catch (error: any) {
    logger.warn({ err: error?.message ?? "" }, "Socket auth failed");
    const known = [
      "NOT_IN_ROOM",
      "UNAUTHENTICATED",
      "TOKEN_EXPIRED",
      "TOKEN_INVALID",
    ];
    next(
      new Error(
        known.includes(error?.message)
          ? error.message
          : "INTERNAL_SERVER_ERROR",
      ),
    );
  }
}

function extractToken(req: Request): string | undefined {
  const fromCookie = req.cookies?.[ACCESS_COOKIE];
  if (fromCookie) return fromCookie;
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
}
