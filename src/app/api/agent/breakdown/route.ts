import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { task } = body;

    if (!task || !task.title) {
      return NextResponse.json(
        { error: 'Task title is required' },
        { status: 400 }
      );
    }

    // Construct the prompt for Claude to break down the task
    const prompt = `You are a productivity assistant helping break down a task into smaller, actionable subtasks.

Task to break down:
Title: ${task.title}
Description: ${task.description || 'No description provided'}
Estimated time: ${task.estimatedMinutes || 'Not specified'} minutes

Please analyze this task and break it down into 3-7 smaller, actionable subtasks. Each subtask should:
1. Be specific and actionable
2. Be completable independently
3. Have a clear completion criteria
4. Take roughly equal portions of the total time

For each subtask, provide:
- A clear, concise title (max 60 characters)
- An estimated time in minutes

Respond with a JSON array of subtasks in this exact format:
{
  "subtasks": [
    {
      "title": "Subtask title here",
      "estimatedMinutes": 30
    }
  ]
}

Important: Respond ONLY with valid JSON. Do not include any other text or explanation.`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extract the text content from Claude's response
    const textContent = message.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    // Parse the JSON response
    let responseText = textContent.text.trim();

    // Remove markdown code blocks if present
    if (responseText.startsWith('```json')) {
      responseText = responseText.replace(/```json\n?/, '').replace(/\n?```$/, '');
    } else if (responseText.startsWith('```')) {
      responseText = responseText.replace(/```\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(responseText);

    // Validate the response structure
    if (!parsed.subtasks || !Array.isArray(parsed.subtasks)) {
      throw new Error('Invalid response format from AI');
    }

    // Ensure each subtask has required fields
    const subtasks = parsed.subtasks.map((st: any) => ({
      title: st.title || 'Untitled subtask',
      estimatedMinutes: typeof st.estimatedMinutes === 'number' ? st.estimatedMinutes : 30,
    }));

    // Limit to 7 subtasks max
    const limitedSubtasks = subtasks.slice(0, 7);

    return NextResponse.json({ subtasks: limitedSubtasks });
  } catch (error: any) {
    console.error('Breakdown API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate subtasks' },
      { status: 500 }
    );
  }
}
