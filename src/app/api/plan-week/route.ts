import { NextResponse } from 'next/server';
import { generateWeeklyPlan, validateConstraints } from '@/lib/weeklyPlanner';
import { PlanGenerationRequest } from '@/types/weeklyPlan';
import { logPlanGenerated } from '@/lib/activityLog';

export async function POST(req: Request) {
  const startTime = Date.now();
  const log = (msg: string) => console.log(`[API plan-week ${Date.now() - startTime}ms] ${msg}`);

  try {
    log('Request received, parsing body...');
    const body: PlanGenerationRequest = await req.json();
    log('Body parsed successfully');

    const { userId, goals, constraints, existingTasks } = body;

    // Validate inputs
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    if (!constraints) {
      return NextResponse.json({ error: 'Planning constraints are required' }, { status: 400 });
    }

    // Validate constraints
    const validationErrors = validateConstraints(constraints);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Invalid constraints', details: validationErrors },
        { status: 400 }
      );
    }

    log(`Generating plan for ${existingTasks?.length || 0} tasks...`);

    // Generate the plan
    const result = generateWeeklyPlan(existingTasks || [], constraints);

    log(`Plan generated: ${result.items.length} items scheduled`);

    const planId = crypto.randomUUID(); // Temporary ID

    // Log plan generation (non-blocking)
    logPlanGenerated(planId, {
      taskCount: result.items.length,
      constraints: {
        startDate: constraints.startDate,
        endDate: constraints.endDate,
        hoursPerDay: constraints.totalHoursPerDay,
      },
    }).catch(err => console.error('Failed to log plan generation:', err));

    // Return the generated plan (not saved to DB yet - that happens on approval)
    return NextResponse.json({
      success: true,
      plan: {
        id: planId,
        user_id: userId,
        title: goals || 'My Weekly Plan',
        goals,
        constraints,
        start_date: constraints.startDate,
        end_date: constraints.endDate,
        status: 'draft',
        items: result.items,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      summary: result.summary,
      warnings: result.warnings,
    });
  } catch (error: any) {
    log(`ERROR: ${error.message}`);
    console.error('[API plan-week] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
