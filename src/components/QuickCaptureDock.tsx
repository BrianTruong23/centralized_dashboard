'use client';

import { useState, useEffect, useRef } from 'react';
import { Task, TaskPriority } from '@/types/task';
import { Project } from '@/types/project';
import { generateId } from '@/lib/utils';
import clsx from 'clsx';
import { Plus, Calendar, Flag, Tag, X, ChevronDown, ChevronLeft, ChevronRight, Sun, ArrowRight, Ban } from 'lucide-react';
import { parseDateFromText, parseTagFromText } from '@/lib/smartDate';
import { formatDateKey, formatDateDisplay } from '@/lib/dateKey';
import { parseTemporal, ParsedTemporal } from '@/lib/temporalParser';
import { TemporalClarificationModal } from './TemporalClarificationModal';
import { addDays, eachDayOfInterval, endOfMonth, endOfWeek, format, getDay, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths, addMonths } from 'date-fns';

interface QuickCaptureDockProps {
  onAddTask: (task: Task) => void;
  defaultDate?: string;
  projects?: Project[];
  defaultProjectId?: string;
  topInputSelector?: string;
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
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const dockRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const priorityRef = useRef<HTMLDivElement>(null);
  const projectRef = useRef<HTMLDivElement>(null);

  // Update deadline when defaultDate changes
  useEffect(() => {
    setDeadline(defaultDate || '');
  }, [defaultDate]);

  useEffect(() => {
    if (!showDatePicker) return;
    if (!deadline) {
      setCalendarMonth(startOfMonth(new Date()));
      return;
    }

    const [year, month, day] = deadline.split('-').map(Number);
    if (!year || !month || !day) return;
    setCalendarMonth(startOfMonth(new Date(year, month - 1, day)));
  }, [deadline, showDatePicker]);

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
        setTimeout(() => setIsVisible(true), 500);
        return;
      }

      const rect = topInput.getBoundingClientRect();
      const isTopInputVisible = rect.top >= 0 && rect.top < window.innerHeight && rect.bottom > 0;
      setIsVisible(!isTopInputVisible);
    };

    checkTopInputVisibility();
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

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (priorityRef.current && !priorityRef.current.contains(event.target as Node)) {
        setShowPriorityDropdown(false);
      }
      if (projectRef.current && !projectRef.current.contains(event.target as Node)) {
        setShowProjectDropdown(false);
      }
      if (showDatePicker && dockRef.current && !dockRef.current.contains(event.target as Node)) {
        setShowDatePicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDatePicker]);

  // Parse temporal information and tags from title
  useEffect(() => {
    if (!title.trim()) {
      setTemporalParsed(null);
      return;
    }

    const parsed = parseTemporal(title);
    
    if (parsed.confidence === 'ambiguous' && parsed.ambiguous && parsed.ambiguous.length > 0) {
      setTemporalParsed(parsed);
      setAmbiguousAlternatives([parsed]);
    } else if (parsed.confidence === 'high' || parsed.confidence === 'medium') {
      setTemporalParsed(parsed);
      if (parsed.due_date || parsed.scheduled_date) {
        setDeadline(parsed.due_date || parsed.scheduled_date || '');
      }
    } else {
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
    setShowPriorityDropdown(false);
    setShowProjectDropdown(false);
    setShowDatePicker(false);
    inputRef.current?.blur();
  };

  const handleFocus = () => {
    setIsExpanded(true);
  };

  const handleBlur = (e: React.FocusEvent) => {
    if (dockRef.current?.contains(e.relatedTarget as Node)) {
      return;
    }
    setTimeout(() => {
      if (!inputRef.current?.matches(':focus')) {
        setIsExpanded(false);
        setShowPriorityDropdown(false);
        setShowProjectDropdown(false);
        setShowDatePicker(false);
      }
    }, 150);
  };

  const handleClose = () => {
    setIsExpanded(false);
    setTitle('');
    setDeadline(defaultDate || '');
    setPriority(3);
    setShowPriorityDropdown(false);
    setShowProjectDropdown(false);
    setShowDatePicker(false);
    inputRef.current?.blur();
  };

  // Render highlighted text with temporal phrases - using exact text matching to preserve cursor position
  const renderHighlightedText = () => {
    const detectedPhrases = (
      temporalParsed as (ParsedTemporal & {
        detectedPhrases?: Array<{ phrase: string; start: number; end: number; type: 'date' | 'time' | 'datetime' }>;
      }) | null
    )?.detectedPhrases ?? [];

    if (!title || detectedPhrases.length === 0) {
      return <span className="text-gray-900 dark:text-gray-100">{title}</span>;
    }

    const phrases = detectedPhrases.sort((a, b) => a.start - b.start);
    const parts: Array<{ text: string; highlight: boolean }> = [];
    let lastIndex = 0;

    phrases.forEach((phrase) => {
      if (phrase.start > lastIndex) {
        parts.push({ text: title.substring(lastIndex, phrase.start), highlight: false });
      }
      parts.push({ text: phrase.phrase, highlight: true });
      lastIndex = phrase.end;
    });

    if (lastIndex < title.length) {
      parts.push({ text: title.substring(lastIndex), highlight: false });
    }

    return (
      <>
        {parts.map((part, i) => {
          if (!part.highlight) {
            return <span key={i} className="text-gray-900 dark:text-gray-100 whitespace-pre">{part.text}</span>;
          }
          return (
            <span
              key={i}
              className="bg-orange-100 dark:bg-orange-900/30 text-orange-900 dark:text-orange-200 border-b-2 border-dotted border-orange-400 dark:border-orange-500 whitespace-pre"
              style={{ padding: '0 0.5px', margin: '0 -0.5px' }}
            >
              {part.text}
            </span>
          );
        })}
      </>
    );
  };

  if (!isVisible) return null;

  const project = projects.find(p => p.id === projectId);
  const priorityColors = {
    1: 'text-red-500',
    2: 'text-orange-500',
    3: 'text-blue-500',
    4: 'text-gray-500',
    5: 'text-gray-400',
  };

  const today = new Date();
  const tomorrow = addDays(today, 1);
  const nextWeekDate = startOfWeek(addDays(today, 7), { weekStartsOn: 1 });
  const daysUntilSaturday = ((6 - getDay(today)) + 7) % 7 || 7;
  const nextWeekendDate = addDays(today, daysUntilSaturday);
  const selectedDate = deadline
    ? (() => {
        const [year, month, day] = deadline.split('-').map(Number);
        if (!year || !month || !day) return null;
        return new Date(year, month - 1, day);
      })()
    : null;

  const monthStart = startOfMonth(calendarMonth);
  const monthEnd = endOfMonth(calendarMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calendarDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const chooseDate = (date: Date | null) => {
    setDeadline(date ? formatDateKey(date) : '');
    setTemporalParsed(null);
    setShowDatePicker(false);
  };

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
                className="flex-shrink-0 w-10 h-10 rounded-full accent-solid-btn flex items-center justify-center transition-opacity"
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
            /* Expanded State - Todoist-style */
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

              {/* Input with highlighting */}
              <div className="relative flex items-center gap-2">
                <div className="flex-shrink-0 w-8 h-8 rounded-full accent-solid-btn flex items-center justify-center">
                  <Plus size={16} />
                </div>
                <div className="relative flex-1 min-w-0">
                  <div className="absolute inset-0 flex items-center text-sm font-normal pointer-events-none z-0 whitespace-pre overflow-hidden" style={{ fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit' }}>
                    {renderHighlightedText()}
                  </div>
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Task title…"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="relative w-full bg-transparent border-none outline-none text-sm text-transparent caret-gray-900 dark:caret-gray-100 pb-1.5 transition-colors z-10"
                    autoComplete="off"
                    spellCheck={false}
                    autoFocus
                    style={{ fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit', letterSpacing: 'inherit' }}
                  />
                </div>
                {title.trim() && (
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg accent-solid-btn transition-opacity"
                  >
                    Add
                  </button>
                )}
              </div>

              {/* Metadata Pills */}
              <div className="flex items-center gap-2 flex-wrap relative">
                {/* Date Pill */}
                <div className="relative">
                  {deadline ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDatePicker(!showDatePicker);
                        setShowPriorityDropdown(false);
                        setShowProjectDropdown(false);
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 border-2 border-gray-900 dark:border-gray-200 rounded-full text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <Calendar size={14} />
                      {formatDateDisplay(deadline)}
                      <X 
                        size={14} 
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeadline('');
                          setTemporalParsed(null);
                          setShowDatePicker(false);
                        }}
                        className="ml-0.5 hover:text-red-500"
                      />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDatePicker(!showDatePicker);
                        setShowPriorityDropdown(false);
                        setShowProjectDropdown(false);
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 rounded-full text-xs font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      <Calendar size={12} />
                      Due date
                    </button>
                  )}

                  {/* Date Picker Popup */}
                  {showDatePicker && (
                    <div className="absolute bottom-full left-0 mb-2 bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 z-[100] min-w-[320px] max-h-[70vh] overflow-y-auto">
                      <div className="space-y-3 p-3">
                        {/* Quick Options */}
                        <div className="space-y-1">
                          <button
                            type="button"
                            onClick={() => chooseDate(today)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md transition-colors flex items-center justify-between"
                          >
                            <span className="flex items-center gap-2">
                              <Calendar size={14} className="text-cyan-600 dark:text-cyan-400" />
                              Today
                            </span>
                            <span className="text-xs text-gray-500">{format(today, 'EEE')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => chooseDate(tomorrow)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md transition-colors flex items-center justify-between"
                          >
                            <span className="flex items-center gap-2">
                              <Sun size={14} className="text-rose-500 dark:text-rose-400" />
                              Tomorrow
                            </span>
                            <span className="text-xs text-gray-500">{format(tomorrow, 'EEE')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => chooseDate(nextWeekDate)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md transition-colors flex items-center justify-between"
                          >
                            <span className="flex items-center gap-2">
                              <ArrowRight size={14} className="text-indigo-600 dark:text-indigo-400" />
                              Next week
                            </span>
                            <span className="text-xs text-gray-500">{format(nextWeekDate, 'EEE MMM d')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => chooseDate(nextWeekendDate)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md transition-colors flex items-center justify-between"
                          >
                            <span className="flex items-center gap-2">
                              <Calendar size={14} className="text-teal-600 dark:text-teal-400" />
                              Next weekend
                            </span>
                            <span className="text-xs text-gray-500">{format(nextWeekendDate, 'EEE MMM d')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => chooseDate(null)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md transition-colors flex items-center gap-2"
                          >
                            <Ban size={14} className="text-gray-500" />
                            No date
                          </button>
                        </div>

                        {/* Calendar */}
                        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                          <div className="flex items-center justify-between px-1 mb-2">
                            <span className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
                              {format(calendarMonth, 'MMM yyyy')}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}
                                className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
                                aria-label="Previous month"
                              >
                                <ChevronLeft size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}
                                className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
                                aria-label="Next month"
                              >
                                <ChevronRight size={16} />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-7 text-center text-xs text-gray-400 mb-1">
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                              <span key={`${day}-${index}`} className="py-1">{day}</span>
                            ))}
                          </div>
                          <div className="grid grid-cols-7 gap-1">
                            {calendarDays.map((date) => {
                              const isSelected = !!selectedDate && isSameDay(date, selectedDate);
                              return (
                                <button
                                  key={date.toISOString()}
                                  type="button"
                                  onClick={() => chooseDate(date)}
                                  className={clsx(
                                    'h-8 w-8 rounded-full text-sm transition-colors',
                                    !isSameMonth(date, calendarMonth) && 'text-gray-300 dark:text-gray-600',
                                    isSameMonth(date, calendarMonth) && 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800',
                                    isSelected && 'bg-black text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-white',
                                    !isSelected && isSameDay(date, today) && 'font-semibold text-gray-900 dark:text-gray-100'
                                  )}
                                >
                                  {format(date, 'd')}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Priority Dropdown */}
                <div className="relative" ref={priorityRef}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowPriorityDropdown(!showPriorityDropdown);
                      setShowProjectDropdown(false);
                      setShowDatePicker(false);
                    }}
                    className={clsx(
                      "flex items-center gap-2 px-3 py-1.5 rounded-2xl text-sm font-medium transition-colors border-2",
                      showPriorityDropdown
                        ? "border-gray-900 dark:border-gray-100 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100"
                        : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                    )}
                  >
                    <Flag size={14} className={clsx(priorityColors[priority as keyof typeof priorityColors])} fill={priority <= 3 ? 'currentColor' : 'none'} />
                    Priority
                    <ChevronDown size={12} className="text-gray-500" />
                  </button>

                  {showPriorityDropdown && (
                    <div className="absolute bottom-full left-0 mb-2 bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-[100] min-w-[240px] max-h-[60vh] overflow-y-auto">
                      {([1, 2, 3, 4, 5] as TaskPriority[]).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPriority(p);
                            setShowPriorityDropdown(false);
                          }}
                          className={clsx(
                            "w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left",
                            priority === p && "bg-gray-100 dark:bg-gray-800"
                          )}
                        >
                          <Flag 
                            size={18} 
                            className={clsx(priorityColors[p as keyof typeof priorityColors])}
                            fill={p <= 3 ? 'currentColor' : 'none'}
                          />
                          <span className={clsx(
                            "font-medium flex-1",
                            priority === p && "font-semibold"
                          )}>
                            Priority {p}
                          </span>
                          {priority === p && (
                            <span className="text-sm font-bold text-amber-600 dark:text-amber-400">✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Project Dropdown */}
                <div className="relative" ref={projectRef}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowProjectDropdown(!showProjectDropdown);
                      setShowPriorityDropdown(false);
                      setShowDatePicker(false);
                    }}
                    className={clsx(
                      "flex items-center gap-2 px-3 py-1.5 rounded-2xl text-sm font-medium transition-colors border-2",
                      showProjectDropdown
                        ? "border-gray-900 dark:border-gray-100 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100"
                        : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                    )}
                  >
                    <Tag size={14} />
                    {project ? project.name : 'Inbox'}
                    <ChevronDown size={12} className="text-gray-500" />
                  </button>

                  {showProjectDropdown && (
                    <div className="absolute bottom-full left-0 mb-2 bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-[100] min-w-[240px] max-h-[60vh] overflow-y-auto">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setProjectId('');
                          setShowProjectDropdown(false);
                        }}
                        className={clsx(
                          "w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left",
                          !projectId && "bg-gray-100 dark:bg-gray-800"
                        )}
                      >
                        <Tag size={18} className="text-gray-500 dark:text-gray-400" />
                        <span className="text-gray-700 dark:text-gray-200 font-medium flex-1">Inbox</span>
                        {!projectId && (
                          <span className="ml-auto text-sm font-bold text-amber-600 dark:text-amber-400">✓</span>
                        )}
                      </button>
                      {projects.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setProjectId(p.id);
                            setShowProjectDropdown(false);
                          }}
                          className={clsx(
                            "w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left",
                            projectId === p.id && "bg-gray-100 dark:bg-gray-800"
                          )}
                        >
                          <Tag size={18} style={{ color: p.color }} />
                          <span className="truncate flex-1 font-medium text-gray-700 dark:text-gray-200">{p.name}</span>
                          {projectId === p.id && (
                            <span className="text-sm font-bold text-amber-600 dark:text-amber-400">✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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
