/**
 * Firebase Authentication (Email/Password) via the Identity Toolkit REST API.
 * The session (uid, tokens) is persisted in localStorage so the installed PWA
 * stays signed in; the ID token is refreshed automatically when it expires.
 */
import { CLOUD_CONFIGURED, FIREBASE_API_KEY, IDENTITY_TOOLKIT_URL, SECURE_TOKEN_URL } from './config';

const LS_KEY = 'daily-tracker:auth';
const REQUEST_TIMEOUT_MS = 20_000;

export interface AuthSession {
  uid: string;
  email: string;
  idToken: string;
  refreshToken: string;
  /** Epoch ms when idToken expires. */
  expiresAt: number;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

type Listener = (session: AuthSession | null) => void;
const listeners = new Set<Listener>();
let cached: AuthSession | null | undefined;
let refreshing: Promise<AuthSession> | null = null;

function read(): AuthSession | null {
  if (cached !== undefined) return cached;
  try {
    const raw = localStorage.getItem(LS_KEY);
    const parsed = raw ? (JSON.parse(raw) as AuthSession) : null;
    cached =
      parsed && typeof parsed.uid === 'string' && typeof parsed.refreshToken === 'string' && typeof parsed.idToken === 'string'
        ? parsed
        : null;
  } catch {
    cached = null;
  }
  return cached;
}

function write(session: AuthSession | null): void {
  cached = session;
  try {
    if (session) localStorage.setItem(LS_KEY, JSON.stringify(session));
    else localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
  for (const l of listeners) l(session);
}

export function getSession(): AuthSession | null {
  return read();
}

export function isSignedIn(): boolean {
  return read() !== null;
}

export function onAuthChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function mapAuthError(code: string): string {
  const c = code.split(' ')[0].split(':')[0];
  switch (c) {
    case 'INVALID_LOGIN_CREDENTIALS':
    case 'INVALID_PASSWORD':
    case 'EMAIL_NOT_FOUND':
    case 'INVALID_EMAIL':
      return 'E-posta veya şifre hatalı.';
    case 'USER_DISABLED':
      return 'Bu hesap devre dışı bırakılmış.';
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
      return 'Çok fazla deneme yapıldı. Biraz sonra tekrar deneyin.';
    case 'TOKEN_EXPIRED':
    case 'INVALID_REFRESH_TOKEN':
    case 'USER_NOT_FOUND':
      return 'Oturum süresi doldu. Lütfen tekrar giriş yapın.';
    case 'OPERATION_NOT_ALLOWED':
      return 'E-posta/şifre girişi Firebase projesinde etkin değil.';
    case 'API_KEY_INVALID':
    case 'API':
      return 'Firebase API anahtarı geçersiz.';
    default:
      return `Giriş başarısız (${c || 'bilinmeyen hata'}).`;
  }
}

async function post(url: string, body: BodyInit, contentType: string): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': contentType }, body, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw new AuthError('Giriş isteği zaman aşımına uğradı.', 'TIMEOUT');
    throw new AuthError('Firebase sunucusuna ulaşılamadı.', 'NETWORK');
  } finally {
    clearTimeout(timer);
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    throw new AuthError('Beklenmeyen sunucu yanıtı.', 'INVALID_RESPONSE');
  }
  const obj = (json ?? {}) as Record<string, unknown>;
  if (!res.ok) {
    const err = obj.error as { message?: string } | undefined;
    const code = err?.message ?? `HTTP_${res.status}`;
    throw new AuthError(mapAuthError(code), code);
  }
  return obj;
}

export async function signIn(email: string, password: string): Promise<AuthSession> {
  if (!CLOUD_CONFIGURED) throw new AuthError('Bulut senkronizasyonu yapılandırılmadı.', 'UNCONFIGURED');
  const data = await post(
    `${IDENTITY_TOOLKIT_URL}/accounts:signInWithPassword?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    JSON.stringify({ email: email.trim(), password, returnSecureToken: true }),
    'application/json',
  );
  const session: AuthSession = {
    uid: String(data.localId ?? ''),
    email: String(data.email ?? email.trim()),
    idToken: String(data.idToken ?? ''),
    refreshToken: String(data.refreshToken ?? ''),
    expiresAt: Date.now() + Number(data.expiresIn ?? 3600) * 1000,
  };
  if (!session.uid || !session.idToken || !session.refreshToken) throw new AuthError('Beklenmeyen giriş yanıtı.', 'INVALID_RESPONSE');
  write(session);
  return session;
}

export function signOut(): void {
  write(null);
}

async function refresh(session: AuthSession): Promise<AuthSession> {
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.refreshToken });
  try {
    const data = await post(`${SECURE_TOKEN_URL}/token?key=${encodeURIComponent(FIREBASE_API_KEY)}`, body, 'application/x-www-form-urlencoded');
    const next: AuthSession = {
      uid: String(data.user_id ?? session.uid),
      email: session.email,
      idToken: String(data.id_token ?? ''),
      refreshToken: String(data.refresh_token ?? session.refreshToken),
      expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
    };
    if (!next.idToken) throw new AuthError('Beklenmeyen yenileme yanıtı.', 'INVALID_RESPONSE');
    write(next);
    return next;
  } catch (err) {
    // A rejected refresh token means the session is gone for good; network errors are transient.
    if (err instanceof AuthError && err.code !== 'NETWORK' && err.code !== 'TIMEOUT') write(null);
    throw err;
  }
}

/** Returns a valid ID token, refreshing it when it is about to expire. */
export async function getIdToken(force = false): Promise<string> {
  const session = read();
  if (!session) throw new AuthError('Giriş yapılmadı.', 'SIGNED_OUT');
  if (!force && session.expiresAt - 60_000 > Date.now()) return session.idToken;
  if (!refreshing) refreshing = refresh(session).finally(() => (refreshing = null));
  return (await refreshing).idToken;
}
