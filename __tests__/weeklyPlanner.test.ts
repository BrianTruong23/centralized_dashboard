import { generateWeeklyPlan, validateConstraints } from '@/lib/weeklyPlanner';
import { Task } from '@/types/task';
import { PlanningConstraints } from '@/types/weeklyPlan';
import { format, addDays } from 'date-fns';
import { randomUUID } from 'crypto';

// Polyfill for crypto.randomUUID in test environment
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as { crypto?: { randomUUID: () => string } }).crypto = {
    randomUUID: randomUUID,
  };
}

describe('weeklyPlanner', () => {
  describe('validateConstraints', () => {
    it('should validate valid constraints', () => {
      const constraints: PlanningConstraints = {
        startDate: '2024-01-01',
        endDate: '2024-01-07',
        totalHoursPerDay: 8,
      };

      const errors = validateConstraints(constraints);
      expect(errors).toEqual([]);
    });

    it('should reject missing dates', () => {
      const constraints: PlanningConstraints = {
        startDate: '',
        endDate: '',
        totalHoursPerDay: 8,
      };

      const errors = validateConstraints(constraints);
      expect(errors).toContain('Start date and end date are required.');
    });

    it('should reject end date before start date', () => {
      const constraints: PlanningConstraints = {
        startDate: '2024-01-07',
        endDate: '2024-01-01',
        totalHoursPerDay: 8,
      };

      const errors = validateConstraints(constraints);
      expect(errors).toContain('End date must be after start date.');
    });

    it('should reject planning horizon exceeding 14 days', () => {
      const constraints: PlanningConstraints = {
        startDate: '2024-01-01',
        endDate: '2024-01-20',
        totalHoursPerDay: 8,
      };

      const errors = validateConstraints(constraints);
      expect(errors).toContain('Planning horizon cannot exceed 14 days.');
    });

    it('should reject invalid hours per day', () => {
      const constraints: PlanningConstraints = {
        startDate: '2024-01-01',
        endDate: '2024-01-07',
        totalHoursPerDay: 20,
      };

      const errors = validateConstraints(constraints);
      expect(errors).toContain('Hours per day must be between 1 and 16.');
    });
  });

  describe('generateWeeklyPlan', () => {
    const mockTasks: Task[] = [
      {
        id: '1',
        title: 'Urgent task',
        description: 'High priority task',
        category: 'Coding',
        priority: 1,
        estimatedMinutes: 120,
        energyLevel: 'high',
        status: 'todo',
        tags: [],
        createdAt: Date.now(),
      },
      {
        id: '2',
        title: 'Normal task',
        description: 'Medium priority task',
        category: 'Research',
        priority: 3,
        estimatedMinutes: 60,
        energyLevel: 'medium',
        status: 'todo',
        tags: [],
        createdAt: Date.now(),
      },
      {
        id: '3',
        title: 'Low priority task',
        description: 'Can be done later',
        category: 'Admin',
        priority: 5,
        estimatedMinutes: 30,
        energyLevel: 'low',
        status: 'todo',
        tags: [],
        createdAt: Date.now(),
      },
    ];

    it('should generate a plan for valid tasks and constraints', () => {
      const constraints: PlanningConstraints = {
        startDate: '2024-01-01',
        endDate: '2024-01-07',
        totalHoursPerDay: 8,
        energyPreferences: {
          morningEnergy: 'high',
          afternoonEnergy: 'medium',
          eveningEnergy: 'low',
        },
      };

      const result = generateWeeklyPlan(mockTasks, constraints);

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items.length).toBeLessThanOrEqual(mockTasks.length);
      expect(result.summary).toBeTruthy();
    });

    it('should prioritize high-priority tasks', () => {
      const constraints: PlanningConstraints = {
        startDate: '2024-01-01',
        endDate: '2024-01-07',
        totalHoursPerDay: 8,
      };

      const result = generateWeeklyPlan(mockTasks, constraints);

      // First scheduled task should be the highest priority
      expect(result.items[0].priority).toBe(1);
    });

    it('should respect time constraints', () => {
      const constraints: PlanningConstraints = {
        startDate: '2024-01-01',
        endDate: '2024-01-07',
        totalHoursPerDay: 1, // Only 1 hour per day
      };

      const result = generateWeeklyPlan(mockTasks, constraints);

      // Should warn about tasks that don't fit
      expect(result.warnings).toBeDefined();
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should assign suggested start and end times', () => {
      const constraints: PlanningConstraints = {
        startDate: '2024-01-01',
        endDate: '2024-01-07',
        totalHoursPerDay: 8,
      };

      const result = generateWeeklyPlan(mockTasks, constraints);

      result.items.forEach((item) => {
        expect(item.suggested_start).toBeTruthy();
        expect(item.suggested_end).toBeTruthy();

        const start = new Date(item.suggested_start!);
        const end = new Date(item.suggested_end!);
        const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);

        expect(durationMinutes).toBe(item.estimatedMinutes);
      });
    });

    it('should return empty plan for no pending tasks', () => {
      const doneTasks: Task[] = [
        {
          ...mockTasks[0],
          status: 'done',
        },
      ];

      const constraints: PlanningConstraints = {
        startDate: '2024-01-01',
        endDate: '2024-01-07',
        totalHoursPerDay: 8,
      };

      const result = generateWeeklyPlan(doneTasks, constraints);

      expect(result.items.length).toBe(0);
      expect(result.summary).toContain('No pending tasks');
    });

    it('should maintain deterministic ordering for same priority', () => {
      const samePriorityTasks: Task[] = [
        {
          id: '1',
          title: 'Task A',
          description: '',
          category: 'Coding',
          priority: 3,
          estimatedMinutes: 60,
          energyLevel: 'medium',
          status: 'todo',
          tags: [],
          createdAt: 1000,
        },
        {
          id: '2',
          title: 'Task B',
          description: '',
          category: 'Coding',
          priority: 3,
          estimatedMinutes: 60,
          energyLevel: 'medium',
          status: 'todo',
          tags: [],
          createdAt: 2000,
        },
      ];

      const constraints: PlanningConstraints = {
        startDate: '2024-01-01',
        endDate: '2024-01-07',
        totalHoursPerDay: 8,
      };

      const result = generateWeeklyPlan(samePriorityTasks, constraints);

      // Older task (lower createdAt) should be scheduled first
      expect(result.items[0].title).toBe('Task A');
      expect(result.items[1].title).toBe('Task B');
    });

    it('should handle tasks with deadlines', () => {
      const tasksWithDeadlines: Task[] = [
        {
          id: '1',
          title: 'Task with deadline',
          description: '',
          category: 'Coding',
          priority: 3,
          estimatedMinutes: 60,
          energyLevel: 'medium',
          status: 'todo',
          tags: [],
          createdAt: Date.now(),
          deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
        },
        {
          id: '2',
          title: 'Task without deadline',
          description: '',
          category: 'Coding',
          priority: 3,
          estimatedMinutes: 60,
          energyLevel: 'medium',
          status: 'todo',
          tags: [],
          createdAt: Date.now(),
        },
      ];

      const constraints: PlanningConstraints = {
        startDate: format(new Date(), 'yyyy-MM-dd'),
        endDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
        totalHoursPerDay: 8,
      };

      const result = generateWeeklyPlan(tasksWithDeadlines, constraints);

      // Task with deadline should be scheduled first
      expect(result.items[0].title).toBe('Task with deadline');
    });
  });
});
