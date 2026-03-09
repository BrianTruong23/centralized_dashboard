import { Task, TaskPriority, TaskEnergyLevel } from '@/types/task';
import { differenceInHours, isAfter, isBefore, parseISO } from 'date-fns';

export interface SchedulerContext {
  now: Date;
  energyLevel?: TaskEnergyLevel;
  availableTimeMinutes?: number;
}

function deadlineDateKey(deadline?: string): string | null {
  if (!deadline) return null;
  const match = deadline.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return null;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function plannedDateKey(task: Task): string | null {
  return deadlineDateKey(task.scheduled_on || task.scheduled_date || task.scheduled_start || task.start_time);
}

export const filterTasksDueToday = (tasks: Task[], now: Date): Task[] => {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayKey = `${year}-${month}-${day}`;
  return tasks.filter((task) => {
    if (task.status === 'done') return false;
    const taskDate = plannedDateKey(task) || deadlineDateKey(task.deadline);
    return taskDate === todayKey;
  });
};

/**
 * Calculates a score for a task based on urgency, priority, and context.
 * Higher score = better candidate.
 */
const calculateScore = (task: Task, context: SchedulerContext): number => {
  let score = 0;

  // 1. Priority Weight (Base score)
  // P1: 100, P2: 80, P3: 60, P4: 40, P5: 20
  score += (6 - task.priority) * 20;

  // 2. Urgency (Deadline)
  if (task.deadline) {
    const deadline = new Date(task.deadline);
    const hoursRemaining = differenceInHours(deadline, context.now);
    
    if (hoursRemaining < 0) {
      // Overdue! Huge boost.
      score += 200;
    } else if (hoursRemaining < 24) {
      // Due soon (within 24h)
      score += 100;
    } else if (hoursRemaining < 72) {
      // Due within 3 days
      score += 50;
    }
  }

  // 3. Energy Match
  if (context.energyLevel && task.energyLevel) {
    if (context.energyLevel === task.energyLevel) {
      score += 30;
    } else if (context.energyLevel === 'high' && task.energyLevel === 'medium') {
      score += 15; // High energy can do medium
    } else if (context.energyLevel === 'low' && task.energyLevel === 'high') {
      score -= 50; // Avoid high energy tasks when low energy
    }
  }

  // 4. Time Fit
  if (context.availableTimeMinutes) {
    if (task.estimatedMinutes <= context.availableTimeMinutes) {
      score += 20; // Fits well
    } else {
      score -= 1000; // Doesn't fit, disqualify effectively
    }
  }

  return score;
};

export const pickNextTask = (tasks: Task[], context: SchedulerContext): Task | null => {
  const todoTasks = tasks.filter(t => t.status !== 'done');
  
  if (todoTasks.length === 0) return null;

  // Sort by score descending
  const ranked = [...todoTasks].sort((a, b) => {
    const scoreA = calculateScore(a, context);
    const scoreB = calculateScore(b, context);
    
    if (scoreA !== scoreB) return scoreB - scoreA;
    
    // Tie-breaker: CreatedAt (older first - FIFO to prevent stagnation)
    return a.createdAt - b.createdAt;
  });

  return ranked[0] || null;
};

export const generateDayPlan = (tasks: Task[], context: SchedulerContext): Task[] => {
  const todoTasks = tasks.filter(t => t.status !== 'done');
  const plan: Task[] = [];
  let remainingMinutes = 480; // Default 8 hours (480 mins) or use context if we want to be fancy
  
  if (context.availableTimeMinutes) {
    remainingMinutes = context.availableTimeMinutes;
  }

  // Greedy approach: Pick best task, add to plan, subtract time, repeat.
  // We need to clone tasks to "simulate" them being done/chosen so we don't pick same one.
  // Actually, we can just iterate.
  
  const pool = [...todoTasks];
  
  while (remainingMinutes > 30 && pool.length > 0) { // Stop if less than 30 mins left
    // We update context for each step? Or just use initial?
    // For MVP, simplistic: prioritize based on initial context but filter by fitting in remaining time.
    
    const nextContext = { ...context, availableTimeMinutes: remainingMinutes };
    const bestTask = pickNextTask(pool, nextContext);
    
    if (!bestTask || bestTask.estimatedMinutes > remainingMinutes) {
      // If best task doesn't fit, try to find *any* task that fits?
      // pickNextTask logic penalizes tasks that don't fit. 
      // If it returned a task that fits, great. If not (score very low), we stop or skip.
      
      // Let's rely on pickNextTask's sizing penalty. 
      // If the top task returned has really low score (negative due to fit), we should stop?
      // Or we remove it from pool and try next?
      
      // Let's just remove bestTask from pool and try again if it doesn't fit.
      if (bestTask && bestTask.estimatedMinutes > remainingMinutes) {
         // Doesn't fit. Remove and retry.
         const idx = pool.indexOf(bestTask);
         if (idx > -1) pool.splice(idx, 1);
         continue;
      }
      
      break; 
    }
    
    plan.push(bestTask);
    remainingMinutes -= bestTask.estimatedMinutes;
    
    // Remove from pool
    const idx = pool.indexOf(bestTask);
    if (idx > -1) pool.splice(idx, 1);
  }
  
  return plan;
};
