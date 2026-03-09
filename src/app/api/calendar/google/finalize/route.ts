import { NextResponse } from 'next/server';
import { getUserFromAccessToken } from '@/lib/server/auth';
import { saveGoogleConnectionFromOAuth } from '@/lib/calendar/context';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await getUserFromAccessToken(accessToken);
    const body = await req.json().catch(() => ({}));
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    if (!code) {
      return NextResponse.json({ error: 'Missing authorization code.' }, { status: 400 });
    }

    await saveGoogleConnectionFromOAuth({
      accessToken,
      userId: user.id,
      origin: new URL(req.url).origin,
      code,
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const rawMessage = error instanceof Error ? error.message : 'Failed to finalize calendar connection';
    const message = rawMessage === 'Unauthorized'
      ? 'Google returned successfully, but Minismo could not find your active Supabase session after the reload. Your account UI may still appear from cached data, but the access token needed to save the calendar connection was unavailable. Refresh once, confirm you are still signed in, then click Connect Google Calendar again.'
      : rawMessage;
    console.error('[calendar/google/finalize] connect failed:', error);
    return NextResponse.json({ error: message }, { status: rawMessage === 'Unauthorized' ? 401 : 500 });
  }
}
