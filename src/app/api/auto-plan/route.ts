import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const startTime = Date.now();
  const log = (msg: string) => console.log(`[AutoPlan API ${Date.now() - startTime}ms] ${msg}`);

  try {
    const authHeader = req.headers.get('authorization') || '';
    const userToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!userToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnon) {
      return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 });
    }

    const subRes = await fetch(`${supabaseUrl}/rest/v1/user_subscriptions?select=tier,status&limit=1`, {
      method: 'GET',
      headers: {
        apikey: supabaseAnon,
        Authorization: `Bearer ${userToken}`,
      },
    });
    if (!subRes.ok) {
      return NextResponse.json({ error: 'Could not verify subscription status' }, { status: 403 });
    }
    const rows = await subRes.json();
    const sub = rows?.[0];
    const isPro = sub?.tier === 'pro' && sub?.status === 'active';
    if (!isPro) {
      return NextResponse.json({ error: 'Auto Plan is a Pro feature. Please upgrade.' }, { status: 402 });
    }

    log('Request received, parsing body...');
    const { notes, startDate } = await req.json();

    if (!notes) {
      return NextResponse.json({ error: 'Notes are required' }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenRouter API key is missing' }, { status: 500 });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for complex planning

    const prompt = `
      Current Context:
      - Today is ${startDate || new Date().toISOString().split('T')[0]}.
      - User Notes: "${notes}"

      ROLE: Expert Project Manager & Scheduler.
      GOAL: Create a weekly plan (Mon-Sun) from the notes.
      RULES:
      1. Schedule tasks by deadline & urgency.
      2. Front-load urgent tasks (Mon/Tue).
      3. Spread out high-effort tasks (max 1-2 per day).
      4. Respect "Weekend" (Sat/Sun) - keep lighter unless requested.
      5. Infer Project (default "Life" or "Work").
      6. PRIORITY MAPPING (Strict):
         - 1 = Urgent / Critical / Must Do Today.
         - 2 = High Priority / Important.
         - 3 = Medium / Normal.
         - 4 = Low / Nice to have.
      7. Dates:
         - Interpretation: "Today" means ${startDate || new Date().toISOString().split('T')[0]}.
         - "Tomorrow" means ${new Date(new Date(startDate || Date.now()).getTime() + 86400000).toISOString().split('T')[0]}.
         - If no date is implied, schedule intelligently.

      OUTPUT JSON format only (no markdown):
      {
        "week_plan": [
          {
            "day": "Monday",
            "date": "YYYY-MM-DD",
            "tasks": [
              {
                "title": "Task Title",
                "reason": "Why scheduled here (short)",
                "estimated_minutes": 30,
                "project": "Work",
                "priority": 1,
                "is_assumption": false
              }
            ]
          }
        ],
        "assumptions": ["List any major assumptions made"]
      }
    `;

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Centralized Dashboard AutoPlan',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-lite',
          max_tokens: 4096,
          messages: [
            { role: 'system', content: 'You are an expert scheduler. Return valid JSON only.' },
            { role: 'user', content: prompt }
          ]
        })
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '{}';
      
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleanContent);

      return NextResponse.json(parsed);

    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error('AutoPlan Error:', error);
      return NextResponse.json({ error: error.message || 'Failed to generate plan' }, { status: 500 });
    }
  } catch (error: any) {
    console.error('AutoPlan Internal Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
