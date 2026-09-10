import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A minimal localStorage for the node test environment.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function load() {
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'key');
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'proj');
  return import('./firebaseAuth');
}

describe('firebaseAuth', () => {
  it('signs in, persists the session and reports it', async () => {
    const auth = await load();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ localId: 'u1', email: 'a@b.c', idToken: 'id1', refreshToken: 'r1', expiresIn: '3600' }), { status: 200 })),
    );
    const listener = vi.fn();
    auth.onAuthChange(listener);
    const s = await auth.signIn('a@b.c', 'pw');
    expect(s.uid).toBe('u1');
    expect(auth.isSignedIn()).toBe(true);
    expect(JSON.parse(store.get('daily-tracker:auth')!).refreshToken).toBe('r1');
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u1' }));
    expect(await auth.getIdToken()).toBe('id1');
  });

  it('maps Firebase error codes to Turkish messages', async () => {
    const auth = await load();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'INVALID_LOGIN_CREDENTIALS' } }), { status: 400 })));
    await expect(auth.signIn('a@b.c', 'bad')).rejects.toThrow('E-posta veya şifre hatalı.');
    expect(auth.isSignedIn()).toBe(false);
  });

  it('refreshes an expired token once and signs out when the refresh token is rejected', async () => {
    const auth = await load();
    store.set('daily-tracker:auth', JSON.stringify({ uid: 'u1', email: 'a@b.c', idToken: 'old', refreshToken: 'r1', expiresAt: Date.now() - 1000 }));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id_token: 'new', refresh_token: 'r2', expires_in: '3600', user_id: 'u1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await auth.getIdToken()).toBe('new');
    expect(await auth.getIdToken()).toBe('new'); // cached, no second call
    expect(fetchMock).toHaveBeenCalledTimes(1);

    store.set('daily-tracker:auth', JSON.stringify({ uid: 'u1', email: 'a@b.c', idToken: 'x', refreshToken: 'r1', expiresAt: 0 }));
    const auth2 = await (async () => { vi.resetModules(); return load(); })();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'TOKEN_EXPIRED' } }), { status: 400 })));
    await expect(auth2.getIdToken()).rejects.toThrow('Oturum süresi doldu');
    expect(auth2.isSignedIn()).toBe(false);
  });

  it('keeps the session on a network failure during refresh', async () => {
    const auth = await load();
    store.set('daily-tracker:auth', JSON.stringify({ uid: 'u1', email: 'a@b.c', idToken: 'x', refreshToken: 'r1', expiresAt: 0 }));
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await expect(auth.getIdToken()).rejects.toThrow('ulaşılamadı');
    expect(auth.isSignedIn()).toBe(true);
  });
});
