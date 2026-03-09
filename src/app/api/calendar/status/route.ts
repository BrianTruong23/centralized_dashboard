import { NextResponse } from 'next/server';
import { getUserFromAccessToken } from '@/lib/server/auth';
import { getCalendarStatus } from '@/lib/calendar/context';

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await getUserFromAccessToken(accessToken);
    const connection = await getCalendarStatus(accessToken, user.id);
    return NextResponse.json({ connection });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load calendar status';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
