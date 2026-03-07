'use client';

import { useState, useEffect, useRef } from 'react';
import { Task, TaskPriority } from '@/types/task';
import { Project } from '@/types/project';
import { generateId } from '@/lib/utils';
import clsx from 'clsx';
import { Plus, Calendar, Flag, Tag, X } from 'lucide-react';
import { parseDateFromText, dayRegex, parseTagFromText, tagRegex } from '@/lib/smartDate';
import { formatDateKey } from '@/lib/dateKey';
import { parseTemporal, ParsedTemporal } from '@/lib/temporalParser';
import { TemporalClarificationModal } from './TemporalClarificationModal';

interface QuickCaptureDockProps {
  onAddTask: (task: Task) => void;
  defaultDate?: string;
  projects?: Project[];
  defaultProjectId?: string;
  topInputSelector?: string; // Selector for the top input element to check visibility
}

export const QuickCaptureDock = ({
  onAddTask,
  defaultDate,
  projects = [],
  defaultProjectId,
  topInputSelector = '#task-input',
}: QuickCaptureDockProps) => {
  const [title, setTitle] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [priority, setPriority] = useState<TaskPriority>(3);
  const [deadline, setDeadline] = useState(defaultDate || '');
  const [projectId, setProjectId] = useState('');
  const [temporalParsed, setTemporalParsed] = useState<ParsedTemporal | null>(null);
  const [showClarification, setShowClarification] = useState(false);
  const [ambiguousAlternatives, setAmbiguousAlternatives] = useState<ParsedTemporal[]>([]);
  const dockRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update deadline when defaultDate changes
  useEffect(() => {
    setDeadline(defaultDate || '');
  }, [defaultDate]);

  // Set default project
  useEffect(() => {
    if (defaultProjectId && projects.some(p => p.id === defaultProjectId)) {
      setProjectId(defaultProjectId);
      return;
    }
    if (projects.length > 0 && !projectId) {
      setProjectId(projects[0].id);
    }
  }, [projects, projectId, defaultProjectId]);

  // Check if top input is visible
  useEffect(() => {
    const checkTopInputVisibility = () => {
      const topInput = document.querySelector(topInputSelector);
      if (!topInput) {
        // If no top input found, show dock after a delay (for views without top input)
        setTimeout(() => setIsVisible(true), 500);
        return;
      }

      const rect = topInput.getBoundingClientRect();
      // Top input is visible if it's in the viewport
      const isTopInputVisible = rect.top >= 0 && rect.top < window.innerHeight && rect.bottom > 0;
      setIsVisible(!isTopInputVisible);
    };

    // Initial check
    checkTopInputVisibility();
    
    // Check on scroll and resize
    const handleScroll = () => {
      requestAnimationFrame(checkTopInputVisibility);
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [topInputSelector]);

  // Parse temporal information and tags from title
  useEffect(() => {
    if (!title.trim()) {
      setTemporalParsed(null);
      return;
    }

    const parsed = parseTemporal(title);
    
    // Handle ambiguous cases
    if (parsed.confidence === 'ambiguous' && parsed.ambiguous && parsed.ambiguous.length > 0) {
      setTemporalParsed(parsed);
      setAmbiguousAlternatives([parsed]);
    } else if (parsed.confidence === 'high' || parsed.confidence === 'medium') {
      setTemporalParsed(parsed);
      if (parsed.due_date || parsed.scheduled_date) {
        setDeadline(parsed.due_date || parsed.scheduled_date || '');
      }
    } else {
      // Fall back to old parser
      const dateMatch = parseDateFromText(title);
      if (dateMatch) {
        setDeadline(dateMatch.date);
      }
      setTemporalParsed(null);
    }

    const tagMatch = parseTagFromText(title);
    if (tagMatch) {
      const project = projects.find(p => p.name.toLowerCase() === tagMatch.toLowerCase());
      if (project) {
        setProjectId(project.id);
      }
    }
  }, [title, projects]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check for ambiguous temporal parsing
    if (temporalParsed?.confidence === 'ambiguous' && ambiguousAlternatives.length > 0) {
      setShowClarification(true);
      return;
    }
    
    const finalTitle = temporalParsed?.cleanedText || title.trim();
    if (!finalTitle) return;

    const project = projects.find(p => p.id === projectId);
    const categoryName = project ? project.name : 'Inbox';
    const finalDeadline = temporalParsed?.due_date || temporalParsed?.scheduled_date || deadline || undefined;

    const newTask: Task = {
      id: generateId(),
      title: finalTitle,
      description: '',
      category: categoryName,
      priority,
      estimatedMinutes: 60,
      energyLevel: 'medium',
      status: 'todo',
      tags: [],
      createdAt: Date.now(),
      deadline: finalDeadline,
      due_time: temporalParsed?.due_time,
      scheduled_date: temporalParsed?.scheduled_date,
      scheduled_time: temporalParsed?.scheduled_time,
      is_all_day: temporalParsed?.is_all_day,
      project_id: projectId || undefined,
    };

    onAddTask(newTask);

    // Reset form
    setTitle('');
    setDeadline(defaultDate || '');
    setPriority(3);
    setProjectId(defaultProjectId || projects[0]?.id || '');
    setTemporalParsed(null);
    setIsExpanded(false);
    inputRef.current?.blur();
  };

  const handleFocus = () => {
    setIsExpanded(true);
  };

  const handleBlur = (e: React.FocusEvent) => {
    // Don't collapse if clicking on expanded controls
    if (dockRef.current?.contains(e.relatedTarget as Node)) {
      return;
    }
    // Small delay to allow button clicks
    setTimeout(() => {
      if (!inputRef.current?.matches(':focus')) {
        setIsExpanded(false);
      }
    }, 150);
  };

  const handleClose = () => {
    setIsExpanded(false);
    setTitle('');
    setDeadline(defaultDate || '');
    setPriority(3);
    inputRef.current?.blur();
  };

  if (!isVisible) return null;

  const project = projects.find(p => p.id === projectId);

  return (
    <div
      ref={dockRef}
      className={clsx(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ease-out",
        isVisible ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-4 pointer-events-none"
      )}
      style={{
        maxWidth: 'calc(100% - 2rem)',
        width: isExpanded ? 'min(600px, 90vw)' : 'auto',
      }}
    >
      <div
        className={clsx(
          "bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 transition-all duration-300",
          isExpanded ? "p-4" : "p-2"
        )}
      >
        <form onSubmit={handleSubmit} onBlur={handleBlur}>
          {/* Collapsed State */}
          {!isExpanded ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleFocus}
                className="flex-shrink-0 w-10 h-10 rounded-full bg-black dark:bg-white text-white dark:text-black flex items-center justify-center hover:opacity-90 transition-opacity"
              >
                <Plus size={18} />
              </button>
              <input
                ref={inputRef}
                type="text"
                placeholder="Add a task…"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onFocus={handleFocus}
                className="flex-1 bg-transparent border-none outline-none text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          ) : (
            /* Expanded State */
            <div className="space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Quick capture</span>
                <button
                  type="button"
                  onClick={handleClose}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Input */}
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-black dark:bg-white text-white dark:text-black flex items-center justify-center">
                  <Plus size={16} />
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Task title…"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="flex-1 bg-transparent border-b border-gray-200 dark:border-gray-700 focus:border-gray-400 dark:focus:border-gray-500 outline-none text-sm text-gray-900 dark:text-gray-100 pb-1.5 transition-colors"
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                />
                {title.trim() && (
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-semibold bg-black dark:bg-white text-white dark:text-black rounded-lg hover:opacity-90 transition-opacity"
                  >
                    Add
                  </button>
                )}
              </div>

              {/* Minimal Metadata */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Due Date */}
                <button
                  type="button"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'date';
                    input.value = deadline || formatDateKey(new Date());
                    input.onchange = (e) => {
                      const target = e.target as HTMLInputElement;
                      setDeadline(target.value);
                    };
                    input.click();
                  }}
                  className={clsx(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    deadline
                      ? "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                      : "bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  )}
                >
                  <Calendar size={12} />
                  {deadline ? new Date(deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Due date'}
                </button>

                {/* Priority */}
                <button
                  type="button"
                  onClick={() => {
                    const nextPriority = priority >= 3 ? 1 : ((priority + 1) as TaskPriority);
                    setPriority(nextPriority);
                  }}
                  className={clsx(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    priority <= 2
                      ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                      : priority === 3
                      ? "bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400"
                      : "bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400"
                  )}
                >
                  <Flag size={12} />
                  P{priority}
                </button>

                {/* Project */}
                {projects.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const currentIndex = projects.findIndex(p => p.id === projectId);
                      const nextIndex = (currentIndex + 1) % projects.length;
                      setProjectId(projects[nextIndex].id);
                    }}
                    className={clsx(
                      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                      projectId
                        ? "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                        : "bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                    )}
                  >
                    <Tag size={12} />
                    {project ? project.name : 'Project'}
                  </button>
                )}
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Temporal Clarification Modal */}
      <TemporalClarificationModal
        isOpen={showClarification}
        onClose={() => setShowClarification(false)}
        onConfirm={(selected) => {
          setTemporalParsed(selected);
          setShowClarification(false);
          // Re-submit with selected interpretation
          const finalTitle = selected.cleanedText || title.trim();
          if (finalTitle) {
            const project = projects.find(p => p.id === projectId);
            const categoryName = project ? project.name : 'Inbox';
            const finalDeadline = selected.due_date || selected.scheduled_date || deadline || undefined;

            const newTask: Task = {
              id: generateId(),
              title: finalTitle,
              description: '',
              category: categoryName,
              priority,
              estimatedMinutes: 60,
              energyLevel: 'medium',
              status: 'todo',
              tags: [],
              createdAt: Date.now(),
              deadline: finalDeadline,
              due_time: selected.due_time,
              scheduled_date: selected.scheduled_date,
              scheduled_time: selected.scheduled_time,
              is_all_day: selected.is_all_day,
              project_id: projectId || undefined,
            };

            onAddTask(newTask);
            // Reset form
            setTitle('');
            setDeadline(defaultDate || '');
            setPriority(3);
            setProjectId(defaultProjectId || projects[0]?.id || '');
            setTemporalParsed(null);
            setIsExpanded(false);
            inputRef.current?.blur();
          }
        }}
        ambiguous={temporalParsed?.ambiguous || []}
        originalText={title}
        alternatives={ambiguousAlternatives}
      />
    </div>
  );
};
