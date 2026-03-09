import { useState, useEffect, useRef } from 'react';
import { Task, TaskPriority, TaskEnergyLevel, TaskCategory } from '@/types/task';
import { Project } from '@/types/project';
import { generateId } from '@/lib/utils';
import clsx from 'clsx';
import { Plus, Calendar, Flag, Tag, X, ChevronDown } from 'lucide-react';
import { parseDateFromText, dayRegex, parseTagFromText, tagRegex } from '@/lib/smartDate';
import { parseTemporal, ParsedTemporal } from '@/lib/temporalParser';
import { TemporalClarificationModal } from './TemporalClarificationModal';
import { formatDateKey, formatDateDisplay } from '@/lib/dateKey';
import { format } from 'date-fns';

interface TaskInputProps {
  onAddTask: (task: Task) => void;
  defaultDate?: string;
  projects?: Project[];
  defaultProjectId?: string;
  isHighlighted?: boolean;
}

export const TaskInput = ({ onAddTask, defaultDate, projects = [], defaultProjectId, isHighlighted }: TaskInputProps) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [priority, setPriority] = useState<TaskPriority>(3);
  const [estimatedMinutes, setEstimatedMinutes] = useState(60);
  const [energyLevel, setEnergyLevel] = useState<TaskEnergyLevel>('medium');
  const [deadline, setDeadline] = useState(defaultDate || '');
  const [isExpanded, setIsExpanded] = useState(false);
  const [temporalParsed, setTemporalParsed] = useState<ParsedTemporal | null>(null);
  const [showClarification, setShowClarification] = useState(false);
  const [ambiguousAlternatives, setAmbiguousAlternatives] = useState<ParsedTemporal[]>([]);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const priorityRef = useRef<HTMLDivElement>(null);
  const projectRef = useRef<HTMLDivElement>(null);

  const buildTaskFromParsed = (parsed: ParsedTemporal, taskTitle: string): Task => {
    const project = projects.find(p => p.id === projectId);
    const categoryName = project ? project.name : 'Inbox';
    const isScheduled = parsed.interpretation_type === 'scheduled';
    const scheduledOn = parsed.scheduled_date || undefined;
    const scheduledStart = parsed.scheduled_date && (parsed.start_time || parsed.scheduled_time)
      ? new Date(`${parsed.scheduled_date}T${(parsed.start_time || parsed.scheduled_time || '09:00:00').slice(0, 8)}`).toISOString()
      : undefined;
    const scheduledEnd = parsed.scheduled_date && parsed.end_time
      ? new Date(`${parsed.scheduled_date}T${parsed.end_time.slice(0, 8)}`).toISOString()
      : undefined;
    const finalDeadline = isScheduled
      ? (deadline || undefined)
      : parsed.due_date && parsed.due_time
        ? new Date(`${parsed.due_date}T${parsed.due_time.slice(0, 8)}`).toISOString()
        : (parsed.due_date || deadline || undefined);

    return {
      id: generateId(),
      title: taskTitle,
      description,
      category: categoryName,
      priority,
      estimatedMinutes: parsed.duration_minutes || estimatedMinutes,
      energyLevel,
      status: 'todo',
      tags: [],
      createdAt: Date.now(),
      deadline: finalDeadline,
      scheduled_on: isScheduled ? scheduledOn : undefined,
      scheduled_start: isScheduled ? scheduledStart : undefined,
      scheduled_end: isScheduled ? scheduledEnd : undefined,
      due_time: parsed.due_time,
      scheduled_date: parsed.scheduled_date,
      scheduled_time: parsed.scheduled_time,
      start_time: parsed.start_time,
      end_time: parsed.end_time,
      is_all_day: parsed.is_all_day,
      project_id: projectId || undefined,
    };
  };

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

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (priorityRef.current && !priorityRef.current.contains(event.target as Node)) {
        setShowPriorityDropdown(false);
      }
      if (projectRef.current && !projectRef.current.contains(event.target as Node)) {
        setShowProjectDropdown(false);
      }
      if (showDatePicker && containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDatePicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDatePicker]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check for ambiguous temporal parsing
    if (temporalParsed?.confidence === 'ambiguous' && ambiguousAlternatives.length > 0) {
      setShowClarification(true);
      return;
    }
    
    const finalTitle = temporalParsed?.cleanedText || title.trim();
    if (!finalTitle) return;

    onAddTask(buildTaskFromParsed(temporalParsed || { cleanedText: finalTitle, confidence: 'high', interpretation_type: 'none' }, finalTitle));

    // Reset form
    setTitle('');
    setDescription('');
    setPriority(3);
    setEstimatedMinutes(60);
    setEnergyLevel('medium');
    setDeadline(defaultDate || '');
    setTemporalParsed(null);
    setIsExpanded(false);
    setShowPriorityDropdown(false);
    setShowProjectDropdown(false);
    setShowDatePicker(false);
  };

  // Parse temporal information on title change
  useEffect(() => {
    if (!title.trim()) {
      setTemporalParsed(null);
      return;
    }

    const parsed = parseTemporal(title);
    
    if (parsed.confidence === 'ambiguous' && parsed.alternatives && parsed.alternatives.length > 0) {
      setTemporalParsed(parsed);
      setAmbiguousAlternatives(parsed.alternatives);
    } else if (parsed.confidence === 'high' || parsed.confidence === 'medium') {
      setTemporalParsed(parsed);
      if (parsed.due_date || parsed.scheduled_date) {
        setDeadline(parsed.due_date || parsed.scheduled_date || '');
      }
    } else {
      const match = parseDateFromText(title);
      if (match) {
        setDeadline(match.date);
      }
      setTemporalParsed(null);
    }
  }, [title]);

  // Handle Input Change
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTitle(val);
    
    const tagMatch = parseTagFromText(val);
    if (tagMatch) {
      const project = projects.find(p => p.name.toLowerCase() === tagMatch.toLowerCase());
      if (project) {
        setProjectId(project.id);
      }
    }
  };

  // Render highlighted text with temporal phrases - using exact text matching to preserve cursor position
  const renderHighlightedText = () => {
    if (!title || !temporalParsed?.detectedPhrases || temporalParsed.detectedPhrases.length === 0) {
      return <span className="text-gray-900 dark:text-gray-100">{title}</span>;
    }

    const phrases = temporalParsed.detectedPhrases.sort((a, b) => a.start - b.start);
    const parts: Array<{ text: string; highlight: boolean; type?: string }> = [];
    let lastIndex = 0;

    phrases.forEach((phrase) => {
      if (phrase.start > lastIndex) {
        parts.push({ text: title.substring(lastIndex, phrase.start), highlight: false });
      }
      parts.push({ text: phrase.phrase, highlight: true, type: phrase.type });
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

  const project = projects.find(p => p.id === projectId);
  const priorityColors = {
    1: 'text-red-500',
    2: 'text-orange-500',
    3: 'text-blue-500',
    4: 'text-gray-400',
    5: 'text-gray-300',
  };

  return (
    <div 
      ref={containerRef}
      className={clsx(
        "transition-all duration-300", 
        isHighlighted && "ring-4 ring-blue-500/30 bg-blue-50/50 dark:bg-blue-900/20 rounded-xl p-2"
      )} 
      data-tutorial="task-input"
      id="task-input"
    >
      <form onSubmit={handleSubmit} className="relative">
        {/* Main Input Row */}
        <div className="relative flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-2 focus-within:border-gray-400 dark:focus-within:border-gray-500 transition-colors">
          <div className="text-gray-400 flex-shrink-0">
            <Plus size={18} />
          </div>
          
          {/* Input with highlighting overlay */}
          <div className="relative flex-1 min-w-0">
            <div className="absolute inset-0 flex items-center text-base font-normal pointer-events-none z-0 whitespace-pre overflow-hidden" style={{ fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit' }}>
              {renderHighlightedText()}
            </div>
            <input
              type="text"
              placeholder="Add new task..."
              className="relative w-full bg-transparent border-none outline-none text-base text-transparent caret-gray-900 dark:caret-gray-100 z-10 placeholder:text-gray-400 dark:placeholder:text-gray-500"
              value={title}
              onChange={handleTitleChange}
              onFocus={() => setIsExpanded(true)}
              autoComplete="off"
              spellCheck={false}
              style={{ fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit', letterSpacing: 'inherit' }}
            />
          </div>

          {title.trim() && (
            <button
              type="submit"
              className="flex-shrink-0 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              Add
            </button>
          )}
        </div>

        {/* Expanded Controls - Todoist-style */}
        {isExpanded && (
          <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-1">
            {/* Description (optional) */}
            <input
              type="text"
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full text-sm text-gray-600 dark:text-gray-400 bg-transparent border-none outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />

            {/* Metadata Row - Pills */}
            <div className="flex items-center gap-2 flex-wrap relative">
              {/* Date Pill - Editable */}
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
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    <Calendar size={12} />
                    {formatDateDisplay(deadline)}
                    <X 
                      size={12} 
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
                  <div className="absolute top-full left-0 mt-2 bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-4 z-[100] min-w-[280px]">
                    <div className="space-y-3">
                      {/* Quick Options */}
                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() => {
                            setDeadline(formatDateKey(new Date()));
                            setShowDatePicker(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md transition-colors flex items-center justify-between"
                        >
                          <span className="flex items-center gap-2">
                            <Calendar size={14} />
                            Today
                          </span>
                          <span className="text-xs text-gray-400">{format(new Date(), 'EEE')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const tomorrow = new Date();
                            tomorrow.setDate(tomorrow.getDate() + 1);
                            setDeadline(formatDateKey(tomorrow));
                            setShowDatePicker(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md transition-colors flex items-center justify-between"
                        >
                          <span className="flex items-center gap-2">
                            <Calendar size={14} />
                            Tomorrow
                          </span>
                          <span className="text-xs text-gray-400">
                            {format(new Date(Date.now() + 86400000), 'EEE')}
                          </span>
                        </button>
                      </div>

                      {/* Date Input */}
                      <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                        <input
                          type="date"
                          value={deadline}
                          onChange={(e) => {
                            setDeadline(e.target.value);
                            setShowDatePicker(false);
                          }}
                          className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-500"
                        />
                      </div>

                      {/* Remove Date */}
                      {deadline && (
                        <button
                          type="button"
                          onClick={() => {
                            setDeadline('');
                            setShowDatePicker(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                        >
                          Remove date
                        </button>
                      )}
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
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                    priority === 1
                      ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                      : priority === 2
                      ? "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400"
                      : priority === 3
                      ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                  )}
                >
                  <Flag size={12} fill={priority <= 2 ? 'currentColor' : 'none'} />
                  P{priority}
                  <ChevronDown size={10} />
                </button>

                {showPriorityDropdown && (
                  <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-[100] min-w-[140px]">
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
                          "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left",
                          priority === p && "bg-gray-50 dark:bg-gray-800"
                        )}
                      >
                        <Flag 
                          size={14} 
                          className={clsx(priorityColors[p as keyof typeof priorityColors])}
                          fill={p <= 2 ? 'currentColor' : 'none'}
                        />
                        <span className={clsx(
                          "font-medium flex-1",
                          priority === p && "font-semibold"
                        )}>
                          Priority {p}
                        </span>
                        {priority === p && (
                          <span className="text-xs text-gray-400">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Project/Category Dropdown */}
              <div className="relative" ref={projectRef}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowProjectDropdown(!showProjectDropdown);
                    setShowPriorityDropdown(false);
                    setShowDatePicker(false);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <Tag size={12} />
                  {project ? project.name : 'Inbox'}
                  <ChevronDown size={10} />
                </button>

                {showProjectDropdown && (
                  <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-[100] min-w-[160px] max-h-60 overflow-y-auto">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setProjectId('');
                        setShowProjectDropdown(false);
                      }}
                      className={clsx(
                        "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left",
                        !projectId && "bg-gray-50 dark:bg-gray-800"
                      )}
                    >
                      <span className="text-gray-500 dark:text-gray-400">Inbox</span>
                      {!projectId && (
                        <span className="ml-auto text-xs text-gray-400">✓</span>
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
                          "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left",
                          projectId === p.id && "bg-gray-50 dark:bg-gray-800"
                        )}
                      >
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="truncate flex-1">{p.name}</span>
                        {projectId === p.id && (
                          <span className="text-xs text-gray-400">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Cancel */}
              <button 
                type="button" 
                onClick={() => {
                  setIsExpanded(false);
                  setShowPriorityDropdown(false);
                  setShowProjectDropdown(false);
                  setShowDatePicker(false);
                }}
                className="ml-auto text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </form>

      {/* Temporal Clarification Modal */}
      <TemporalClarificationModal
        isOpen={showClarification}
        onClose={() => setShowClarification(false)}
        onConfirm={(selected) => {
          setTemporalParsed(selected);
          setShowClarification(false);
          const finalTitle = selected.cleanedText || title.trim();
          if (finalTitle) {
            onAddTask(buildTaskFromParsed(selected, finalTitle));
            setTitle('');
            setDescription('');
            setPriority(3);
            setEstimatedMinutes(60);
            setEnergyLevel('medium');
            setDeadline(defaultDate || '');
            setTemporalParsed(null);
            setIsExpanded(false);
          }
        }}
        ambiguous={temporalParsed?.ambiguous || []}
        originalText={title}
        alternatives={ambiguousAlternatives}
      />
    </div>
  );
};
