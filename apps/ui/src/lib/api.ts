import useAuthStore from '../store/authStore';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');
if (!API_URL) throw new Error('VITE_API_URL is not set (add it to your .env file)');

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: Record<string, string[] | undefined>,
  ) {
    super(message);
  }
}

/** Turns anything thrown by apiFetch into a message that is fine to show in a toast. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const firstDetail = e.details && Object.values(e.details).flat()[0];
    return firstDetail ?? e.message;
  }
  // fetch() itself rejects with a TypeError when the server is unreachable / CORS blocks it
  return e instanceof TypeError ? 'Cannot reach the server' : 'Something went wrong';
}

// Auth endpoints must never trigger the refresh-and-retry logic (a 401 from
// /auth/login just means "wrong password", and /auth/refresh failing means we're logged out).
const NO_REFRESH = new Set(['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout']);

let refreshing: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const run = () =>
    fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then((r) => r.ok)
      .catch(() => false);

  // Refresh tokens are single-use, and the refresh cookie is shared by every tab.
  // Two tabs refreshing at the same moment would present the SAME token, and the
  // server would treat the second one as theft and log the user out everywhere.
  // A Web Lock makes tabs take turns: the second tab's request then carries the
  // new cookie the first tab just received.
  return 'locks' in navigator ? navigator.locks.request('auth-refresh', run) : run();
}

/** Single-flight inside this tab: 5 requests failing at once share ONE refresh call. */
export function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

interface Options {
  method?: string;
  body?: unknown;
}

export async function apiFetch<T = unknown>(path: string, options: Options = {}, retry = true): Promise<T> {
  const hasBody = options.body !== undefined;

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? (hasBody ? 'POST' : 'GET'),
    credentials: 'include', // send and accept the httpOnly cookies
    headers: {
      'ngrok-skip-browser-warning': 'true',
      ...(hasBody && { 'Content-Type': 'application/json' })
    }, 
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });

  // Access cookie expired (the browser deletes it, so the server sees "no token"):
  // refresh once, then replay the original request.
  if (res.status === 401 && retry && !NO_REFRESH.has(path)) {
    if (await refreshSession()) return apiFetch<T>(path, options, false);
    useAuthStore.getState().setUser(null); // refresh failed: session is over
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  console.log({data})
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? res.statusText, data?.code, data?.details);
  }
  return data as T;
}