import { NextResponse } from 'next/server';
import { listAgentRuns } from '@/lib/agent/service';

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const userToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!userToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const runs = await listAgentRuns(userToken);
    return NextResponse.json({ runs });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load history' }, { status: 500 });
  }
}

