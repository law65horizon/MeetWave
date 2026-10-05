import { randomUUID } from "crypto";
import { redis } from "../../redis/client";

/**
 * Redis layout:
 *   user:{id}            -> hash { id, name, email, passwordHash }
 *   user:email:{email}   -> id   (unique index, written with NX)
 */

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
}

export class EmailTakenError extends Error {
  constructor() {
    super("Email already registered");
  }
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const userKey = (id: string) => `user:${id}`;
const emailKey = (email: string) => `user:email:${email}`;

export async function createUser(input: {
  name: string;
  email: string;
  passwordHash: string;
}): Promise<User> {
  const email = normalizeEmail(input.email);
  const id = randomUUID();

  // NX = only set if it doesn't exist. This is the atomic uniqueness check,
  // so two simultaneous signups with the same email can't both succeed.
  // node-redis returns "OK" on success and null when the key already existed.
  const claimed = await redis.set(emailKey(email), id, { NX: true });
  if (claimed === null) throw new EmailTakenError();

  const user: User = { id, name: input.name.trim(), email, passwordHash: input.passwordHash };
  try {
    await redis.hSet(userKey(id), { ...user });
  } catch (err) {
    await redis.del(emailKey(email)); // release the email if the write failed
    throw err;
  }
  return user;
}

export async function findUserById(id: string): Promise<User | null> {
  const data = await redis.hGetAll(userKey(id));
  return data && data.id ? (data as unknown as User) : null;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const id = await redis.get(emailKey(normalizeEmail(email)));
  return id ? findUserById(id) : null;
}