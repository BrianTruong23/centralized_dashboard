import { Task, TaskEnergyLevel } from '@/types/task';
import { PlanningConstraints, WeeklyPlanItem } from '@/types/weeklyPlan';
import { addDays, startOfWeek, format, parseISO, setHours, setMinutes, addMinutes } from 'date-fns';

/**
 * Generate a UUID (compatible with both browser and Node.js)
 */
const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for test environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

interface DaySchedule {
  day: number; // 0-6 (Sunday=0)
  date: string; // ISO date
  availableMinutes: number;
  items: WeeklyPlanItem[];
  currentTime: Date; // Current scheduling position for this day
}

interface SchedulingContext {
  constraints: PlanningConstraints;
  tasks: Task[];
  daySchedules: DaySchedule[];
}

/**
 * Calculate task score for scheduling priority
 */
const calculateTaskScore = (task: Task, context: { now: Date }): number => {
  let score = 0;

  // Priority weight
  score += (6 - task.priority) * 20;

  // Deadline urgency
  if (task.deadline) {
    const deadline = new Date(task.deadline);
    const hoursRemaining = (deadline.getTime() - context.now.getTime()) / (1000 * 60 * 60);

    if (hoursRemaining < 0) {
      score += 200; // Overdue
    } else if (hoursRemaining < 24) {
      score += 100; // Due within 24h
    } else if (hoursRemaining < 72) {
      score += 50; // Due within 3 days
    } else if (hoursRemaining < 168) {
      score += 25; // Due within 1 week
    }
  }

  return score;
};

/**
 * Get default energy level for time of day
 */
const getEnergyForTimeOfDay = (hour: number, constraints: PlanningConstraints): TaskEnergyLevel => {
  const prefs = constraints.energyPreferences;

  if (hour >= 6 && hour < 12) {
    return prefs?.morningEnergy || 'high';
  } else if (hour >= 12 && hour < 17) {
    return prefs?.afternoonEnergy || 'medium';
  } else {
    return prefs?.eveningEnergy || 'low';
  }
};

/**
 * Check if a task's energy level matches the time slot
 */
const isEnergyMatch = (taskEnergy: TaskEnergyLevel, slotEnergy: TaskEnergyLevel): boolean => {
  if (taskEnergy === slotEnergy) return true;
  if (slotEnergy === 'high' && taskEnergy === 'medium') return true;
  if (slotEnergy === 'medium' && taskEnergy === 'low') return true;
  return false;
};

/**
 * Initialize day schedules based on constraints
 */
const initializeDaySchedules = (constraints: PlanningConstraints): DaySchedule[] => {
  const startDate = parseISO(constraints.startDate);
  const endDate = parseISO(constraints.endDate);
  const schedules: DaySchedule[] = [];

  let currentDate = startDate;
  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay();

    // Calculate available minutes for this day
    let availableMinutes = (constraints.totalHoursPerDay || 8) * 60;

    // If specific time blocks provided, calculate from those
    if (constraints.availableTimeBlocks) {
      const blocksForDay = constraints.availableTimeBlocks.filter(b => b.day === dayOfWeek);
      if (blocksForDay.length > 0) {
        availableMinutes = blocksForDay.reduce((total, block) => {
          return total + ((block.endHour - block.startHour) * 60);
        }, 0);
      }
    }

    // Default start time (9 AM)
    const startHour = constraints.availableTimeBlocks?.find(b => b.day === dayOfWeek)?.startHour || 9;
    const currentTime = setMinutes(setHours(currentDate, startHour), 0);

    schedules.push({
      day: dayOfWeek,
      date: format(currentDate, 'yyyy-MM-dd'),
      availableMinutes,
      items: [],
      currentTime,
    });

    currentDate = addDays(currentDate, 1);
  }

  return schedules;
};

/**
 * Schedule a task into the best available day slot
 */
const scheduleTask = (task: Task, context: SchedulingContext, sequenceCounter: number): WeeklyPlanItem | null => {
  const { constraints, daySchedules } = context;

  // Find best day to schedule this task
  let bestDay: DaySchedule | null = null;
  let bestScore = -Infinity;

  for (const daySchedule of daySchedules) {
    if (daySchedule.availableMinutes < task.estimatedMinutes) {
      continue; // Doesn't fit
    }

    // Calculate score for this day
    let score = 0;

    // Prefer days with more available time
    score += daySchedule.availableMinutes / 10;

    // Check energy match
    const hour = daySchedule.currentTime.getHours();
    const slotEnergy = getEnergyForTimeOfDay(hour, constraints);
    if (isEnergyMatch(task.energyLevel, slotEnergy)) {
      score += 50;
    }

    // Prefer earlier in the week for urgent tasks
    if (task.deadline || task.priority <= 2) {
      score += (7 - daySchedule.day) * 5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestDay = daySchedule;
    }
  }

  if (!bestDay) return null;

  // Create plan item
  const suggestedStart = bestDay.currentTime.toISOString();
  const suggestedEnd = addMinutes(bestDay.currentTime, task.estimatedMinutes).toISOString();

  const planItem: Omit<WeeklyPlanItem, 'id' | 'plan_id' | 'createdAt'> & { id: string; plan_id: string; createdAt: number } = {
    id: generateUUID(),
    plan_id: '', // Will be set later
    task_id: task.id,
    title: task.title,
    description: task.description,
    category: task.category,
    priority: task.priority,
    estimatedMinutes: task.estimatedMinutes,
    energyLevel: task.energyLevel,
    suggested_start: suggestedStart,
    suggested_end: suggestedEnd,
    day_of_week: bestDay.day,
    sequence_order: sequenceCounter,
    createdAt: Date.now(),
  };

  // Update day schedule
  bestDay.items.push(planItem);
  bestDay.availableMinutes -= task.estimatedMinutes;
  bestDay.currentTime = addMinutes(bestDay.currentTime, task.estimatedMinutes + 15); // Add 15min buffer

  return planItem;
};

/**
 * Generate weekly plan from tasks and constraints
 */
export const generateWeeklyPlan = (
  tasks: Task[],
  constraints: PlanningConstraints
): { items: WeeklyPlanItem[]; summary: string; warnings: string[] } => {
  const warnings: string[] = [];

  // Filter to pending tasks only
  const pendingTasks = tasks.filter(t => t.status !== 'done');

  if (pendingTasks.length === 0) {
    return {
      items: [],
      summary: 'No pending tasks to schedule.',
      warnings: ['You have no pending tasks. Add some tasks first!'],
    };
  }

  // Initialize day schedules
  const daySchedules = initializeDaySchedules(constraints);
  const context: SchedulingContext = {
    constraints,
    tasks: pendingTasks,
    daySchedules,
  };

  // Sort tasks by priority score
  const sortedTasks = [...pendingTasks].sort((a, b) => {
    const scoreA = calculateTaskScore(a, { now: new Date() });
    const scoreB = calculateTaskScore(b, { now: new Date() });
    if (scoreA !== scoreB) return scoreB - scoreA;
    return a.createdAt - b.createdAt; // FIFO tie-breaker
  });

  // Schedule tasks
  const scheduledItems: WeeklyPlanItem[] = [];
  let sequenceCounter = 0;

  for (const task of sortedTasks) {
    const planItem = scheduleTask(task, context, sequenceCounter);
    if (planItem) {
      scheduledItems.push(planItem);
      sequenceCounter++;
    } else {
      warnings.push(`Could not fit task "${task.title}" (${task.estimatedMinutes}m) into schedule.`);
    }
  }

  // Calculate total scheduled time
  const totalMinutes = scheduledItems.reduce((sum, item) => sum + item.estimatedMinutes, 0);
  const totalHours = Math.round(totalMinutes / 60 * 10) / 10;

  // Generate summary
  const summary = `Scheduled ${scheduledItems.length} of ${pendingTasks.length} tasks across ${daySchedules.length} days (${totalHours} hours total).`;

  return {
    items: scheduledItems,
    summary,
    warnings: warnings.length > 0 ? warnings : undefined!,
  };
};

/**
 * Validate planning constraints
 */
export const validateConstraints = (constraints: PlanningConstraints): string[] => {
  const errors: string[] = [];

  if (!constraints.startDate || !constraints.endDate) {
    errors.push('Start date and end date are required.');
  }

  try {
    const start = parseISO(constraints.startDate);
    const end = parseISO(constraints.endDate);

    if (end < start) {
      errors.push('End date must be after start date.');
    }

    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff > 14) {
      errors.push('Planning horizon cannot exceed 14 days.');
    }
  } catch (e) {
    errors.push('Invalid date format.');
  }

  if (constraints.totalHoursPerDay && (constraints.totalHoursPerDay < 1 || constraints.totalHoursPerDay > 16)) {
    errors.push('Hours per day must be between 1 and 16.');
  }

  return errors;
};
