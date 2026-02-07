import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RateLimitPresets } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  // Apply strict rate limiting (10 requests per minute)
  const rateLimitResult = await rateLimit(req, RateLimitPresets.strict);
  if (rateLimitResult) {
    return rateLimitResult;
  }
  const startTime = Date.now();
  const log = (msg: string) => console.log(`[API ${Date.now() - startTime}ms] ${msg}`);

  try {
    log('Request received, parsing body...');
    const { noteContent } = await req.json();
    log(`Body parsed. Content length: ${noteContent?.length || 0} chars`);

    if (!noteContent) {
      log('ERROR: No note content provided');
      return NextResponse.json({ error: 'Note content is required' }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      log('ERROR: API Key missing. Check OPENROUTER_API_KEY in .env.local');
      return NextResponse.json({ error: 'OpenRouter API key is missing' }, { status: 500 });
    }
    log(`API Key found (ends with ...${apiKey.slice(-4)})`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      log('TIMEOUT: Aborting request after 30 seconds');
      controller.abort();
    }, 30000);

    try {
      log('Sending request to OpenRouter...');
      const fetchStart = Date.now();

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Centralized Dashboard',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-lite',
          messages: [
            {
              role: 'system',
              content: `Extract tasks from notes. Today: ${new Date().toISOString().split('T')[0]}

Return JSON only:
{"summary":"1-2 sentences","actionItems":[{"title":"verb + task","description":"brief","category":"Research|Coding|Admin|Health|Life|Finance|Social|Content|UX","priority":1-5,"estimatedMinutes":15-120,"energyLevel":"low|medium|high","deadline":"YYYY-MM-DD or null"}]}

Priority: 1=urgent, 2=high, 3=normal, 4=low. Deadline: extract dates from notes, convert to YYYY-MM-DD. Max 5 tasks.`
            },
            {
              role: 'user',
              content: `Extract action items from these notes:\n\n${noteContent}`
            }
          ]
        })
      });

      clearTimeout(timeoutId);
      log(`OpenRouter responded in ${Date.now() - fetchStart}ms. Status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        log(`ERROR: OpenRouter API error - ${response.status} ${response.statusText}`);
        log(`ERROR Body: ${errorText}`);
        return NextResponse.json({ error: `OpenRouter API error: ${response.statusText}` }, { status: response.status });
      }

      log('Parsing response JSON...');
      const data = await response.json();
      log('Response parsed successfully');

      const content = data.choices?.[0]?.message?.content || '{}';
      log(`Content received. Length: ${content.length} chars`);

      // Parse the JSON response from the AI
      let parsed;
      try {
        // Remove markdown code blocks if present
        const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        parsed = JSON.parse(cleanContent);
        log(`Parsed ${parsed.actionItems?.length || 0} action items`);
      } catch (parseError) {
        log('ERROR: Failed to parse AI response as JSON, returning as summary');
        return NextResponse.json({
          summary: content,
          actionItems: []
        });
      }

      log(`Total time: ${Date.now() - startTime}ms`);
      return NextResponse.json({
        summary: parsed.summary || 'No summary generated.',
        actionItems: parsed.actionItems || []
      });
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        log('ERROR: Request timed out after 30 seconds');
        return NextResponse.json({ error: 'Request timed out after 30 seconds' }, { status: 504 });
      }
      throw error;
    }
  } catch (error: any) {
    console.error(`[API ${Date.now() - startTime}ms] ERROR:`, error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
