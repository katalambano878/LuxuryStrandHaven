import { NextResponse } from 'next/server';
import { resetPasswordWithToken } from '@/lib/db/auth';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!checkRateLimit(`reset:${getClientIdentifier(req)}`, RATE_LIMITS.auth).success) {
    return NextResponse.json({ success: false, message: 'Too many attempts. Please wait a minute.' }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === 'string' ? body.token : '';
  const password = typeof body.password === 'string' ? body.password : '';
  try {
    const result = await resetPasswordWithToken(token, password);
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[reset-password]', err instanceof Error ? err.message : err);
    return NextResponse.json({ success: false, message: 'Could not reset your password. Please try again.' }, { status: 500 });
  }
}
