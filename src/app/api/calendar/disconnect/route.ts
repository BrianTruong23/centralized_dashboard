import { NextResponse } from 'next/server';
import { getUserFromAccessToken } from '@/lib/server/auth';
import { disconnectGoogleCalendar } from '@/lib/calendar/context';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await getUserFromAccessToken(accessToken);
    const result = await disconnectGoogleCalendar(accessToken, user.id);
    return NextResponse.json({
      ok: true,
      revoked: result.revoked,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to disconnect calendar';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
