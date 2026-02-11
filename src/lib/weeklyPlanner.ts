import { Task, TaskCategory, TaskEnergyLevel, TaskPriority } from '@/types/task';
import { PlanningConstraints, PlanItem, WeeklyPlan } from '@/types/plan';
import { addDays, differenceInHours, format, parseISO, setHours, setMinutes, startOfDay } from 'date-fns';

interface PlanContext {
  constraints: PlanningConstraints;
  existingTasks: Task[];
  currentDate: Date;
}

/**
 * Calculate priority score for a task based on:
 * - Base priority (1-5)
 * - Category priority from constraints
 * - Deadline urgency
 */
function calculatePriorityScore(
  task: Task,
  constraints: PlanningConstraints,
  now: Date
): number {
  let score = 0;

  // Base priority: P1=100, P2=80, P3=60, P4=40, P5=20
  score += (6 - task.priority) * 20;

  // Category priority boost
  if (constraints.categoryPriorities && task.category) {
    const categoryBoost = (constraints.categoryPriorities[task.category] || 0) * 10;
    score += categoryBoost;
  }

  // Deadline urgency
  if (task.deadline) {
    const deadline = parseISO(task.deadline);
    const hoursRemaining = differenceInHours(deadline, now);

    if (hoursRemaining < 0) {
      score += 200; // Overdue!
    } else if (hoursRemaining < 24) {
      score += 100; // Due within 24h
    } else if (hoursRemaining < 72) {
      score += 50; // Due within 3 days
    } else if (hoursRemaining < 168) {
      score += 25; // Due within 1 week
    }
  }

  return score;
}

/**
 * Get default available time in minutes for a given date
 */
function getAvailableTimeForDay(date: Date, constraints: PlanningConstraints): number {
  const dateStr = format(date, 'yyyy-MM-dd');

  // Check if specific time is defined for this day
  if (constraints.availableTimeByDay?.[dateStr]) {
    return constraints.availableTimeByDay[dateStr].totalMinutes;
  }

  // Use default hours per day
  const hoursPerDay = constraints.hoursPerDay || 8;
  return hoursPerDay * 60;
}

/**
 * Get preferred energy level for a given time of day
 */
function getEnergyPreferenceForTime(hour: number, constraints: PlanningConstraints): TaskEnergyLevel | undefined {
  if (!constraints.energyPreferences) return undefined;

  if (hour >= 5 && hour < 12) {
    return constraints.energyPreferences.morning;
  } else if (hour >= 12 && hour < 17) {
    return constraints.energyPreferences.afternoon;
  } else if (hour >= 17 && hour < 23) {
    return constraints.energyPreferences.evening;
  }

  return undefined;
}

/**
 * Calculate energy match score
 */
function calculateEnergyMatchScore(
  taskEnergy: TaskEnergyLevel,
  timeEnergy?: TaskEnergyLevel
): number {
  if (!timeEnergy) return 0;

  if (taskEnergy === timeEnergy) return 30;
  if (timeEnergy === 'high' && taskEnergy === 'medium') return 15;
  if (timeEnergy === 'low' && taskEnergy === 'high') return -50;

  return 0;
}

/**
 * Generate time blocks for a day based on available minutes
 */
function generateTimeBlocks(
  date: Date,
  availableMinutes: number,
  constraints: PlanningConstraints
): { start: Date; end: Date; preferredEnergy?: TaskEnergyLevel }[] {
  const blocks: { start: Date; end: Date; preferredEnergy?: TaskEnergyLevel }[] = [];

  // Default schedule: 9 AM start
  let currentHour = 9;
  let remainingMinutes = availableMinutes;

  while (remainingMinutes > 0) {
    const blockMinutes = Math.min(120, remainingMinutes); // Max 2-hour blocks
    const startTime = setMinutes(setHours(date, currentHour), 0);
    const endTime = new Date(startTime.getTime() + blockMinutes * 60000);

    blocks.push({
      start: startTime,
      end: endTime,
      preferredEnergy: getEnergyPreferenceForTime(currentHour, constraints),
    });

    remainingMinutes -= blockMinutes;
    currentHour += Math.ceil(blockMinutes / 60);

    // Skip lunch (12-1)
    if (currentHour === 12) currentHour = 13;
    // Don't go past 6 PM without breaking to next day
    if (currentHour >= 18) break;
  }

  return blocks;
}

/**
 * Allocate tasks to time blocks across the week
 */
function allocateTasksToTimeBlocks(
  tasks: Task[],
  constraints: PlanningConstraints
): PlanItem[] {
  const planItems: PlanItem[] = [];
  const startDate = parseISO(constraints.startDate);
  const endDate = parseISO(constraints.endDate);

  // Sort tasks by priority score
  const sortedTasks = [...tasks].sort((a, b) => {
    const scoreA = calculatePriorityScore(a, constraints, startDate);
    const scoreB = calculatePriorityScore(b, constraints, startDate);

    if (scoreA !== scoreB) return scoreB - scoreA;

    // Tie-breaker: older tasks first (FIFO)
    return a.createdAt - b.createdAt;
  });

  // Track current position in the week
  let currentDate = startOfDay(startDate);
  let currentTimeBlocks = generateTimeBlocks(
    currentDate,
    getAvailableTimeForDay(currentDate, constraints),
    constraints
  );
  let blockIndex = 0;
  let currentBlockRemainingMinutes = currentTimeBlocks[0]
    ? (currentTimeBlocks[0].end.getTime() - currentTimeBlocks[0].start.getTime()) / 60000
    : 0;

  // Allocate each task
  for (const task of sortedTasks) {
    if (currentDate > endDate) break;

    let taskRemainingMinutes = task.estimatedMinutes;

    while (taskRemainingMinutes > 0) {
      // If current block is exhausted, move to next block
      if (currentBlockRemainingMinutes <= 0) {
        blockIndex++;

        // If no more blocks today, move to next day
        if (blockIndex >= currentTimeBlocks.length) {
          currentDate = addDays(currentDate, 1);
          if (currentDate > endDate) break;

          currentTimeBlocks = generateTimeBlocks(
            currentDate,
            getAvailableTimeForDay(currentDate, constraints),
            constraints
          );
          blockIndex = 0;
        }

        if (currentTimeBlocks[blockIndex]) {
          const block = currentTimeBlocks[blockIndex];
          currentBlockRemainingMinutes =
            (block.end.getTime() - block.start.getTime()) / 60000;
        } else {
          break; // No more time available
        }
      }

      // Allocate time from current block
      const block = currentTimeBlocks[blockIndex];
      if (!block) break;

      const minutesToAllocate = Math.min(taskRemainingMinutes, currentBlockRemainingMinutes);

      // Calculate start and end times
      const blockTotalMinutes = (block.end.getTime() - block.start.getTime()) / 60000;
      const blockUsedMinutes = blockTotalMinutes - currentBlockRemainingMinutes;
      const suggestedStart = new Date(block.start.getTime() + blockUsedMinutes * 60000);
      const suggestedEnd = new Date(suggestedStart.getTime() + minutesToAllocate * 60000);

      // Create plan item (or add to existing if splitting task)
      const existingItem = planItems.find(
        (item) => item.taskId === task.id && item.suggestedStart === suggestedStart.toISOString()
      );

      if (!existingItem) {
        planItems.push({
          id: crypto.randomUUID(),
          taskId: task.id,
          title: task.title,
          description: task.description,
          category: task.category,
          priority: task.priority,
          estimatedMinutes: minutesToAllocate,
          energyLevel: task.energyLevel,
          deadline: task.deadline,
          suggestedStart: suggestedStart.toISOString(),
          suggestedEnd: suggestedEnd.toISOString(),
          planningMetadata: {
            confidence: calculateEnergyMatchScore(task.energyLevel, block.preferredEnergy) > 0 ? 0.8 : 0.6,
            notes: taskRemainingMinutes > minutesToAllocate ? `Split task: ${minutesToAllocate}/${task.estimatedMinutes} minutes` : undefined,
          },
        });
      }

      taskRemainingMinutes -= minutesToAllocate;
      currentBlockRemainingMinutes -= minutesToAllocate;
    }

    if (currentDate > endDate) break;
  }

  return planItems;
}

/**
 * Generate a weekly plan from existing tasks and constraints
 */
export function generateWeeklyPlan(
  userId: string,
  goals: string,
  constraints: PlanningConstraints,
  existingTasks: Task[]
): WeeklyPlan {
  // Filter to only incomplete tasks
  const incompleteTasks = existingTasks.filter((t) => t.status !== 'done');

  // Allocate tasks to time blocks
  const planItems = allocateTasksToTimeBlocks(incompleteTasks, constraints);

  const plan: WeeklyPlan = {
    id: crypto.randomUUID(),
    userId,
    title: `Week of ${format(parseISO(constraints.startDate), 'MMM d')}`,
    dateRangeStart: constraints.startDate,
    dateRangeEnd: constraints.endDate,
    goals,
    constraints,
    items: planItems,
    status: 'draft',
    createdAt: Date.now(),
  };

  return plan;
}

/**
 * Generate summary text for a plan
 */
export function generatePlanSummary(plan: WeeklyPlan): string {
  const totalTasks = new Set(plan.items.map((item) => item.taskId)).size;
  const totalMinutes = plan.items.reduce((sum, item) => sum + item.estimatedMinutes, 0);
  const totalHours = Math.round(totalMinutes / 60 * 10) / 10;

  const highPriorityCount = plan.items.filter((item) => item.priority <= 2).length;

  const summary = [
    `Created a ${totalTasks}-task plan for the week.`,
    `Total estimated time: ${totalHours} hours across ${plan.items.length} time blocks.`,
  ];

  if (highPriorityCount > 0) {
    summary.push(`${highPriorityCount} high-priority items scheduled.`);
  }

  // Check for tasks with deadlines
  const tasksWithDeadlines = plan.items.filter((item) => item.deadline);
  if (tasksWithDeadlines.length > 0) {
    summary.push(`${tasksWithDeadlines.length} tasks with deadlines included.`);
  }

  return summary.join(' ');
}

/**
 * Validate constraints and return warnings if any
 */
export function validateConstraints(constraints: PlanningConstraints): string[] {
  const warnings: string[] = [];

  const startDate = parseISO(constraints.startDate);
  const endDate = parseISO(constraints.endDate);

  if (endDate <= startDate) {
    warnings.push('End date must be after start date');
  }

  const daysInRange = differenceInHours(endDate, startDate) / 24;
  if (daysInRange > 14) {
    warnings.push('Planning horizon is longer than 2 weeks, which may reduce accuracy');
  }

  if (constraints.hoursPerDay && (constraints.hoursPerDay < 1 || constraints.hoursPerDay > 16)) {
    warnings.push('Hours per day should be between 1 and 16');
  }

  return warnings;
}
