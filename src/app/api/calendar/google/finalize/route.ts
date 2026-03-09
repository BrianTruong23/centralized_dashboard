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
      ? 'Your Minismo session was still restoring after returning from Google. Wait a moment and reconnect Google Calendar.'
      : rawMessage;
    console.error('[calendar/google/finalize] connect failed:', error);
    return NextResponse.json({ error: message }, { status: rawMessage === 'Unauthorized' ? 401 : 500 });
  }
}
