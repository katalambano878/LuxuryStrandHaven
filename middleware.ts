import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { jwtVerify } from 'jose';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const usePlainPg = process.env.NEXT_PUBLIC_USE_PLAIN_PG === 'true';

let cachedMaintenance: { value: boolean; at: number } | null = null;
const MAINTENANCE_CACHE_TTL_MS = 15_000;

async function isMaintenanceModeEnabled(): Promise<boolean> {
  const now = Date.now();
  if (cachedMaintenance && now - cachedMaintenance.at < MAINTENANCE_CACHE_TTL_MS) {
    return cachedMaintenance.value;
  }
  try {
    const url = `${supabaseUrl}/rest/v1/store_settings?key=eq.maintenance_mode&select=value&limit=1`;
    const res = await fetch(url, {
      headers: {
        apikey: supabaseAnonKey || 'local-anon-key',
        Authorization: `Bearer ${supabaseAnonKey || 'local-anon-key'}`,
      },
      cache: 'no-store',
    });
    const data: Array<{ value: unknown }> = await res.json();
    const raw = data?.[0]?.value;
    const enabled =
      raw === true ||
      raw === 'true' ||
      (typeof raw === 'string' && raw.replace(/"/g, '').toLowerCase() === 'true');
    cachedMaintenance = { value: enabled, at: now };
    return enabled;
  } catch {
    return false;
  }
}

function extractToken(request: NextRequest): string | undefined {
  let token = request.cookies.get('sb-access-token')?.value;

  if (!token) {
    const projectRef = supabaseUrl?.split('//')[1]?.split('.')[0];
    if (projectRef) {
      token = request.cookies.get(`sb-${projectRef}-auth-token`)?.value;
    }
  }

  if (!token) {
    for (const [name, cookie] of request.cookies) {
      if (name.startsWith('sb-') && (name.endsWith('-auth-token') || name.includes('auth'))) {
        try {
          const parsed = JSON.parse(cookie.value);
          if (Array.isArray(parsed) && parsed[0]) {
            token = parsed[0];
          } else if (typeof parsed === 'object' && parsed.access_token) {
            token = parsed.access_token;
          } else if (typeof parsed === 'string') {
            token = parsed;
          }
        } catch {
          token = cookie.value;
        }
        if (token) break;
      }
    }
  }

  return token;
}

async function verifyPlainPgAdmin(token: string): Promise<{ ok: boolean; userId?: string; role?: string }> {
  const secret =
    process.env.AUTH_JWT_SECRET ||
    process.env.JWT_SECRET ||
    process.env.SUPABASE_JWT_SECRET;
  if (!secret) return { ok: false };

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (payload.typ === 'refresh') return { ok: false };
    const userId = typeof payload.sub === 'string' ? payload.sub : undefined;
    if (!userId) return { ok: false };
    const appMeta = (payload.app_metadata || {}) as { role?: string };
    const role = appMeta.role;
    if (role !== 'admin' && role !== 'staff') return { ok: false };
    return { ok: true, userId, role };
  } catch {
    return { ok: false };
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=()');
  if (request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  if (pathname.startsWith('/admin')) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (pathname === '/admin/login') {
      return response;
    }

    const token = extractToken(request);

    if (!token) {
      const loginUrl = new URL('/admin/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (usePlainPg) {
      const verified = await verifyPlainPgAdmin(token);
      if (!verified.ok) {
        const loginUrl = new URL('/admin/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        loginUrl.searchParams.set('error', 'session_expired');
        return NextResponse.redirect(loginUrl);
      }
      if (verified.userId) response.headers.set('x-user-id', verified.userId);
      if (verified.role) response.headers.set('x-user-role', verified.role);
      return response;
    }

    if (supabaseServiceKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const {
          data: { user },
          error,
        } = await supabase.auth.getUser(token);

        if (error || !user) {
          const loginUrl = new URL('/admin/login', request.url);
          loginUrl.searchParams.set('redirect', pathname);
          loginUrl.searchParams.set('error', 'session_expired');
          return NextResponse.redirect(loginUrl);
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (!profile || (profile.role !== 'admin' && profile.role !== 'staff')) {
          const loginUrl = new URL('/admin/login', request.url);
          loginUrl.searchParams.set('error', 'unauthorized');
          return NextResponse.redirect(loginUrl);
        }

        response.headers.set('x-user-id', user.id);
        response.headers.set('x-user-role', profile.role);
      } catch (err) {
        console.error('[Middleware] Auth check error:', err);
        const loginUrl = new URL('/admin/login', request.url);
        loginUrl.searchParams.set('error', 'session_expired');
        return NextResponse.redirect(loginUrl);
      }
      return response;
    }

    // No way to check the session: fail closed.
    const loginUrl = new URL('/admin/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/rest/') ||
    pathname.startsWith('/auth/v1') ||
    pathname.startsWith('/storage/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname === '/maintenance' ||
    /\.[^/]+$/.test(pathname)
  ) {
    if (pathname.startsWith('/api/')) {
      response.headers.set('Cache-Control', 'no-store');
    }
    return response;
  }

  const inMaintenance = await isMaintenanceModeEnabled();
  if (inMaintenance) {
    // Staff can still browse the store; the check uses the signed session,
    // not a cookie anyone could set.
    const token = extractToken(request);
    const isAdmin = !!token && usePlainPg && (await verifyPlainPgAdmin(token)).ok;
    if (!isAdmin) {
      return NextResponse.redirect(new URL('/maintenance', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
