import { NextResponse } from 'next/server';

type RouteMode = 'answer_only' | 'answer_with_suggested_actions';

function isAdviceStyleQuery(message: string): boolean {
  const text = message.toLowerCase();
  const asksAdvice =
    /(what is most urgent|what's most urgent|what should i do next|what should i do today|best thing to do|best thing right now|focus on right now|for 1 hour)/.test(
      text
    );
  const asksMutation = /(move|set|change|apply|mark|update|schedule|plan|declutter|clean up|cleanup)/.test(text);
  return asksAdvice && !asksMutation;
}

function fallbackMode(message: string): RouteMode {
  if (isAdviceStyleQuery(message)) return 'answer_only';
  const text = message.toLowerCase();
  const actionLike =
    /(move|set|change|apply|plan|declutter|clean up|cleanup|rewrite|clarify|defer|batch|mark|update)/.test(text);
  return actionLike ? 'answer_with_suggested_actions' : 'answer_only';
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = String(body?.message || '').trim();
    const contextSummary = String(body?.contextSummary || '').trim();

    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    if (isAdviceStyleQuery(message)) {
      return NextResponse.json(
        {
          mode: 'answer_only',
          confidence: 0.92,
          reason: 'Advice-style question detected; actions are hidden by default.',
          needs_clarification: false,
        },
        { status: 200 }
      );
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          mode: fallbackMode(message),
          confidence: 0.55,
          reason: 'Fallback routing used because API key is missing.',
          needs_clarification: false,
        },
        { status: 200 }
      );
    }

    const prompt = `You are an intent router for an inbox productivity agent.
Choose exactly one mode:
1) answer_only
2) answer_with_suggested_actions

Decision rule:
- answer_only: user primarily wants advice/information/recommendation and does not clearly ask to change tasks now.
- answer_with_suggested_actions: user likely wants to organize/plan/update/clean/change tasks or would immediately benefit from actionable follow-ups.

Return JSON only:
{"mode":"answer_only|answer_with_suggested_actions","confidence":0-1,"reason":"short","needs_clarification":true|false}

User message:
${message}

Inbox context summary:
${contextSummary || 'No extra summary provided.'}`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Centralized Dashboard',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        max_tokens: 180,
        messages: [
          { role: 'system', content: 'You are a precise routing classifier. Return valid JSON only.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          mode: fallbackMode(message),
          confidence: 0.5,
          reason: `Fallback routing used because upstream failed: ${response.status}`,
          needs_clarification: false,
        },
        { status: 200 }
      );
    }

    const data = await response.json();
    const content = String(data?.choices?.[0]?.message?.content || '{}')
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    let parsed: { mode?: string; confidence?: number; reason?: string; needs_clarification?: boolean } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {};
    }

    const mode: RouteMode =
      parsed.mode === 'answer_with_suggested_actions' || parsed.mode === 'answer_only'
        ? parsed.mode
        : fallbackMode(message);

    return NextResponse.json({
      mode,
      confidence:
        typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.65,
      reason: parsed.reason || 'Routed by intent profile.',
      needs_clarification: Boolean(parsed.needs_clarification),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to route mode';
    return NextResponse.json({ mode: 'answer_only', confidence: 0.5, reason: message, needs_clarification: false }, { status: 200 });
  }
}
