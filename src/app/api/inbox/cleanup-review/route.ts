import { NextResponse } from 'next/server';

interface CleanupSuggestion {
  task_ids: string[];
  issue_type: 'duplicate' | 'stale' | 'vague' | 'missing_metadata';
  explanation: string;
  recommended_action: 'merge' | 'archive' | 'rewrite' | 'add_metadata' | 'defer';
  confidence: number; // 0-1
  details?: {
    merge_with?: string; // task ID to merge with
    suggested_title?: string; // for rewrite
    suggested_metadata?: {
      deadline?: string;
      priority?: number;
      project_id?: string;
    };
  };
}

interface CleanupReview {
  duplicates: CleanupSuggestion[];
  stale: CleanupSuggestion[];
  vague: CleanupSuggestion[];
  missing_metadata: CleanupSuggestion[];
}

export async function POST(req: Request) {
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

    const { tasks } = await req.json();
    if (!tasks || !Array.isArray(tasks)) {
      return NextResponse.json({ error: 'Tasks array is required' }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENROUTER_API_KEY not configured' }, { status: 503 });
    }

    // Prepare task data for analysis
    const taskData = tasks.map((t: any) => ({
      id: t.id,
      title: t.title,
      description: t.description || '',
      deadline: t.deadline || null,
      priority: t.priority || null,
      project_id: t.project_id || null,
      created_at: t.created_at || null,
      status: t.status,
    }));

    const prompt = `
Review the following inbox tasks and identify opportunities to declutter the list without making destructive changes automatically.

Tasks:
${JSON.stringify(taskData, null, 2)}

Look for:
1. **Likely duplicate tasks**: Tasks with very similar or identical titles/meanings
2. **Stale or abandoned tasks**: Tasks that seem outdated, irrelevant, or forgotten
3. **Vague or non-actionable task titles**: Tasks with unclear, ambiguous, or non-specific titles
4. **Tasks missing useful metadata**: Tasks without due date, priority, or project assignment

Return a concise cleanup review grouped by issue type. For each suggestion, include:
- task_ids: Array of affected task IDs
- issue_type: "duplicate" | "stale" | "vague" | "missing_metadata"
- explanation: Short explanation of the issue
- recommended_action: "merge" | "archive" | "rewrite" | "add_metadata" | "defer"
- confidence: Number between 0 and 1 (higher = more confident)
- details: Optional object with:
  - merge_with: task ID to merge with (for merge actions)
  - suggested_title: Improved title (for rewrite actions)
  - suggested_metadata: { deadline, priority, project_id } (for add_metadata actions)

RULES:
- Prefer safe suggestions (merge, archive, rewrite, add_metadata, defer)
- Do NOT suggest delete actions
- Be conservative - only suggest high-confidence improvements
- For duplicates, suggest merging into the oldest task
- For vague titles, suggest a clearer, actionable version
- For missing metadata, suggest reasonable defaults based on context

OUTPUT JSON format only (no markdown):
{
  "duplicates": [
    {
      "task_ids": ["id1", "id2"],
      "issue_type": "duplicate",
      "explanation": "Brief explanation",
      "recommended_action": "merge",
      "confidence": 0.9,
      "details": {
        "merge_with": "id1"
      }
    }
  ],
  "stale": [],
  "vague": [],
  "missing_metadata": []
}
`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Minismo Inbox Cleanup',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        max_tokens: 4096,
        messages: [
          { role: 'system', content: 'You are an expert productivity assistant. Return valid JSON only.' },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    let review: CleanupReview;
    try {
      review = JSON.parse(cleanContent);
    } catch (e) {
      console.error('Failed to parse cleanup review JSON:', cleanContent);
      // Return empty review on parse error
      review = {
        duplicates: [],
        stale: [],
        vague: [],
        missing_metadata: [],
      };
    }

    return NextResponse.json({ review });

  } catch (error: any) {
    console.error('Inbox cleanup review error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to generate cleanup review' },
      { status: 500 }
    );
  }
}
