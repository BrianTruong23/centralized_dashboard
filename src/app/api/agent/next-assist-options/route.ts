import { NextResponse } from 'next/server';

type NextAssistOption = {
  key: string;
  label: string;
  prompt: string;
  aliases: string[];
};

type NextAssistResponse = {
  options: NextAssistOption[];
  question: string;
  reason?: string;
};

function fallbackOptions(fromActionSkills: string[]): NextAssistOption[] {
  const base: NextAssistOption[] = [
    {
      key: 'today',
      label: 'Suggest what to do today',
      prompt: 'What should I do today?',
      aliases: ['today', 'do today', 'focus today'],
    },
    {
      key: 'declutter',
      label: 'Declutter inbox',
      prompt: 'Declutter my inbox',
      aliases: ['declutter', 'cleanup', 'clean up', 'organize inbox'],
    },
    {
      key: 'plan',
      label: 'Auto plan week',
      prompt: 'Auto plan my week',
      aliases: ['plan', 'auto plan', 'schedule week'],
    },
  ];

  const used = new Set(fromActionSkills || []);
  if (used.has('declutter') || used.has('rewrite_title')) return base.filter((o) => o.key !== 'declutter');
  if (used.has('auto_plan')) return base.filter((o) => o.key !== 'plan');
  if (used.has('move_to_today') || used.has('move_status')) return base.filter((o) => o.key !== 'today');
  return base.slice(0, 2);
}

function buildFallbackQuestion(options: NextAssistOption[]): string {
  if (options.length === 0) return 'Tell me what you want to do next.';
  if (options.length === 1) return `Want me to ${options[0].label.toLowerCase()}?`;
  if (options.length === 2) return `I can do ${options[0].label.toLowerCase()} or ${options[1].label.toLowerCase()}. Which one do you want?`;
  return `I can do ${options[0].label.toLowerCase()}, ${options[1].label.toLowerCase()}, or ${options[2].label.toLowerCase()}. Which one do you want?`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const contextSummary = String(body?.contextSummary || '').trim();
    const fromActionSkills = Array.isArray(body?.fromActionSkills) ? body.fromActionSkills.map((s: unknown) => String(s || '')) : [];
    const recentUserMessages = Array.isArray(body?.recentUserMessages)
      ? body.recentUserMessages.map((m: unknown) => String(m || '')).filter(Boolean).slice(-5)
      : [];
    const conversationSummary = String(body?.conversationSummary || '').trim();
    const appliedActionsSummary = String(body?.appliedActionsSummary || '').trim();

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      const options = fallbackOptions(fromActionSkills);
      const payload: NextAssistResponse = {
        options,
        question: buildFallbackQuestion(options),
        reason: 'Fallback: missing API key.',
      };
      return NextResponse.json(payload, { status: 200 });
    }

    const prompt = `You are selecting the next best follow-up assistant modes for an inbox productivity copilot.
Return JSON only with 2-3 options and this schema:
{"options":[{"key":"today|declutter|plan|priority|defer","label":"short label","prompt":"natural user prompt","aliases":["alias1","alias2"]}],"question":"one short natural follow-up question"}

Rules:
- Choose options that are DIFFERENT from already-applied skills when possible.
- Prioritize practical next steps from inbox context.
- Keep labels short and clear.
- prompts must be natural-language user prompts.
- question should be specific and action-oriented (avoid generic text).
- Do not include explanations outside JSON.

Already applied skills:
${fromActionSkills.join(', ') || 'none'}

Inbox context summary:
${contextSummary || 'none'}

Recent user messages:
${recentUserMessages.join('\n') || 'none'}

Compact conversation summary:
${conversationSummary || 'none'}

Past applied actions summary:
${appliedActionsSummary || 'none'}`;

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
        max_tokens: 220,
        messages: [
          { role: 'system', content: 'You are a strict JSON generator.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const options = fallbackOptions(fromActionSkills);
      return NextResponse.json(
        {
          options,
          question: buildFallbackQuestion(options),
          reason: `Fallback: upstream ${response.status}.`,
        },
        { status: 200 }
      );
    }

    const data = await response.json();
    const content = String(data?.choices?.[0]?.message?.content || '{}')
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    let parsed: { options?: Array<{ key?: string; label?: string; prompt?: string; aliases?: string[] }>; question?: string } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {};
    }

    const options = (parsed.options || [])
      .map((opt) => ({
        key: String(opt?.key || '').trim().toLowerCase(),
        label: String(opt?.label || '').trim(),
        prompt: String(opt?.prompt || '').trim(),
        aliases: Array.isArray(opt?.aliases) ? opt.aliases.map((a) => String(a || '').trim().toLowerCase()).filter(Boolean) : [],
      }))
      .filter((opt) => opt.key && opt.label && opt.prompt)
      .slice(0, 3);

    const finalOptions = options.length > 0 ? options : fallbackOptions(fromActionSkills);
    const payload: NextAssistResponse = {
      options: finalOptions,
      question: String(parsed.question || '').trim() || buildFallbackQuestion(finalOptions),
      reason: 'Gemini-routed follow-up options.',
    };
    return NextResponse.json(payload, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to suggest next options';
    const options = fallbackOptions([]);
    return NextResponse.json({ options, question: buildFallbackQuestion(options), reason: message }, { status: 200 });
  }
}
