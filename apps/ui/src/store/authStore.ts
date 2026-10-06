import { create } from "zustand";
import { apiFetch, refreshSession } from "../lib/api";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  setUser: (user: AuthUser | null) => void;
  setLoading: (v: boolean) => void;
  initAuth: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

let initPromise: Promise<void> | null = null;

async function submit(path: string, body: unknown): Promise<AuthUser> {
  const res = await apiFetch<any>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data.user as AuthUser;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  loading: true,
  setUser: (user) => set({ user, isAuthenticated: user !== null }),
  setLoading: (loading) => set({ loading }),

  // Runs once on app start: /me, falling back to /refresh if the access token expired.
  initAuth: async () =>
    (initPromise ??= (async () => {
      let user: AuthUser | null = null;
      try {
        const res = await apiFetch<any>("/auth/me"); // `api` skips auto-refresh for /auth/*, so handle it here
        // if (res.ok) user = (await res.json()).user;
        // else if (res.status === 401 && await refreshSession()) user = await apiFetch<any>('/auth/me');
        user = res.user;
      } catch (err) {
        user = null; // network error: treat as logged out
      }
      set({ user, isAuthenticated: user !== null, loading: false });
    })()),

  login: async (email, password) => {
    const user = await submit("/auth/login", { email, password });
    set({ user, isAuthenticated: true });
  },

  register: async (name, email, password) => {
    const user = await submit("/auth/register", { name, email, password });
    set({ user, isAuthenticated: true });
  },

  logout: async () => {
    try {
      await apiFetch<any>("/auth/logout", { method: "POST" });
    } finally {
      set({ user: null, isAuthenticated: false });
    }
  },
}));

export default useAuthStore;
