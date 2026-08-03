/**
 * Supabase auth for Playwright — supports password or service-role magic link (CI/prod verify).
 */
export type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
  user?: unknown;
};

function supabaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SMOKE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  ).replace(/\/$/, '');
}

function supabaseAnon(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SMOKE_SUPABASE_ANON_KEY || '';
}

function projectRef(url: string): string {
  try {
    return new URL(url).hostname.split('.')[0] || 'project';
  } catch {
    return 'project';
  }
}

export function getE2eEmail(): string {
  return (process.env.E2E_TEST_EMAIL || process.env.SMOKE_TEST_EMAIL || '').trim();
}

export function hasE2eAuth(): boolean {
  const email = getE2eEmail();
  const password = (process.env.E2E_TEST_PASSWORD || process.env.SMOKE_TEST_PASSWORD || '').trim();
  const serviceRole = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return Boolean(email && (password || serviceRole));
}

export async function fetchSupabaseSession(): Promise<SupabaseSession | null> {
  const email = getE2eEmail();
  const password = (process.env.E2E_TEST_PASSWORD || process.env.SMOKE_TEST_PASSWORD || '').trim();
  const url = supabaseUrl();
  const anon = supabaseAnon();
  const serviceRole = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!email || !url || !anon) return null;

  if (password) {
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as SupabaseSession;
    return body.access_token ? body : null;
  }

  if (!serviceRole) return null;

  const adminHeaders = {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    'Content-Type': 'application/json',
  };

  const link = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  const tokenHash = (await link.json()) as { hashed_token?: string };
  if (!link.ok || !tokenHash.hashed_token) return null;

  const verify = await fetch(`${url}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash.hashed_token }),
  });
  if (!verify.ok) return null;
  const body = (await verify.json()) as SupabaseSession;
  return body.access_token ? body : null;
}

/** Inject Supabase SSR session cookies + localStorage for dashboard middleware. */
export async function injectSupabaseSession(
  page: import('@playwright/test').Page,
  session: SupabaseSession,
  origin: string
) {
  const url = supabaseUrl();
  const ref = projectRef(url);
  const storageKey = `sb-${ref}-auth-token`;
  const payload = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at ?? Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600),
    expires_in: session.expires_in ?? 3600,
    token_type: session.token_type ?? 'bearer',
    user: session.user ?? null,
  };

  const host = new URL(origin).hostname;
  const cookieDomain = host.startsWith('www.') ? host.slice(4) : host;

  await page.context().addCookies([
    {
      name: storageKey,
      value: encodeURIComponent(JSON.stringify(payload)),
      domain: cookieDomain.startsWith('.') ? cookieDomain : `.${cookieDomain}`,
      path: '/',
      httpOnly: false,
      secure: origin.startsWith('https'),
      sameSite: 'Lax',
    },
  ]);

  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ({ key, data }) => {
      localStorage.setItem(key, JSON.stringify(data));
    },
    { key: storageKey, data: payload }
  );
}
