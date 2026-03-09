import { NextResponse } from 'next/server';
import { analyzeInboxCleanup, CleanupTaskInput } from '@/lib/agent/inboxCleanup';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const userToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!userToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tasks } = await req.json();
    if (!tasks || !Array.isArray(tasks)) {
      return NextResponse.json({ error: 'Tasks array is required' }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENROUTER_API_KEY not configured' }, { status: 503 });
    }

    const review = await analyzeInboxCleanup(tasks as CleanupTaskInput[], apiKey);

    return NextResponse.json({ review });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate cleanup review';
    console.error('Inbox cleanup review error:', error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
