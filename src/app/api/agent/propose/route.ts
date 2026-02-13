import { NextResponse } from 'next/server';
import { proposeAgentRun } from '@/lib/agent/service';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const userToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!userToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const requestText = String(body?.request_text ?? '').trim();
    if (!requestText) return NextResponse.json({ error: 'request_text is required' }, { status: 400 });

    const run = await proposeAgentRun(userToken, requestText);
    return NextResponse.json({ run });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to propose run' }, { status: 500 });
  }
}

