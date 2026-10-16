import { supabaseAdmin } from './supabase-admin';

/**
 * Shared server-side authentication utilities.
 * Use these in API routes and server actions to verify callers.
 */

export interface AuthResult {
  authenticated: boolean;
  user?: unknown;
  role?: string;
  error?: string;
}

/** Access token from Authorization header or sb-access-token cookie. */
export function getAuthToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  const bearer = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (bearer) return bearer;
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(/\bsb-access-token=([^;]+)/);
  return match ? decodeURIComponent(match[1].trim()) : null;
}

export async function verifyAuth(
  request: Request,
  options: { requireAdmin?: boolean } = {}
): Promise<AuthResult> {
  const token = getAuthToken(request);

  if (!token) {
    return { authenticated: false, error: 'Missing authorization token' };
  }

  try {
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return { authenticated: false, error: 'Invalid or expired token' };
    }

    if (options.requireAdmin) {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        return { authenticated: false, error: 'Could not verify user role' };
      }

      if (profile.role !== 'admin' && profile.role !== 'staff') {
        return { authenticated: false, error: 'Admin access required' };
      }

      return { authenticated: true, user, role: profile.role };
    }

    return { authenticated: true, user };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Auth verification failed';
    return { authenticated: false, error: message };
  }
}
