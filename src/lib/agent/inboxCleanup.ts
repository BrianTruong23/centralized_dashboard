export interface CleanupSuggestion {
  task_ids: string[];
  issue_type: 'duplicate' | 'stale' | 'vague' | 'missing_metadata';
  explanation: string;
  recommended_action: 'merge' | 'archive' | 'rewrite' | 'add_metadata' | 'defer';
  confidence: number;
  details?: {
    merge_with?: string;
    suggested_title?: string;
    suggested_metadata?: {
      deadline?: string;
      priority?: number;
      project_id?: string;
    };
  };
}

export interface CleanupReview {
  duplicates: CleanupSuggestion[];
  stale: CleanupSuggestion[];
  vague: CleanupSuggestion[];
  missing_metadata: CleanupSuggestion[];
}

export interface CleanupTaskInput {
  id: string;
  title: string;
  description?: string | null;
  deadline?: string | null;
  priority?: number | null;
  project_id?: string | null;
  created_at?: string | null;
  status?: string;
}

const EMPTY_REVIEW: CleanupReview = {
  duplicates: [],
  stale: [],
  vague: [],
  missing_metadata: [],
};

function stripJsonFence(content: string): string {
  return content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
}

export async function analyzeInboxCleanup(
  tasks: CleanupTaskInput[],
  apiKey: string
): Promise<CleanupReview> {
  if (!tasks.length) return EMPTY_REVIEW;

  const taskData = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description || '',
    deadline: t.deadline || null,
    priority: t.priority || null,
    project_id: t.project_id || null,
    created_at: t.created_at || null,
    status: t.status || 'todo',
  }));

  const prompt = `
Review the following inbox tasks and identify opportunities to declutter the list without making destructive changes automatically.

Tasks:
${JSON.stringify(taskData, null, 2)}

Look for:
1. Likely duplicate tasks
2. Stale or abandoned tasks
3. Vague task titles
4. Tasks missing useful metadata

Return a concise cleanup review grouped by issue type. For each suggestion, include:
- task_ids
- issue_type: duplicate | stale | vague | missing_metadata
- explanation
- recommended_action: merge | archive | rewrite | add_metadata | defer
- confidence: 0..1
- details (optional): merge_with, suggested_title, suggested_metadata

Output JSON only:
{
  "duplicates": [],
  "stale": [],
  "vague": [],
  "missing_metadata": []
}
`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Minismo Inbox Cleanup',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-lite',
      max_tokens: 4096,
      messages: [
        { role: 'system', content: 'You are an expert productivity assistant. Return valid JSON only.' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.statusText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content || '{}';
  const clean = stripJsonFence(content);

  try {
    const parsed = JSON.parse(clean) as CleanupReview;
    return {
      duplicates: parsed.duplicates || [],
      stale: parsed.stale || [],
      vague: parsed.vague || [],
      missing_metadata: parsed.missing_metadata || [],
    };
  } catch {
    return EMPTY_REVIEW;
  }
}
