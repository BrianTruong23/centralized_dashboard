import { generateWeeklyPlan, generatePlanSummary, validateConstraints } from '@/lib/weeklyPlanner';
import { Task } from '@/types/task';
import { PlanningConstraints } from '@/types/plan';
import { addDays, format } from 'date-fns';

describe('Weekly Planner', () => {
  const mockUserId = 'test-user-123';
  const today = new Date('2026-02-10T09:00:00Z');
  const startDate = format(today, 'yyyy-MM-dd');
  const endDate = format(addDays(today, 6), 'yyyy-MM-dd');

  const mockTasks: Task[] = [
    {
      id: '1',
      title: 'High priority urgent task',
      description: 'Important work',
      category: 'Coding',
      priority: 1,
      estimatedMinutes: 120,
      energyLevel: 'high',
      deadline: format(addDays(today, 1), 'yyyy-MM-dd'),
      status: 'todo',
      tags: [],
      createdAt: Date.now() - 1000000,
    },
    {
      id: '2',
      title: 'Medium priority task',
      description: 'Regular work',
      category: 'Research',
      priority: 3,
      estimatedMinutes: 60,
      energyLevel: 'medium',
      status: 'todo',
      tags: [],
      createdAt: Date.now() - 500000,
    },
    {
      id: '3',
      title: 'Low priority task',
      description: 'Nice to have',
      category: 'Admin',
      priority: 5,
      estimatedMinutes: 30,
      energyLevel: 'low',
      status: 'todo',
      tags: [],
      createdAt: Date.now(),
    },
    {
      id: '4',
      title: 'Completed task',
      description: 'Already done',
      category: 'Life',
      priority: 3,
      estimatedMinutes: 45,
      energyLevel: 'medium',
      status: 'done',
      tags: [],
      createdAt: Date.now() - 2000000,
    },
  ];

  const basicConstraints: PlanningConstraints = {
    startDate,
    endDate,
    hoursPerDay: 8,
    energyPreferences: {
      morning: 'high',
      afternoon: 'medium',
      evening: 'low',
    },
  };

  describe('generateWeeklyPlan', () => {
    it('should generate a plan with correct metadata', () => {
      const plan = generateWeeklyPlan(mockUserId, 'Complete weekly goals', basicConstraints, mockTasks);

      expect(plan).toBeDefined();
      expect(plan.userId).toBe(mockUserId);
      expect(plan.title).toContain('Week of');
      expect(plan.goals).toBe('Complete weekly goals');
      expect(plan.status).toBe('draft');
      expect(plan.dateRangeStart).toBe(startDate);
      expect(plan.dateRangeEnd).toBe(endDate);
    });

    it('should only include incomplete tasks', () => {
      const plan = generateWeeklyPlan(mockUserId, 'Test goals', basicConstraints, mockTasks);

      // Should have 3 incomplete tasks (task 4 is done)
      const uniqueTaskIds = new Set(plan.items.map(item => item.taskId));
      expect(uniqueTaskIds.has('4')).toBe(false);
      expect(uniqueTaskIds.size).toBeLessThanOrEqual(3);
    });

    it('should prioritize high priority tasks first', () => {
      const plan = generateWeeklyPlan(mockUserId, 'Test goals', basicConstraints, mockTasks);

      // First item should be the high priority task
      const firstItem = plan.items[0];
      expect(firstItem.taskId).toBe('1');
      expect(firstItem.priority).toBe(1);
    });

    it('should allocate tasks within available time', () => {
      const plan = generateWeeklyPlan(mockUserId, 'Test goals', basicConstraints, mockTasks);

      // Total time should not exceed available time for the week
      const totalMinutes = plan.items.reduce((sum, item) => sum + item.estimatedMinutes, 0);
      const maxMinutes = 7 * 8 * 60; // 7 days * 8 hours * 60 minutes

      expect(totalMinutes).toBeLessThanOrEqual(maxMinutes);
    });

    it('should assign suggested start and end times', () => {
      const plan = generateWeeklyPlan(mockUserId, 'Test goals', basicConstraints, mockTasks);

      plan.items.forEach(item => {
        expect(item.suggestedStart).toBeDefined();
        expect(item.suggestedEnd).toBeDefined();

        if (item.suggestedStart && item.suggestedEnd) {
          const start = new Date(item.suggestedStart);
          const end = new Date(item.suggestedEnd);
          expect(end.getTime()).toBeGreaterThan(start.getTime());
        }
      });
    });

    it('should respect category priorities', () => {
      const constraintsWithPriorities: PlanningConstraints = {
        ...basicConstraints,
        categoryPriorities: {
          Coding: 5,
          Research: 3,
          Admin: 1,
        },
      };

      const plan = generateWeeklyPlan(mockUserId, 'Test goals', constraintsWithPriorities, mockTasks);

      // Tasks should be generally ordered by category priority (though deadline also matters)
      const codingItemIndex = plan.items.findIndex(item => item.category === 'Coding');
      const adminItemIndex = plan.items.findIndex(item => item.category === 'Admin');

      // Coding (priority 5) should come before Admin (priority 1)
      if (codingItemIndex >= 0 && adminItemIndex >= 0) {
        expect(codingItemIndex).toBeLessThan(adminItemIndex);
      }
    });
  });

  describe('generatePlanSummary', () => {
    it('should generate a summary with task count and total time', () => {
      const plan = generateWeeklyPlan(mockUserId, 'Test goals', basicConstraints, mockTasks);
      const summary = generatePlanSummary(plan);

      expect(summary).toContain('task');
      expect(summary).toContain('hour');
    });

    it('should mention high priority items', () => {
      const plan = generateWeeklyPlan(mockUserId, 'Test goals', basicConstraints, mockTasks);
      const summary = generatePlanSummary(plan);

      expect(summary).toContain('high-priority');
    });

    it('should mention tasks with deadlines', () => {
      const plan = generateWeeklyPlan(mockUserId, 'Test goals', basicConstraints, mockTasks);
      const summary = generatePlanSummary(plan);

      // Task 1 has a deadline
      expect(summary).toContain('deadline');
    });
  });

  describe('validateConstraints', () => {
    it('should return no warnings for valid constraints', () => {
      const warnings = validateConstraints(basicConstraints);
      expect(warnings).toEqual([]);
    });

    it('should warn if end date is before start date', () => {
      const invalidConstraints: PlanningConstraints = {
        ...basicConstraints,
        endDate: format(addDays(today, -1), 'yyyy-MM-dd'),
      };

      const warnings = validateConstraints(invalidConstraints);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('after start date');
    });

    it('should warn if planning horizon is too long', () => {
      const longConstraints: PlanningConstraints = {
        ...basicConstraints,
        endDate: format(addDays(today, 20), 'yyyy-MM-dd'),
      };

      const warnings = validateConstraints(longConstraints);
      expect(warnings.some(w => w.includes('2 weeks'))).toBe(true);
    });

    it('should warn if hours per day is invalid', () => {
      const invalidHoursConstraints: PlanningConstraints = {
        ...basicConstraints,
        hoursPerDay: 20,
      };

      const warnings = validateConstraints(invalidHoursConstraints);
      expect(warnings.some(w => w.includes('between 1 and 16'))).toBe(true);
    });
  });

  describe('plan stability', () => {
    it('should produce consistent results for same input', () => {
      const plan1 = generateWeeklyPlan(mockUserId, 'Test goals', basicConstraints, mockTasks);
      const plan2 = generateWeeklyPlan(mockUserId, 'Test goals', basicConstraints, mockTasks);

      // Task order should be the same
      expect(plan1.items.length).toBe(plan2.items.length);
      plan1.items.forEach((item1, index) => {
        const item2 = plan2.items[index];
        expect(item1.taskId).toBe(item2.taskId);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty task list', () => {
      const plan = generateWeeklyPlan(mockUserId, 'Test goals', basicConstraints, []);

      expect(plan.items).toEqual([]);
    });

    it('should handle tasks that are all completed', () => {
      const completedTasks: Task[] = mockTasks.map(t => ({ ...t, status: 'done' as const }));
      const plan = generateWeeklyPlan(mockUserId, 'Test goals', basicConstraints, completedTasks);

      expect(plan.items).toEqual([]);
    });

    it('should handle tasks that exceed available time', () => {
      const largeTasks: Task[] = [
        {
          id: '1',
          title: 'Huge task',
          description: 'Very long task',
          category: 'Coding',
          priority: 1,
          estimatedMinutes: 5000, // More than available in a week
          energyLevel: 'high',
          status: 'todo',
          tags: [],
          createdAt: Date.now(),
        },
      ];

      const plan = generateWeeklyPlan(mockUserId, 'Test goals', basicConstraints, largeTasks);

      // Should either skip the task or split it across multiple blocks
      const totalMinutes = plan.items.reduce((sum, item) => sum + item.estimatedMinutes, 0);
      expect(totalMinutes).toBeLessThanOrEqual(7 * 8 * 60);
    });
  });
});
