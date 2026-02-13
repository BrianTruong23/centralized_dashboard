import { NextResponse } from 'next/server';
import { getAgentPreferences, patchAgentPreferences } from '@/lib/agent/service';

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const userToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!userToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const preferences = await getAgentPreferences(userToken);
    return NextResponse.json({ preferences });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load preferences' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const userToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!userToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const patch = await req.json().catch(() => ({}));
    const preferences = await patchAgentPreferences(userToken, patch);
    return NextResponse.json({ preferences });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to update preferences' }, { status: 500 });
  }
}

