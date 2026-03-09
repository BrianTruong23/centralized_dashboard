import { NextResponse } from 'next/server';
import { getUserFromAccessToken } from '@/lib/server/auth';
import { createOAuthState } from '@/lib/calendar/security';
import { getGoogleConnectUrl } from '@/lib/calendar/context';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await getUserFromAccessToken(accessToken);
    const body = await req.json().catch(() => ({}));
    const returnTo = typeof body?.returnTo === 'string' && body.returnTo.startsWith('/') ? body.returnTo : '/';
    const origin = new URL(req.url).origin;
    const state = createOAuthState(user.id, returnTo);

    return NextResponse.json({
      authUrl: getGoogleConnectUrl(origin, state),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to start calendar connection';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
