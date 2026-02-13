import { pickNextTask, generateDayPlan, filterTasksDueToday, SchedulerContext } from '@/lib/scheduler';
import { Task } from '@/types/task';
import { addHours, subHours } from 'date-fns';

describe('Scheduler Logic', () => {
  const baseTask: Task = {
    id: '1',
    title: 'Test Task',
    description: '',
    category: 'Admin',
    priority: 3,
    estimatedMinutes: 60,
    energyLevel: 'medium',
    status: 'todo',
    tags: [],
    createdAt: Date.now(),
  };

  const context: SchedulerContext = {
    now: new Date(),
    energyLevel: 'medium',
    availableTimeMinutes: 480,
  };

  test('pickNextTask prefers higher priority', () => {
    const t1 = { ...baseTask, id: '1', priority: 3 as const };
    const t2 = { ...baseTask, id: '2', priority: 1 as const }; // Higher priority (1 is highest usually? Wait, logic says score = (6-p)*20. So 1 -> 100, 5 -> 20. Yes, 1 is highest.)
    
    const selected = pickNextTask([t1, t2], context);
    expect(selected?.id).toBe('2');
  });

  test('pickNextTask prefers overdue tasks', () => {
    const t1 = { ...baseTask, id: '1', priority: 1 as const }; // High priority
    const t2 = { ...baseTask, id: '2', priority: 3 as const, deadline: subHours(new Date(), 1).toISOString() }; // Overdue
    
    const selected = pickNextTask([t1, t2], context);
    expect(selected?.id).toBe('2'); // Overdue score boost (+200) > P1 boost? P1=100 base. P3=60 base + 200 = 260. Yes.
  });

  test('pickNextTask respects energy matching', () => {
    const t1 = { ...baseTask, id: '1', energyLevel: 'high' as const };
    const t2 = { ...baseTask, id: '2', energyLevel: 'low' as const };
    
    const lowEnergyContext = { ...context, energyLevel: 'low' as const };
    
    const selected = pickNextTask([t1, t2], lowEnergyContext);
    expect(selected?.id).toBe('2'); // Low energy should prefer low energy task (base score equality, but match bonus)
  });

  test('pickNextTask filters out done tasks', () => {
    const t1 = { ...baseTask, id: '1', status: 'done' as const };
    const selected = pickNextTask([t1], context);
    expect(selected).toBeNull();
  });
  
  test('generateDayPlan fits tasks into time budget', () => {
    const t1 = { ...baseTask, id: '1', estimatedMinutes: 60, priority: 1 as const };
    const t2 = { ...baseTask, id: '2', estimatedMinutes: 60, priority: 2 as const };
    const t3 = { ...baseTask, id: '3', estimatedMinutes: 300, priority: 3 as const }; // Too big if budget small
    
    const shortDayContext = { ...context, availableTimeMinutes: 100 }; // Only 100 mins
    
    const plan = generateDayPlan([t1, t2, t3], shortDayContext);
    
    expect(plan).toHaveLength(1);
    expect(plan[0].id).toBe('1'); // Should pick t1 (60m) as it fits. t2 (60m) won't fit after t1 (remaining 40). t3 (300) never fits.
  });

  test('filterTasksDueToday includes only tasks due today (supports ISO datetime)', () => {
    const now = new Date('2026-02-13T12:00:00-08:00');
    const today = { ...baseTask, id: 'today', deadline: '2026-02-13' };
    const todayIso = { ...baseTask, id: 'today-iso', deadline: '2026-02-13T00:00:00+00:00' };
    const upcoming = { ...baseTask, id: 'upcoming', deadline: '2026-02-16' };
    const noDate = { ...baseTask, id: 'nodate', deadline: undefined };

    const filtered = filterTasksDueToday([today, todayIso, upcoming, noDate], now);
    expect(filtered.map((t) => t.id)).toEqual(['today', 'today-iso']);
  });
});
