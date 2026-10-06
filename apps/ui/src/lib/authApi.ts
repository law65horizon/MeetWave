import { apiFetch } from "./api";
import useAuthStore, { type AuthUser } from "../store/authStore";

interface UserResponse {
  user: AuthUser;
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthUser> {
  const { user } = await apiFetch<UserResponse>("/auth/register", {
    body: input,
  });
  useAuthStore.getState().setUser(user);
  return user;
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<AuthUser> {
  const { user } = await apiFetch<UserResponse>("/auth/login", { body: input });
  useAuthStore.getState().setUser(user);
  return user;
}

export async function logout(): Promise<void> {
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } finally {
    // Even if the request fails, the user asked to sign out
    useAuthStore.getState().setUser(null);
  }
}

/**
 * Replaces the old Firebase onAuthStateChanged listener. Call once at startup (main.tsx).
 * If the access cookie expired, apiFetch silently refreshes and retries this call.
 */
export async function initAuth(): Promise<void> {
  const { setUser, setLoading } = useAuthStore.getState();
  try {
    const { user } = await apiFetch<UserResponse>("/auth/me");
    setUser(user);
  } catch {
    setUser(null);
  } finally {
    setLoading(false);
  }
}
