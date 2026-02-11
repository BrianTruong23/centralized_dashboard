'use client';

import { useState } from 'react';
import { Task, TaskCategory, TaskEnergyLevel } from '@/types/task';
import { PlanningConstraints, WeeklyPlan, WeeklyPlanItem } from '@/types/weeklyPlan';
import { Loader2, CalendarRange, X, ChevronRight, ChevronLeft, Plus, CheckCircle, AlertCircle, Pencil, Clock } from 'lucide-react';
import { format, addDays, startOfWeek, parseISO } from 'date-fns';
import { weeklyPlanDb } from '@/lib/weeklyPlanDb';
import { logPlanApproved, logTasksCreatedFromPlan, logPlanDiscarded } from '@/lib/activityLog';

interface WeeklyPlannerProps {
  userId?: string;
  tasks: Task[];
  onAddTask: (task: Task) => void;
  onClose: () => void;
}

type WizardStep = 'inputs' | 'preview' | 'done';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const categories: TaskCategory[] = ['Research', 'Coding', 'Admin', 'Health', 'Life', 'Finance', 'Social', 'Content', 'UX'];
const energyLevels: TaskEnergyLevel[] = ['low', 'medium', 'high'];

export function WeeklyPlanner({ userId, tasks, onAddTask, onClose }: WeeklyPlannerProps) {
  const [step, setStep] = useState<WizardStep>('inputs');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Inputs
  const [goals, setGoals] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    return format(monday, 'yyyy-MM-dd');
  });
  const [endDate, setEndDate] = useState(() => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    const sunday = addDays(monday, 6);
    return format(sunday, 'yyyy-MM-dd');
  });
  const [hoursPerDay, setHoursPerDay] = useState(8);
  const [morningEnergy, setMorningEnergy] = useState<TaskEnergyLevel>('high');
  const [afternoonEnergy, setAfternoonEnergy] = useState<TaskEnergyLevel>('medium');
  const [eveningEnergy, setEveningEnergy] = useState<TaskEnergyLevel>('low');

  // Step 2: Preview
  const [generatedPlan, setGeneratedPlan] = useState<WeeklyPlan | null>(null);
  const [planSummary, setPlanSummary] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<WeeklyPlanItem | null>(null);

  const handleGeneratePlan = async () => {
    if (!userId) {
      setError('Please sign in to create a plan.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const constraints: PlanningConstraints = {
      startDate,
      endDate,
      totalHoursPerDay: hoursPerDay,
      energyPreferences: {
        morningEnergy,
        afternoonEnergy,
        eveningEnergy,
      },
    };

    try {
      const res = await fetch('/api/plan-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          goals,
          constraints,
          existingTasks: tasks.filter(t => t.status !== 'done'),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate plan');
      }

      const data = await res.json();
      setGeneratedPlan(data.plan);
      setPlanSummary(data.summary);
      setWarnings(data.warnings || []);
      setStep('preview');
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditItem = (item: WeeklyPlanItem) => {
    setEditingItem(item.id);
    setEditForm({ ...item });
  };

  const handleSaveEdit = () => {
    if (!editForm || !generatedPlan) return;

    const updatedItems = generatedPlan.items.map(item =>
      item.id === editForm.id ? editForm : item
    );

    setGeneratedPlan({
      ...generatedPlan,
      items: updatedItems,
    });

    setEditingItem(null);
    setEditForm(null);
  };

  const handleMoveToDay = (itemId: string, newDay: number) => {
    if (!generatedPlan) return;

    const updatedItems = generatedPlan.items.map(item => {
      if (item.id === itemId) {
        // Update day and recalculate suggested times
        const newDate = addDays(parseISO(startDate), newDay);
        const hour = item.suggested_start ? new Date(item.suggested_start).getHours() : 9;
        const minute = item.suggested_start ? new Date(item.suggested_start).getMinutes() : 0;

        const newStart = new Date(newDate);
        newStart.setHours(hour, minute, 0, 0);

        const newEnd = new Date(newStart);
        newEnd.setMinutes(newEnd.getMinutes() + item.estimatedMinutes);

        return {
          ...item,
          day_of_week: newDay,
          suggested_start: newStart.toISOString(),
          suggested_end: newEnd.toISOString(),
        };
      }
      return item;
    });

    setGeneratedPlan({
      ...generatedPlan,
      items: updatedItems,
    });
  };

  const handleApprovePlan = async (createTasksOnly: boolean = false) => {
    if (!generatedPlan || !userId) return;

    setIsLoading(true);
    setError(null);

    try {
      // Save plan to database
      const savedPlan = await weeklyPlanDb.createPlan({
        user_id: userId,
        title: generatedPlan.title,
        goals: generatedPlan.goals,
        constraints: generatedPlan.constraints,
        start_date: generatedPlan.start_date,
        end_date: generatedPlan.end_date,
        status: 'approved',
      });

      // Save plan items
      const itemsToCreate = generatedPlan.items.map((item, index) => ({
        plan_id: savedPlan.id,
        task_id: item.task_id,
        title: item.title,
        description: item.description,
        category: item.category,
        priority: item.priority,
        estimatedMinutes: item.estimatedMinutes,
        energyLevel: item.energyLevel,
        suggested_start: createTasksOnly ? undefined : item.suggested_start,
        suggested_end: createTasksOnly ? undefined : item.suggested_end,
        day_of_week: item.day_of_week,
        sequence_order: index,
      }));

      await weeklyPlanDb.createPlanItems(itemsToCreate);

      // Create tasks from plan items (only for items without existing task_id)
      const newTasks = generatedPlan.items
        .filter(item => !item.task_id)
        .map(item => ({
          id: crypto.randomUUID(),
          user_id: userId,
          title: item.title,
          description: item.description,
          category: item.category,
          priority: item.priority,
          estimatedMinutes: item.estimatedMinutes,
          energyLevel: item.energyLevel,
          status: 'todo' as const,
          tags: [],
          createdAt: Date.now(),
          source: 'agent' as const,
          suggested_start: createTasksOnly ? undefined : item.suggested_start,
          suggested_end: createTasksOnly ? undefined : item.suggested_end,
          planning_week_id: savedPlan.id,
        }));

      // Add tasks to the task list
      for (const task of newTasks) {
        onAddTask(task);
      }

      // Log activities
      await logPlanApproved(savedPlan.id, generatedPlan.items.length);
      if (newTasks.length > 0) {
        await logTasksCreatedFromPlan(savedPlan.id, newTasks.length);
      }

      setStep('done');
    } catch (err: any) {
      setError(err.message || 'Failed to save plan');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDiscard = async () => {
    if (generatedPlan) {
      // Log that the plan was discarded
      await logPlanDiscarded(generatedPlan.id);
    }
    onClose();
  };

  // Group items by day
  const itemsByDay = generatedPlan?.items.reduce((acc, item) => {
    if (!acc[item.day_of_week]) acc[item.day_of_week] = [];
    acc[item.day_of_week].push(item);
    return acc;
  }, {} as Record<number, WeeklyPlanItem[]>) || {};

  if (!userId) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full">
          <p className="text-center text-gray-600 dark:text-gray-300">
            Please sign in to use the weekly planner.
          </p>
          <button
            onClick={onClose}
            className="mt-4 w-full py-2 px-4 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto my-8">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <CalendarRange size={24} className="text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-2xl font-bold">Auto-Plan My Week</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg flex items-start gap-3">
              <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          {step === 'inputs' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  What are you trying to accomplish this week?
                </label>
                <textarea
                  value={goals}
                  onChange={(e) => setGoals(e.target.value)}
                  placeholder="E.g., Finish project proposal, prepare for presentation, catch up on research..."
                  className="w-full p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 resize-none focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">
                  Available Hours Per Day: {hoursPerDay}h
                </label>
                <input
                  type="range"
                  min="1"
                  max="16"
                  value={hoursPerDay}
                  onChange={(e) => setHoursPerDay(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-3">Energy Preferences</label>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Morning</label>
                    <select
                      value={morningEnergy}
                      onChange={(e) => setMorningEnergy(e.target.value as TaskEnergyLevel)}
                      className="w-full p-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      {energyLevels.map(level => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Afternoon</label>
                    <select
                      value={afternoonEnergy}
                      onChange={(e) => setAfternoonEnergy(e.target.value as TaskEnergyLevel)}
                      className="w-full p-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      {energyLevels.map(level => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Evening</label>
                    <select
                      value={eveningEnergy}
                      onChange={(e) => setEveningEnergy(e.target.value as TaskEnergyLevel)}
                      className="w-full p-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      {energyLevels.map(level => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGeneratePlan}
                  disabled={isLoading}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      Generate Plan
                      <ChevronRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {step === 'preview' && generatedPlan && (
            <div className="space-y-6">
              <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
                <p className="text-sm text-indigo-900 dark:text-indigo-100">{planSummary}</p>
              </div>

              {warnings.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={16} className="text-amber-600 dark:text-amber-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-1">Warnings</p>
                      <ul className="text-sm text-amber-800 dark:text-amber-200 space-y-1">
                        {warnings.map((warning, i) => (
                          <li key={i}>• {warning}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {Object.entries(itemsByDay)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([day, items]) => {
                    const dayNum = Number(day);
                    const dayDate = addDays(parseISO(startDate), dayNum);

                    return (
                      <div key={day} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                        <div className="bg-gray-50 dark:bg-gray-900 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                          <h3 className="font-semibold">
                            {DAYS_OF_WEEK[dayNum]} - {format(dayDate, 'MMM d')}
                          </h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {items.reduce((sum, item) => sum + item.estimatedMinutes, 0)} minutes scheduled
                          </p>
                        </div>
                        <div className="p-4 space-y-3">
                          {items.map((item) => (
                            <div key={item.id}>
                              {editingItem === item.id && editForm ? (
                                <div className="p-3 border-2 border-indigo-300 dark:border-indigo-700 rounded-lg bg-white dark:bg-gray-800 space-y-3">
                                  <input
                                    type="text"
                                    value={editForm.title}
                                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  />
                                  <div className="grid grid-cols-2 gap-2">
                                    <select
                                      value={editForm.category}
                                      onChange={(e) => setEditForm({ ...editForm, category: e.target.value as TaskCategory })}
                                      className="px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                      {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                    </select>
                                    <input
                                      type="number"
                                      value={editForm.estimatedMinutes}
                                      onChange={(e) => setEditForm({ ...editForm, estimatedMinutes: Number(e.target.value) })}
                                      className="px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                  </div>
                                  <div className="flex justify-end gap-2">
                                    <button
                                      onClick={() => { setEditingItem(null); setEditForm(null); }}
                                      className="px-3 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={handleSaveEdit}
                                      className="px-3 py-1 text-xs text-white bg-indigo-600 hover:bg-indigo-700 rounded transition-colors"
                                    >
                                      Save
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                                  <div className="flex-1">
                                    <div className="flex items-start justify-between gap-2">
                                      <h4 className="font-medium text-sm">{item.title}</h4>
                                      <button
                                        onClick={() => handleEditItem(item)}
                                        className="p-1 hover:bg-white dark:hover:bg-gray-700 rounded transition-colors"
                                      >
                                        <Pencil size={14} className="text-gray-400" />
                                      </button>
                                    </div>
                                    {item.description && (
                                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{item.description}</p>
                                    )}
                                    <div className="flex flex-wrap gap-2 mt-2">
                                      <span className="text-xs px-2 py-0.5 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                                        {item.category}
                                      </span>
                                      <span className="text-xs px-2 py-0.5 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 flex items-center gap-1">
                                        <Clock size={10} />
                                        {item.estimatedMinutes}m
                                      </span>
                                      {item.suggested_start && (
                                        <span className="text-xs px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded">
                                          {format(new Date(item.suggested_start), 'h:mm a')}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>

              <div className="flex justify-between gap-3 pt-4">
                <button
                  onClick={() => setStep('inputs')}
                  className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-2"
                >
                  <ChevronLeft size={16} />
                  Back
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={handleDiscard}
                    className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    Discard
                  </button>
                  <button
                    onClick={() => handleApprovePlan(true)}
                    disabled={isLoading}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
                  >
                    Create Tasks Only
                  </button>
                  <button
                    onClick={() => handleApprovePlan(false)}
                    disabled={isLoading}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <CheckCircle size={16} />
                        Create Tasks + Schedule
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full mb-4">
                <CheckCircle size={32} className="text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-xl font-bold mb-2">Plan Created Successfully!</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                Your tasks have been created and added to your task list.
              </p>
              <button
                onClick={onClose}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
