import { NextRequest, NextResponse } from 'next/server';
import { generateWeeklyPlan, generatePlanSummary, validateConstraints } from '@/lib/weeklyPlanner';
import { GeneratePlanRequest } from '@/types/plan';

export async function POST(request: NextRequest) {
  try {
    const body: GeneratePlanRequest = await request.json();

    // Validate request
    if (!body.goals || !body.constraints) {
      return NextResponse.json(
        { error: 'Missing required fields: goals and constraints' },
        { status: 400 }
      );
    }

    if (!body.constraints.startDate || !body.constraints.endDate) {
      return NextResponse.json(
        { error: 'Constraints must include startDate and endDate' },
        { status: 400 }
      );
    }

    // Validate constraints
    const warnings = validateConstraints(body.constraints);

    // Generate plan
    // Note: userId should come from authenticated session in production
    // For now, using a placeholder
    const userId = 'placeholder-user-id';

    const plan = generateWeeklyPlan(
      userId,
      body.goals,
      body.constraints,
      body.existingTasks || []
    );

    const summary = generatePlanSummary(plan);

    return NextResponse.json({
      plan,
      summary,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error: any) {
    console.error('[/api/plan] Error generating plan:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate plan' },
      { status: 500 }
    );
  }
}
