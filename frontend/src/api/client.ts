import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  withCredentials: true,
});

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function ensureCsrf() {
  const existing = readCookie('csrf_token');
  if (existing) return existing;
  const { data } = await api.get<{ csrfToken: string }>('/auth/csrf');
  return data.csrfToken;
}

api.interceptors.request.use(async (config) => {
  const method = (config.method || 'get').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const token = readCookie('csrf_token') || (await ensureCsrf());
    config.headers['X-CSRF-Token'] = token;
  }
  return config;
});

/** Strip sensitive fields if backend ever returns them */
export function sanitizeUser<T extends Record<string, unknown>>(user: T) {
  const {
    password,
    passwordHash,
    password_hash,
    token,
    accessToken,
    access_token,
    ...safe
  } = user as Record<string, unknown>;
  void password;
  void passwordHash;
  void password_hash;
  void token;
  void accessToken;
  void access_token;
  return safe as T;
}

export default api;
