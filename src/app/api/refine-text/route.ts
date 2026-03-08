import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const selectedText = String(body?.selectedText || '').trim();
    const fullText = String(body?.fullText || '').trim();
    const instruction = String(body?.instruction || '').trim();
    const allowedModes = new Set(['rephrase', 'shorten', 'elaborate', 'more_formal', 'custom']);
    const mode = allowedModes.has(body?.mode) ? body.mode : 'rephrase';

    if (!selectedText) {
      return NextResponse.json({ error: 'selectedText is required' }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenRouter API key is missing' }, { status: 500 });
    }

    const modeInstructionMap: Record<string, string> = {
      rephrase: 'Rephrase the selected text to be clearer and smoother while preserving meaning.',
      shorten: 'Shorten the selected text while keeping the key intent and facts.',
      elaborate: 'Elaborate the selected text with a bit more clarity and detail, without adding new facts.',
      more_formal: 'Rewrite the selected text in a more formal professional tone.',
      custom: `Follow this user instruction exactly: "${instruction || 'Improve this text.'}"`,
    };

    const prompt = `${modeInstructionMap[mode]}

Rules:
- Return only JSON.
- Keep the original intent.
- Avoid adding new facts.
- Keep wording natural for a notes app.

Output format:
{"refinedText":"..."}

Selected text:
${selectedText}

Context (for tone only):
${fullText.slice(0, 2000)}`;

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
        max_tokens: 300,
        messages: [
          { role: 'system', content: 'You are a writing assistant. Return valid JSON only.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `OpenRouter API error: ${response.statusText}`, details: errorText.slice(0, 400) },
        { status: response.status }
      );
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '{}';
    const cleanContent = String(content).replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let parsed: { refinedText?: string } = {};
    try {
      parsed = JSON.parse(cleanContent);
    } catch {
      parsed = { refinedText: cleanContent };
    }

    const refinedText = String(parsed.refinedText || '').trim() || selectedText;
    return NextResponse.json({ refinedText, mode });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to refine text';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
