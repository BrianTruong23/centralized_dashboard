'use client';

import { useState } from 'react';
import { Calendar, Loader2, Sparkles, CheckCircle, X, Edit2, Clock, Zap } from 'lucide-react';
import { Task, TaskCategory, TaskEnergyLevel } from '@/types/task';
import { PlanningConstraints, WeeklyPlan, PlanItem } from '@/types/plan';
import { format, addDays, startOfWeek, parseISO } from 'date-fns';
import { plansDb, activityLog } from '@/lib/plans';

interface WeeklyPlannerProps {
  userId?: string;
  tasks: Task[];
  onAddTask: (task: Task) => void;
  onClose: () => void;
}

type WizardStep = 'constraints' | 'preview' | 'complete';

export function WeeklyPlanner({ userId, tasks, onAddTask, onClose }: WeeklyPlannerProps) {
  // Wizard state
  const [step, setStep] = useState<WizardStep>('constraints');

  // Form state
  const [goals, setGoals] = useState('');
  const [startDate, setStartDate] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 6), 'yyyy-MM-dd'));
  const [hoursPerDay, setHoursPerDay] = useState(8);
  const [categoryPriorities, setCategoryPriorities] = useState<{ [key: string]: number }>({});
  const [morningEnergy, setMorningEnergy] = useState<TaskEnergyLevel>('high');
  const [afternoonEnergy, setAfternoonEnergy] = useState<TaskEnergyLevel>('medium');
  const [eveningEnergy, setEveningEnergy] = useState<TaskEnergyLevel>('low');

  // Generated plan
  const [generatedPlan, setGeneratedPlan] = useState<WeeklyPlan | null>(null);
  const [planSummary, setPlanSummary] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);

  // UI state
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<PlanItem>>({});

  const categories: TaskCategory[] = ['Research', 'Coding', 'Admin', 'Health', 'Life', 'Finance', 'Social', 'Content', 'UX'];
  const energyLevels: TaskEnergyLevel[] = ['low', 'medium', 'high'];

  const handleGeneratePlan = async () => {
    if (!goals.trim()) {
      setError('Please enter your goals for the week');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const constraints: PlanningConstraints = {
        startDate,
        endDate,
        hoursPerDay,
        categoryPriorities: Object.keys(categoryPriorities).length > 0 ? categoryPriorities : undefined,
        energyPreferences: {
          morning: morningEnergy,
          afternoon: afternoonEnergy,
          evening: eveningEnergy,
        },
      };

      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goals,
          constraints,
          existingTasks: tasks,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate plan');
      }

      const data = await response.json();
      setGeneratedPlan(data.plan);
      setPlanSummary(data.summary);
      setWarnings(data.warnings || []);
      setStep('preview');

      // Log plan generation
      if (userId) {
        await activityLog.logActivity({
          userId,
          actor: 'agent',
          action: 'PLAN_GENERATED',
          entityType: 'plan',
          entityId: data.plan.id,
          metadata: {
            taskCount: data.plan.items.length,
            goals,
          },
        });
      }
    } catch (err: any) {
      console.error('Failed to generate plan:', err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApprovePlan = async (createTasksOnly: boolean = false) => {
    if (!generatedPlan || !userId) return;

    setIsApproving(true);
    setError(null);

    try {
      // Save plan to database
      if (!createTasksOnly) {
        generatedPlan.status = 'approved';
        await plansDb.createPlan(generatedPlan);
        await plansDb.updatePlanStatus(generatedPlan.id, 'approved');
      }

      // Create tasks from plan items
      const tasksToCreate: string[] = [];
      for (const item of generatedPlan.items) {
        const task: Task = {
          id: crypto.randomUUID(),
          user_id: userId,
          title: item.title,
          description: item.description,
          category: item.category,
          priority: item.priority,
          estimatedMinutes: item.estimatedMinutes,
          energyLevel: item.energyLevel,
          deadline: item.deadline,
          status: 'todo',
          tags: [],
          createdAt: Date.now(),
          source: 'agent',
          suggestedStart: item.suggestedStart,
          suggestedEnd: item.suggestedEnd,
          planningWeekId: createTasksOnly ? undefined : generatedPlan.id,
          planningMetadata: item.planningMetadata,
        };

        onAddTask(task);
        tasksToCreate.push(task.id);
      }

      // Log approval and task creation
      await activityLog.logActivity({
        userId,
        actor: 'user',
        action: 'PLAN_APPROVED',
        entityType: 'plan',
        entityId: generatedPlan.id,
        metadata: {
          createTasksOnly,
        },
      });

      await activityLog.logActivity({
        userId,
        actor: 'agent',
        action: 'TASKS_CREATED_FROM_PLAN',
        entityType: 'plan',
        entityId: generatedPlan.id,
        metadata: {
          count: tasksToCreate.length,
          taskIds: tasksToCreate,
        },
      });

      setStep('complete');
    } catch (err: any) {
      console.error('Failed to approve plan:', err);
      setError(err.message || 'Failed to create tasks');
    } finally {
      setIsApproving(false);
    }
  };

  const handleDiscardPlan = async () => {
    if (!generatedPlan || !userId) return;

    try {
      await activityLog.logActivity({
        userId,
        actor: 'user',
        action: 'PLAN_DISCARDED',
        entityType: 'plan',
        entityId: generatedPlan.id,
      });

      setStep('constraints');
      setGeneratedPlan(null);
      setPlanSummary('');
      setWarnings([]);
    } catch (err: any) {
      console.error('Failed to log discard:', err);
      // Continue anyway
      setStep('constraints');
      setGeneratedPlan(null);
    }
  };

  const handleEditItem = (item: PlanItem) => {
    setEditingItemId(item.id);
    setEditForm({
      title: item.title,
      description: item.description,
      category: item.category,
      priority: item.priority,
      estimatedMinutes: item.estimatedMinutes,
      energyLevel: item.energyLevel,
      deadline: item.deadline,
      suggestedStart: item.suggestedStart,
      suggestedEnd: item.suggestedEnd,
    });
  };

  const handleSaveEdit = () => {
    if (!editingItemId || !generatedPlan) return;

    const updatedItems = generatedPlan.items.map((item) =>
      item.id === editingItemId
        ? { ...item, ...editForm }
        : item
    );

    setGeneratedPlan({ ...generatedPlan, items: updatedItems });
    setEditingItemId(null);
    setEditForm({});

    // Log edit
    if (userId) {
      activityLog.logActivity({
        userId,
        actor: 'user',
        action: 'TASK_UPDATED_FROM_PLAN_EDIT',
        entityType: 'plan',
        entityId: generatedPlan.id,
        metadata: {
          itemId: editingItemId,
        },
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setEditForm({});
  };

  const groupItemsByDay = (items: PlanItem[]) => {
    const grouped: { [date: string]: PlanItem[] } = {};

    items.forEach((item) => {
      if (item.suggestedStart) {
        const date = format(parseISO(item.suggestedStart), 'yyyy-MM-dd');
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push(item);
      }
    });

    return grouped;
  };

  if (!userId) {
    return (
      <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
        <p className="text-gray-500 dark:text-gray-400 text-center">Please sign in to use the weekly planner</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Calendar size={24} className="text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-xl font-bold">Auto-Plan My Week</h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg">
          {error}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 text-sm rounded-lg">
          <ul className="list-disc list-inside">
            {warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Step 1: Constraints */}
      {step === 'constraints' && (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold mb-2">Goals for the Week</label>
            <textarea
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
              placeholder="What are you trying to accomplish this week?"
              className="w-full h-24 p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 resize-none focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full p-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full p-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Available Hours per Day</label>
            <input
              type="number"
              value={hoursPerDay}
              onChange={(e) => setHoursPerDay(Number(e.target.value))}
              min="1"
              max="16"
              className="w-full p-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Energy Preferences</label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Morning</label>
                <select
                  value={morningEnergy}
                  onChange={(e) => setMorningEnergy(e.target.value as TaskEnergyLevel)}
                  className="w-full mt-1 p-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm"
                >
                  {energyLevels.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Afternoon</label>
                <select
                  value={afternoonEnergy}
                  onChange={(e) => setAfternoonEnergy(e.target.value as TaskEnergyLevel)}
                  className="w-full mt-1 p-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm"
                >
                  {energyLevels.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Evening</label>
                <select
                  value={eveningEnergy}
                  onChange={(e) => setEveningEnergy(e.target.value as TaskEnergyLevel)}
                  className="w-full mt-1 p-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm"
                >
                  {energyLevels.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleGeneratePlan}
              disabled={isGenerating || !goals.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Generate Plan
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Preview */}
      {step === 'preview' && generatedPlan && (
        <div className="space-y-6">
          <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
            <p className="text-sm text-gray-700 dark:text-gray-300">{planSummary}</p>
          </div>

          <div className="space-y-4 max-h-96 overflow-y-auto">
            {Object.entries(groupItemsByDay(generatedPlan.items)).map(([date, items]) => (
              <div key={date} className="space-y-2">
                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {format(parseISO(date), 'EEEE, MMM d')}
                </h3>
                {items.map((item) => (
                  <div key={item.id}>
                    {editingItemId === item.id ? (
                      <div className="p-3 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-gray-800 space-y-2">
                        <input
                          type="text"
                          value={editForm.title || ''}
                          onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={handleCancelEdit}
                            className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveEdit}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {item.title}
                              </h4>
                              {item.description && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                                  {item.description}
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => handleEditItem(item)}
                              className="p-1.5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                            >
                              <Edit2 size={14} />
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            {item.suggestedStart && (
                              <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                <Clock size={12} />
                                {format(parseISO(item.suggestedStart), 'h:mm a')}
                              </span>
                            )}
                            <span className="text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300">
                              {item.estimatedMinutes}m
                            </span>
                            <span className="text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300">
                              {item.category}
                            </span>
                            <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300 capitalize">
                              <Zap size={10} />
                              {item.energyLevel}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleDiscardPlan}
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Discard
            </button>
            <button
              onClick={() => handleApprovePlan(true)}
              disabled={isApproving}
              className="px-4 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-lg transition-colors disabled:opacity-50"
            >
              Create Tasks Only
            </button>
            <button
              onClick={() => handleApprovePlan(false)}
              disabled={isApproving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isApproving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <CheckCircle size={16} />
                  Create Tasks + Plan
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Complete */}
      {step === 'complete' && generatedPlan && (
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
            <CheckCircle size={32} className="text-green-600 dark:text-green-400" />
          </div>
          <h3 className="text-xl font-bold mb-2">Plan Created Successfully!</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {generatedPlan.items.length} tasks have been added to your list with suggested time blocks.
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2 text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
