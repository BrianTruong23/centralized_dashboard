import { useState, useEffect } from 'react';
import { Task, TaskPriority, TaskEnergyLevel, TaskCategory } from '@/types/task';
import { Project } from '@/types/project';
import { generateId } from '@/lib/utils';
import clsx from 'clsx';
import { Plus } from 'lucide-react';
import { parseDateFromText, dayRegex, parseTagFromText, tagRegex } from '@/lib/smartDate';
import { parseTemporal, ParsedTemporal } from '@/lib/temporalParser';
import { TemporalClarificationModal } from './TemporalClarificationModal';
import { formatDateKey } from '@/lib/dateKey';

interface TaskInputProps {
  onAddTask: (task: Task) => void;
  defaultDate?: string;
  projects?: Project[];
  defaultProjectId?: string;
  isHighlighted?: boolean;
}

export const TaskInput = ({ onAddTask, defaultDate, projects = [], defaultProjectId, isHighlighted }: TaskInputProps) => {
  const isLoading = false;
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

  // Update deadline when defaultDate changes (e.g. switching views)
  useEffect(() => {
    setDeadline(defaultDate || '');
  }, [defaultDate]);

  // Set default project based on active view project, fallback to first project.
  useEffect(() => {
    if (defaultProjectId && projects.some(p => p.id === defaultProjectId)) {
      setProjectId(defaultProjectId);
      return;
    }
    if (projects.length > 0 && !projectId) {
      setProjectId(projects[0].id);
    }
  }, [projects, projectId, defaultProjectId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check for ambiguous temporal parsing
    if (temporalParsed?.confidence === 'ambiguous' && ambiguousAlternatives.length > 0) {
      setShowClarification(true);
      return;
    }
    
    const finalTitle = temporalParsed?.cleanedText || title.trim();
    if (!finalTitle) return;

    // Resolve category name from project ID
    const project = projects.find(p => p.id === projectId);
    const categoryName = project ? project.name : 'Inbox';

    // Use parsed temporal data if available, otherwise fall back to manual deadline
    const finalDeadline = temporalParsed?.due_date || temporalParsed?.scheduled_date || deadline || undefined;

    const newTask: Task = {
      id: generateId(),
      title: finalTitle,
      description,
      category: categoryName,
      priority,
      estimatedMinutes,
      energyLevel,
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
    setDescription('');
    setPriority(3);
    setEstimatedMinutes(60);
    setEnergyLevel('medium');
    setDeadline(defaultDate || '');
    setTemporalParsed(null);
    setIsExpanded(false);
  };

  // Parse temporal information on title change
  useEffect(() => {
    if (!title.trim()) {
      setTemporalParsed(null);
      return;
    }

    const parsed = parseTemporal(title);
    
    // Handle ambiguous cases
    if (parsed.confidence === 'ambiguous' && parsed.ambiguous && parsed.ambiguous.length > 0) {
      // For now, we'll show clarification modal on submit
      // Store the parsed result for later use
      setTemporalParsed(parsed);
      // Generate alternatives for clarification
      // This is simplified - in production, you'd generate actual alternatives
      setAmbiguousAlternatives([parsed]);
    } else if (parsed.confidence === 'high' || parsed.confidence === 'medium') {
      setTemporalParsed(parsed);
      // Update deadline if parsed date is available
      if (parsed.due_date || parsed.scheduled_date) {
        setDeadline(parsed.due_date || parsed.scheduled_date || '');
      }
    } else {
      // Low confidence - fall back to old parser
      const match = parseDateFromText(title);
      if (match) {
        setDeadline(match.date);
      }
      setTemporalParsed(null);
    }
  }, [title]);

  // Combine regex for splitting: /((?:dayRegex)|(?:tagRegex))/gi
  // But we need to keep the capture groups working.
  // Easiest is to use a combined split logic or just check parts.
  // Let's use a combined Regex for splitting:
  const combinedRegex = new RegExp(`(${dayRegex.source}|${tagRegex.source})`, 'gi');

  // Handle Input Change
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setTitle(val);
      
      // Date Check
      const dateMatch = parseDateFromText(val);
      if (dateMatch) {
          setDeadline(dateMatch.date);
      }

      // Tag Check
      const tagMatch = parseTagFromText(val);
      if (tagMatch) {
          // Find project matching the tag (case insensitive)
          const project = projects.find(p => p.name.toLowerCase() === tagMatch.toLowerCase());
          if (project) {
              setProjectId(project.id);
          }
      }
  };

  return (
    <div 
      className={clsx(
        "p-1 transition-all duration-300 rounded-xl", 
        isHighlighted && "ring-4 ring-blue-500/30 bg-blue-50/50 dark:bg-blue-900/20"
      )} 
      data-tutorial="task-input"
      id="task-input"
    >
      <form onSubmit={handleSubmit} className="relative group">
        <div className="relative flex items-center gap-3 border-b border-gray-200 dark:border-gray-800 pb-2 focus-within:border-gray-400 dark:focus-within:border-gray-600 transition-colors">
          <div className="text-gray-400 z-20">
             <Plus size={20} />
          </div>
          
          <div className="relative flex-1 h-8 flex items-center">
             {/* Overlay for highlighting */}
             <div className="absolute inset-0 flex items-center whitespace-pre text-lg font-normal pointer-events-none z-0">
                  {title.split(combinedRegex).map((part, i) => {
                     if (!part) return null; // Filter empty splits

                     // Check Day
                     if (dayRegex.test(part)) {
                         return (
                             <span key={i} className="bg-black text-white rounded-md px-1.5 -mx-1.5 relative z-10 box-decoration-clone dark:bg-white dark:text-black">
                                 {part}
                             </span>
                         );
                     }
                     // Check Tag
                     if (tagRegex.test(part)) {
                         return (
                             <span key={i} className="text-blue-600 dark:text-blue-400 font-bold">
                                 {part}
                             </span>
                         );
                     }
                     return <span key={i} className="text-gray-900 dark:text-gray-100">{part}</span>;
                  })}
             </div>

             {/* Transparent Input */}
             <input
                type="text"
                placeholder={title ? "" : "Add new task..."}
                className="absolute inset-0 w-full h-full text-lg bg-transparent border-none outline-none text-transparent caret-black dark:caret-white z-10 placeholder-gray-400"
                value={title}
                onChange={handleTitleChange}
                onFocus={() => setIsExpanded(true)}
                autoComplete="off"
                spellCheck={false}
              />
          </div>

          {title.trim() && (
             <button
                type="submit"
                className="text-sm font-semibold text-black dark:text-white hover:opacity-70 z-20"
             >
                Enter
             </button>
          )}
        </div>

        {isExpanded && (
          <div className="mt-3 pl-8 flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-1">
             {/* Quick select priority */}
             <div className="flex bg-gray-100 dark:bg-gray-800 rounded-md p-0.5">
                 {([1, 2, 3] as TaskPriority[]).map(p => (
                   <button
                     key={p}
                     type="button"
                     onClick={() => setPriority(p)}
                     className={clsx(
                       "px-2 py-0.5 text-xs font-medium rounded transition-colors",
                       priority === p ? "bg-white dark:bg-black shadow-sm text-black dark:text-white" : "text-gray-500 hover:text-gray-800"
                     )}
                   >
                     P{p}
                   </button>
                 ))}
             </div>

             {/* Duration Input */}
             <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-md px-2 py-0.5">
                <span className="text-[10px] text-gray-400 uppercase font-bold">MINS</span>
                <input 
                  type="number"
                  value={estimatedMinutes}
                  onChange={(e) => setEstimatedMinutes(parseInt(e.target.value)||0)}
                  className="w-12 bg-transparent text-xs outline-none border-none text-center font-medium"
                />
             </div>

             {/* Project Select (Formerly Category) */}
             <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={isLoading}
                className={clsx(
                    "bg-gray-100 dark:bg-gray-800 text-xs font-medium rounded-md px-2 py-1 outline-none border-none max-w-[120px]",
                    isLoading && "opacity-50 cursor-wait"
                )}
             >
                {isLoading ? (
                    <option>Loading...</option>
                ) : projects.length > 0 ? (
                    projects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))
                ) : (
                    <option value="">No Projects</option>
                )}
             </select>

             {/* Date Picker Input */}
             <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-md px-2 py-0.5">
                <span className="text-[10px] text-gray-400 uppercase font-bold">DUE</span>
                <input 
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="bg-transparent text-xs outline-none border-none font-medium text-gray-600 dark:text-gray-300 w-24"
                />
             </div>

             {/* Cancel/Collapse */}
             <button 
                type="button" 
                onClick={() => setIsExpanded(false)}
                className="ml-auto text-xs text-gray-400 hover:text-gray-600"
             >
                Close
             </button>
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
          // Re-submit with selected interpretation
          const finalTitle = selected.cleanedText || title.trim();
          if (finalTitle) {
            const project = projects.find(p => p.id === projectId);
            const categoryName = project ? project.name : 'Inbox';
            const finalDeadline = selected.due_date || selected.scheduled_date || deadline || undefined;

            const newTask: Task = {
              id: generateId(),
              title: finalTitle,
              description,
              category: categoryName,
              priority,
              estimatedMinutes,
              energyLevel,
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
