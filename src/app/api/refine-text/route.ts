import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const selectedText = String(body?.selectedText || '').trim();
    const fullText = String(body?.fullText || '').trim();

    if (!selectedText) {
      return NextResponse.json({ error: 'selectedText is required' }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenRouter API key is missing' }, { status: 500 });
    }

    const prompt = `Rewrite the selected text to be clearer, more concise, and polished while preserving intent and tone.

Rules:
- Return only JSON.
- Keep roughly the same meaning.
- Keep tense and person unless clearly broken.
- Avoid adding new facts.
- Keep it short and natural for a notes app.

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
    return NextResponse.json({ refinedText });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to refine text' }, { status: 500 });
  }
}

