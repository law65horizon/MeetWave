import { CookieOptions, Response } from "express";
import { config } from "../config";
import type { TokenPair } from "./authenticate";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";

const isProd = process.env.NODE_ENV === "production";

// "lax" works when the React app and this API share a registrable domain
// (localhost:5173 + localhost:3000 in dev, app.example.com + api.example.com in prod).
// If they live on completely different domains you need COOKIE_SAMESITE=none
// (which forces `secure`), and then you should also add CSRF protection.
const sameSite = "none";
// const sameSite = (process.env.COOKIE_SAMESITE as "lax" | "strict" | "none" | undefined) ?? "lax";

const base: CookieOptions = {
  httpOnly: true, // JavaScript on the page can never read these
  secure: isProd || sameSite === "none",
  sameSite,
};

// The refresh cookie is scoped to /auth, so the browser only attaches it to
// /auth/refresh and /auth/logout, not to every API request.
// (This assumes the router is mounted at /auth.)
const ACCESS_PATH = "/";
const REFRESH_PATH = "/auth";

export function setAuthCookies(
  res: Response,
  tokens: Pick<TokenPair, "accessToken" | "refreshToken">,
) {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...base,
    path: ACCESS_PATH,
    maxAge: config.TTL_ACCESS_SECRET, // cookie maxAge is in milliseconds
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base,
    path: REFRESH_PATH,
    maxAge: config.TTL_REFRESH_SECRET,
  });
}

export function clearAuthCookies(res: Response) {
  // path/secure/sameSite must match how the cookie was set, or the browser keeps it
  res.clearCookie(ACCESS_COOKIE, { ...base, path: ACCESS_PATH });
  res.clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_PATH });
}
