
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { noteContent } = await req.json();

    if (!noteContent) {
      return NextResponse.json({ error: 'Note content is required' }, { status: 400 });
    }

    console.log('[API] Summarize request received');
    const apiKey = process.env['OPENREUTER-API'];
    if (!apiKey) {
      console.error('[API] API Key missing. Checked process.env["OPENREUTER-API"]');
      return NextResponse.json({ error: 'OpenRouter API key is missing' }, { status: 500 });
    }
    console.log('[API] API Key found (ends with ' + apiKey.slice(-4) + ')');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      console.log('[API] Sending request to OpenRouter...');
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
          model: 'google/gemini-2.0-flash-lite-preview-02-05',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant that summarizes daily notes into actionable tasks and key insights. Keep it concise. Return markdown.'
            },
            {
              role: 'user',
              content: `Please summarize these notes:\n\n${noteContent}`
            }
          ]
        })
      });
      clearTimeout(timeoutId);
      console.log(`[API] OpenRouter response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[API] OpenRouter API Error Body:', errorText);
        return NextResponse.json({ error: `OpenRouter API error: ${response.statusText}` }, { status: response.status });
      }
  
      const data = await response.json();
      console.log('[API] OpenRouter response parsed successfully');
      const summary = data.choices?.[0]?.message?.content || 'No summary generated.';
  
      return NextResponse.json({ summary });
    } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            return NextResponse.json({ error: 'Request timed out after 30 seconds' }, { status: 504 });
        }
        throw error;
    }
  } catch (error: any) {
    console.error('Summarize API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
