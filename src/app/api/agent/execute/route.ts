import { NextResponse } from 'next/server';
import { executeAgentRun } from '@/lib/agent/service';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const userToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!userToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const runId = String(body?.run_id ?? '').trim();
    const approvedActionIds = Array.isArray(body?.approved_action_ids)
      ? body.approved_action_ids.map((v: unknown) => String(v))
      : [];
    const modifiedActions = Array.isArray(body?.modified_actions) ? body.modified_actions : [];
    if (!runId) return NextResponse.json({ error: 'run_id is required' }, { status: 400 });

    const run = await executeAgentRun(userToken, runId, approvedActionIds, modifiedActions);
    return NextResponse.json({ run });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to execute run' }, { status: 500 });
  }
}

