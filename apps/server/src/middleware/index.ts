import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "./authenticate";
import { AppRequest } from "../types";
import { Socket } from "socket.io";
import { getRoom } from "../redis/roomRepository";
import { logger } from "../lib/logger";
import { AppError } from "../lib/error";
import { ACCESS_COOKIE } from "./cookies";
import cookieParser from "cookie-parser";


export interface AuthenticatedSocket extends Socket {
  data: {
    id: string;
    roomId?: string
    displayName: string
  };
}


export function requireAuth(req: AppRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    // Note: the browser deletes the access cookie when its maxAge passes, so an
    // expired session usually arrives here as "no token", not as "expired token".
    // The client therefore refreshes on ANY 401.
    return res.status(401).json({ error: "Not authenticated", code: "NO_TOKEN" });
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
 
const parseCookies = cookieParser()
export async function socketMiddleware(socket: Socket, next: (err?: Error) => void): Promise<void> {
//   const token = socket.handshake.auth?.token as string | undefined;
  try {
    const roomId = socket.handshake.auth?.roomId as string | undefined;
    const displayName = socket.handshake.auth?.displayName as string | undefined;
   
    await new Promise<void>((resolve) => {
      parseCookies(socket.request as any, {} as any, () => resolve());
    });
  
    const reqWithCookies = socket.request as any;
    const token = reqWithCookies.cookies?.access_token as string | undefined;
    console.log({roomId, token, displayName})
    if (!roomId) {
      throw new AppError('Forbidden', 'NOT_IN_ROOM')
    }
    const meta = await getRoom(roomId)
    // console.log({meta})
  
    if (meta?.private) {
        if (!token) {
         throw new AppError('UNAUTHENTICATED', 'Unauthenticated', 401)
       }
      const verify = verifyAccessToken(token)
          socket.data.id = verify.sub;
          next()
    } else {
      if (token) {
      const verify = verifyAccessToken(token)
          socket.data.id = verify.sub;
          socket.data.displayName = displayName
          next()
      } else {
        const uid = crypto.randomUUID()
        socket.data.id = uid
        socket.data.displayName = displayName
        next()
      }
    }
  } catch (error: any) {
    logger.warn({ err: error?.message ?? '' }, 'Token verification failed');
    if (error instanceof AppError) {
        return next(new Error(`${error.code}: ${error.message}`))
    }
    next(new Error('INTERNAL_SERVER_ERROR'))
  }
}

function extractToken(req: Request): string | undefined {
  // Browser clients send the httpOnly cookie automatically.
  const fromCookie = req.cookies?.[ACCESS_COOKIE];
  if (fromCookie) return fromCookie;
 
  // Non-browser clients (e.g. your React Native app) can still use a bearer header.
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
}
