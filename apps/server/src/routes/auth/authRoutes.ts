import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { createUser, EmailTakenError, findUserByEmail, findUserById } from "./authController";
import {
  InvalidRefreshTokenError,
  issueTokenPair,
  revokeAllSessions,
  revokeRefreshToken,
  rotateRefreshToken,
} from "../../middleware/authenticate";
import { requireAuth } from "../../middleware/index";
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from "../../middleware/cookies";
import { AppRequest } from "../../types";

export const authRouter: Router = Router();

const BCRYPT_ROUNDS = 12;

// Compared against when the email doesn't exist, so login takes the same time
// whether or not the account exists (prevents user enumeration via timing).
const DUMMY_HASH = bcrypt.hashSync("dummy-password", BCRYPT_ROUNDS);

const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(72), // bcrypt ignores bytes past 72
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const publicUser = (u: { id: string; name: string; email: string }) => ({
  id: u.id,
  name: u.name,
  email: u.email,
});

// Tokens now travel ONLY in httpOnly cookies, never in the JSON body.

authRouter.post("/register", async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors });
    }
    const { name, email, password } = parsed.data;

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await createUser({ name, email, passwordHash });

    setAuthCookies(res, await issueTokenPair(user.id));
    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    if (err instanceof EmailTakenError) {
      return res.status(409).json({ error: "Email already registered" });
    }
    next(err);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
    const { email, password } = parsed.data;

    const user = await findUserByEmail(email);
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    setAuthCookies(res, await issueTokenPair(user.id));
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    const { userId, ...tokens } = await rotateRefreshToken(token);

    // Don't mint tokens for a deleted account
    const user = await findUserById(userId);
    if (!user) {
      await revokeAllSessions(userId);
      clearAuthCookies(res);
      return res.status(401).json({ error: "User no longer exists" });
    }

    setAuthCookies(res, tokens);
    res.json({ user: publicUser(user) });
  } catch (err) {
    if (err instanceof InvalidRefreshTokenError) {
      clearAuthCookies(res);
      return res.status(401).json({ error: err.message });
    }
    next(err);
  }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) await revokeRefreshToken(token);
    clearAuthCookies(res);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", requireAuth, async (req: AppRequest, res, next) => {
  try {
    const user = await findUserById(req.userId!);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});