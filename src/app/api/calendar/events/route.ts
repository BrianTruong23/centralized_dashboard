import { NextResponse } from 'next/server';
import { getUserFromAccessToken } from '@/lib/server/auth';
import { computeAvailabilitySummary } from '@/lib/calendar/availability';
import { fetchReadOnlyCalendarData } from '@/lib/calendar/context';

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await getUserFromAccessToken(accessToken);
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const timeZone = searchParams.get('timeZone') || 'UTC';

    if (!from || !to) {
      return NextResponse.json({ error: 'from and to are required' }, { status: 400 });
    }

    const { connection, events, availabilityWarning } = await fetchReadOnlyCalendarData(accessToken, user.id, {
      from,
      to,
      timeZone,
    });

    const availability = connection.status === 'connected'
      ? computeAvailabilitySummary(events, { from, to, timeZone })
      : null;

    return NextResponse.json({
      connection,
      events,
      availability,
      warning: availabilityWarning || null,
      guardrails: {
        readOnly: true,
        writeEnabled: false,
        advisoryOnly: true,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load calendar events';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
