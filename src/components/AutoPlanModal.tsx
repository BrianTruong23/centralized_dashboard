'use client';

import { useState } from 'react';
import { Project, CreateProjectInput } from '@/types/project';
import { Loader2, Sparkles, X, Check, Calendar, AlertTriangle } from 'lucide-react';
import { Task, TaskCategory } from '@/types/task';

interface AutoPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTasks: (tasks: Task[]) => void | Promise<void>;
  userId: string;
  projects: Project[];
  addProject: (input: CreateProjectInput) => Promise<Project | undefined>;
}

interface PlannedTask {
  title: string;
  reason: string;
  estimated_minutes: number;
  project: string; // Project Name
  priority: 1 | 2 | 3 | 4 | 5;
  is_assumption: boolean;
  day: string;
  date: string; // YYYY-MM-DD
}

interface WeekPlan {
  day: string;
  date: string;
  tasks: PlannedTask[];
}

export function AutoPlanModal({ isOpen, onClose, onAddTasks, userId, projects, addProject }: AutoPlanModalProps) {
  const [step, setStep] = useState<'input' | 'loading' | 'review'>('input');
  const [notes, setNotes] = useState('');
  const [weekPlan, setWeekPlan] = useState<WeekPlan[]>([]);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set()); // unique key: day-index
  const [error, setError] = useState<string | null>(null);

  // Missing Projects State
  const [pendingProjects, setPendingProjects] = useState<Set<string>>(new Set());
  const [confirmedProjects, setConfirmedProjects] = useState<Set<string>>(new Set());
  const [isCreatingProjects, setIsCreatingProjects] = useState(false);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!notes.trim()) return;
    setStep('loading');
    setError(null);

    try {
      const res = await fetch('/api/auto-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            notes, 
            startDate: new Date().toLocaleDateString('en-CA') // Send LOCAL date yyyy-mm-dd
        }),
      });

      if (!res.ok) throw new Error('Failed to generate plan');

      const data = await res.json();
      setWeekPlan(data.week_plan || []);
      setAssumptions(data.assumptions || []);
      
      // Auto-select all tasks initially
      const allTaskKeys = new Set<string>();
      const potentialProjects = new Set<string>();
      
      (data.week_plan || []).forEach((day: WeekPlan) => {
        day.tasks.forEach((task, idx) => {
            allTaskKeys.add(`${day.date}-${idx}`);
            if (task.project) potentialProjects.add(task.project.trim());
        });
      });
      setSelectedTasks(allTaskKeys);
      
      // Identify new projects
      const existingNames = new Set(projects.map(p => p.name.trim().toLowerCase()));
      const newProjs = Array.from(potentialProjects).filter(name => 
          name && !existingNames.has(name.toLowerCase()) && name !== 'Admin'
      );
      
      const newProjSet = new Set(newProjs);
      setPendingProjects(newProjSet);
      setConfirmedProjects(newProjSet); // Check all by default

      setStep('review');
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setStep('input');
    }
  };

  const toggleTaskSelection = (dayDate: string, idx: number) => {
    const key = `${dayDate}-${idx}`;
    const newSelected = new Set(selectedTasks);
    if (newSelected.has(key)) {
        newSelected.delete(key);
    } else {
        newSelected.add(key);
    }
    setSelectedTasks(newSelected);
  };

  const toggleProjectConfirmation = (projectName: string) => {
    const newConfirmed = new Set(confirmedProjects);
    if (newConfirmed.has(projectName)) {
        newConfirmed.delete(projectName);
    } else {
        newConfirmed.add(projectName);
    }
    setConfirmedProjects(newConfirmed);
  };

  const handleCreateTasks = async () => {
    setIsCreatingProjects(true);
    
    try {
      // 1. Collect selected tasks
      const tasksToCreate: PlannedTask[] = [];
      weekPlan.forEach(day => {
          day.tasks.forEach((task, idx) => {
              if (selectedTasks.has(`${day.date}-${idx}`)) {
                  tasksToCreate.push({ ...task, day: day.day, date: day.date });
              }
          });
      });

      if (tasksToCreate.length === 0) {
          onClose();
          return;
      }

      // 2. Identify which projects need to be created
      const usedProjectNames = new Set(tasksToCreate.map(t => t.project.trim()));
      const existingProjectNames = new Set(projects.map(p => p.name.trim().toLowerCase()));
      
      const projectsToCreate = Array.from(usedProjectNames).filter(name => 
          name && 
          !existingProjectNames.has(name.toLowerCase()) && 
          name !== 'Admin' &&
          confirmedProjects.has(name)
      );

      // 3. Create projects SEQUENTIALLY (avoids connection contention with Supabase)
      console.log(`[AutoPlan] Creating ${projectsToCreate.length} new projects BEFORE tasks...`);
      const newProjectMap: Record<string, string> = {};

      for (const name of projectsToCreate) {
          try {
              console.log(`[AutoPlan] Creating project: "${name}"...`);
              const project = await addProject({ name, color: '#3b82f6' });
              if (project) {
                  newProjectMap[name.toLowerCase()] = project.id;
                  console.log(`[AutoPlan] ✓ Project "${name}" created with id: ${project.id}`);
              }
          } catch (e: any) {
              console.warn(`[AutoPlan] ✗ Failed to create project "${name}":`, e?.message);
          }
      }
      console.log(`[AutoPlan] Projects done. Now building task list...`);

      // 4. Build complete project name → ID map (existing + newly created)
      const projectMap = new Map<string, string>();
      projects.forEach(p => projectMap.set(p.name.trim().toLowerCase(), p.id));
      Object.entries(newProjectMap).forEach(([name, id]) => projectMap.set(name, id));

      // 5. NOW create tasks with valid project_ids  
      const finalTasks: Task[] = tasksToCreate.map(pt => {
          const resolvedProjectId = projectMap.get(pt.project.trim().toLowerCase());
          console.log(`[AutoPlan] Task "${pt.title}" → project "${pt.project}" → id: ${resolvedProjectId || 'NONE (will go to Inbox)'}`);
          return {
              id: crypto.randomUUID(),
              user_id: userId,
              title: pt.title,
              description: pt.reason ? `Scheduled: ${pt.reason}` : '',
              category: pt.project.trim() || 'Life',
              project_id: resolvedProjectId,
              priority: pt.priority,
              estimatedMinutes: pt.estimated_minutes,
              energyLevel: 'medium',
              status: 'todo',
              deadline: pt.date,
              tags: ['auto-plan'],
              createdAt: Date.now(),
          };
      });

      console.log(`[AutoPlan] Adding ${finalTasks.length} tasks...`);
      await onAddTasks(finalTasks);
    } catch (e) {
      console.error('[AutoPlan] Unexpected error:', e);
    } finally {
      setIsCreatingProjects(false);
      onClose();
      setStep('input');
      setNotes('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
            <div className="flex items-center gap-2">
                <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-black dark:text-white">
                    <Sparkles size={18} />
                </div>
                <div>
                    <h2 className="font-bold text-gray-900 dark:text-gray-100">Auto Plan My Week</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">AI-powered weekly scheduling</p>
                </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                <X size={20} className="text-gray-500" />
            </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
            {step === 'input' && (
                <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        Paste your brain dump, goals, and deadlines for the upcoming week. The AI will organize them into a feasible schedule.
                    </p>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="e.g. Finish the Q3 report by Wednesday, Buy groceries for Friday's dinner, Call Mom on Sunday (urgent)..."
                        className="w-full h-64 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-black dark:focus:ring-white focus:outline-none resize-none"
                    />
                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg flex items-center gap-2">
                            <AlertTriangle size={16} />
                            {error}
                        </div>
                    )}
                </div>
            )}

            {step === 'loading' && (
                <div className="flex flex-col items-center justify-center h-64 space-y-4">
                    <Loader2 size={40} className="animate-spin text-black dark:text-white" />
                    <p className="text-gray-500 dark:text-gray-400 font-medium animate-pulse">
                        Designing your perfect week...
                    </p>
                </div>
            )}

            {step === 'review' && (
                <div className="space-y-6">
                    {/* Assumptions */}
                    {assumptions.length > 0 && (
                        <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 rounded-lg">
                            <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                <AlertTriangle size={14} />
                                Assumptions Made
                            </h4>
                            <ul className="list-disc list-inside text-xs text-gray-600 dark:text-gray-400 space-y-1">
                                {assumptions.map((a, i) => <li key={i}>{a}</li>)}
                            </ul>
                        </div>
                    )}

                    {/* New Project Confirmation */}
                    {pendingProjects.size > 0 && (
                        <div className="p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 rounded-lg">
                             <h4 className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300 mb-3">
                                <Sparkles size={14} />
                                New Projects Detected
                            </h4>
                            <p className="text-xs text-blue-600 dark:text-blue-400 mb-3">
                                The AI found these new projects. Select the ones you want to create automatically. Unselected projects will likely end up in Inbox.
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {Array.from(pendingProjects).map(proj => (
                                    <button
                                        key={proj}
                                        onClick={() => toggleProjectConfirmation(proj)}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                            confirmedProjects.has(proj)
                                                ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                                                : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-blue-200'
                                        }`}
                                    >
                                        <div className={`w-3 h-3 rounded-full border flex items-center justify-center ${
                                            confirmedProjects.has(proj) ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                                        }`}>
                                            {confirmedProjects.has(proj) && <Check size={8} className="text-white" />}
                                        </div>
                                        {proj}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {weekPlan.map((day, dayIdx) => (
                            <div key={day.date} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                                <div className="px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                                    <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{day.day}</span>
                                    <span className="text-xs text-gray-500">{new Date(day.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                </div>
                                <div className="p-2 space-y-2">
                                    {day.tasks.length === 0 ? (
                                        <div className="text-xs text-center text-gray-400 py-4 italic">No tasks scheduled</div>
                                    ) : (
                                        day.tasks.map((task, idx) => {
                                            const isSelected = selectedTasks.has(`${day.date}-${idx}`);
                                            return (
                                                <div 
                                                    key={idx}
                                                    className={`p-3 rounded-lg border transition-all ${
                                                        isSelected 
                                                            ? 'bg-white dark:bg-gray-800 border-black dark:border-white shadow-sm ring-1 ring-black dark:ring-white' 
                                                            : 'bg-gray-50 dark:bg-gray-900 border-transparent opacity-60 hover:opacity-80'
                                                    }`}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        {/* Checkbox */}
                                                        <div 
                                                            onClick={() => toggleTaskSelection(day.date, idx)}
                                                            className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                                                                isSelected ? 'bg-black dark:bg-white border-black dark:border-white' : 'border-gray-300 dark:border-gray-600'
                                                            }`}
                                                        >
                                                            {isSelected && <Check size={10} className="text-white dark:text-black" />}
                                                        </div>
                                                        
                                                        {/* Editable fields */}
                                                        <div className="flex-1 min-w-0 space-y-1.5">
                                                            {/* Title - editable */}
                                                            <input
                                                                type="text"
                                                                value={task.title}
                                                                onChange={(e) => {
                                                                    const updated = [...weekPlan];
                                                                    updated[dayIdx].tasks[idx] = { ...task, title: e.target.value };
                                                                    setWeekPlan(updated);
                                                                }}
                                                                className="w-full text-sm font-medium text-gray-900 dark:text-gray-100 bg-transparent border-none outline-none focus:bg-gray-50 dark:focus:bg-gray-900 focus:ring-1 focus:ring-gray-300 dark:focus:ring-gray-600 rounded px-1 -ml-1"
                                                            />
                                                            
                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                {/* Project - editable */}
                                                                <input
                                                                    type="text"
                                                                    value={task.project}
                                                                    onChange={(e) => {
                                                                        const updated = [...weekPlan];
                                                                        updated[dayIdx].tasks[idx] = { ...task, project: e.target.value };
                                                                        setWeekPlan(updated);
                                                                    }}
                                                                    className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300 border-none outline-none focus:ring-1 focus:ring-gray-400 w-16 min-w-0"
                                                                />
                                                                
                                                                {/* Priority - click to cycle */}
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const nextPriority = (task.priority % 4) + 1;
                                                                        const updated = [...weekPlan];
                                                                        updated[dayIdx].tasks[idx] = { ...task, priority: nextPriority as 1|2|3|4 };
                                                                        setWeekPlan(updated);
                                                                    }}
                                                                    title="Click to change priority"
                                                                    className={`text-[10px] px-1.5 py-0.5 rounded font-bold cursor-pointer hover:opacity-80 transition-opacity ${
                                                                        task.priority === 1 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                                                                        task.priority === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' :
                                                                        task.priority === 3 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                                                                        'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                                                                    }`}
                                                                >
                                                                    P{task.priority}
                                                                </button>
                                                                
                                                                {/* Time - editable */}
                                                                <div className="flex items-center gap-0.5 ml-auto">
                                                                    <input
                                                                        type="number"
                                                                        value={task.estimated_minutes}
                                                                        onChange={(e) => {
                                                                            const updated = [...weekPlan];
                                                                            updated[dayIdx].tasks[idx] = { ...task, estimated_minutes: parseInt(e.target.value) || 0 };
                                                                            setWeekPlan(updated);
                                                                        }}
                                                                        className="text-[10px] text-gray-400 w-8 bg-transparent border-none outline-none text-right focus:ring-1 focus:ring-gray-400 rounded"
                                                                        min={0}
                                                                    />
                                                                    <span className="text-[10px] text-gray-400">m</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 flex justify-between items-center">
            {step === 'input' ? (
                <>
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                        Cancel
                    </button>
                    <button 
                        onClick={handleGenerate}
                        disabled={!notes.trim()}
                        className="px-6 py-2 bg-black hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-200 text-white dark:text-black text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                    >
                        Generate Plan
                    </button>
                </>
            ) : step === 'review' ? (
                <>
                    <button 
                        onClick={() => setStep('input')}
                        className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                        Back to Edit
                    </button>
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 font-medium">
                            {selectedTasks.size} tasks selected
                        </span>
                        <button 
                            onClick={handleCreateTasks}
                            disabled={selectedTasks.size === 0 || isCreatingProjects}
                            className="px-6 py-2 bg-black dark:bg-white text-white dark:text-black text-sm font-bold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isCreatingProjects ? <Loader2 size={16} className="animate-spin" /> : <Calendar size={16} />}
                            Add to Schedule
                        </button>
                    </div>
                </>
            ) : (
                <div /> // Empty for loading state
            )}
        </div>

      </div>
    </div>
  );
}
