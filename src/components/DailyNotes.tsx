'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { notesDb } from '@/lib/notes';
import { Loader2, Sparkles, Save, Plus, CheckCircle, ListPlus, Calendar, Pencil, WandSparkles, ChevronsUpDown, TextQuote, Briefcase } from 'lucide-react';
import { Task, TaskCategory, TaskEnergyLevel } from '@/types/task';
import { Project, CreateProjectInput } from '@/types/project';

interface ActionItem {
  title: string;
  description: string;
  category: TaskCategory;
  priority: 1 | 2 | 3 | 4 | 5;
  estimatedMinutes: number;
  energyLevel: TaskEnergyLevel;
  deadline: string | null;
}

interface DailyNotesProps {
  userId?: string;
  onAddTask?: (task: Task) => void;
  showHistory?: boolean;
  projects?: Project[];
  addProject?: (input: CreateProjectInput) => Promise<Project | undefined>;
  onNoteSaved?: () => void;
  isPro?: boolean;
}

type DailyNotesCache = {
  noteContent: string;
  summary: string;
  currentNoteId: string | null;
  isSummaryVisible: boolean;
};

const dailyNotesCache = new Map<string, DailyNotesCache>();

function getSelectionAnchorFromTextarea(
  textarea: HTMLTextAreaElement,
  container: HTMLElement,
  selectionEnd: number
): { x: number; y: number } {
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  const marker = document.createElement('span');

  const mirrorStyles = [
    'position:absolute',
    'visibility:hidden',
    'white-space:pre-wrap',
    'word-wrap:break-word',
    'overflow-wrap:break-word',
    'top:0',
    'left:-9999px',
    `width:${textarea.clientWidth}px`,
    `font-family:${style.fontFamily}`,
    `font-size:${style.fontSize}`,
    `font-weight:${style.fontWeight}`,
    `line-height:${style.lineHeight}`,
    `letter-spacing:${style.letterSpacing}`,
    `padding:${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`,
    `border:${style.border}`,
    'box-sizing:border-box',
  ].join(';');

  mirror.setAttribute('style', mirrorStyles);
  mirror.textContent = textarea.value.slice(0, selectionEnd);
  marker.textContent = '\u200b';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const textareaRect = textarea.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const markerLeft = marker.offsetLeft;
  const markerTop = marker.offsetTop;

  document.body.removeChild(mirror);

  const localTextareaX = textareaRect.left - containerRect.left;
  const localTextareaY = textareaRect.top - containerRect.top;
  const left = localTextareaX + markerLeft + 10;
  const top = localTextareaY + markerTop - textarea.scrollTop - 30;

  return {
    x: Math.max(8, Math.min(left, containerRect.width - 40)),
    y: Math.max(8, Math.min(top, containerRect.height - 36)),
  };
}

export function DailyNotes({ userId, onAddTask, showHistory = false, projects = [], addProject, onNoteSaved, isPro = false }: DailyNotesProps) {
  const MAX_NOTE_WORDS = 500;
  const [noteContent, setNoteContent] = useState('');
  const [summary, setSummary] = useState('');
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [addedItems, setAddedItems] = useState<Set<number>>(new Set());
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<ActionItem | null>(null);
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSummaryVisible, setIsSummaryVisible] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [selectedRange, setSelectedRange] = useState<{ start: number; end: number; text: string } | null>(null);
  const [selectionActionLoading, setSelectionActionLoading] = useState<'rephrase' | 'shorten' | 'elaborate' | 'more_formal' | 'custom' | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const writingSurfaceRef = useRef<HTMLDivElement | null>(null);
  const [refineAnchor, setRefineAnchor] = useState<{ x: number; y: number } | null>(null);
  const [isSelectionMenuOpen, setIsSelectionMenuOpen] = useState(false);
  const selectionMenuRef = useRef<HTMLDivElement | null>(null);
  const selectionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [selectionPrompt, setSelectionPrompt] = useState('');

  // State for missing projects handling
  const [missingProjects, setMissingProjects] = useState<string[]>([]);
  const [pendingTasksToAdd, setPendingTasksToAdd] = useState<number[] | 'all' | null>(null);

  const categories: TaskCategory[] = projects.length > 0
    ? projects.map(p => p.name)
    : ['Work', 'Life'];
  const energyLevels: TaskEnergyLevel[] = ['low', 'medium', 'high'];

  const countWords = (text: string) => {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  };

  const clampToMaxWords = (text: string, maxWords: number) => {
    const trimmed = text.trim();
    if (!trimmed) return '';
    const words = trimmed.split(/\s+/);
    if (words.length <= maxWords) return text;
    return words.slice(0, maxWords).join(' ');
  };

  // Load latest note on mount
  useEffect(() => {
    if (!userId) return;
    const cached = dailyNotesCache.get(userId);
    if (cached) {
      setNoteContent(cached.noteContent);
      setSummary(cached.summary);
      setCurrentNoteId(cached.currentNoteId);
      setIsSummaryVisible(cached.isSummaryVisible);
      return;
    }
    loadLatestNote();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    dailyNotesCache.set(userId, {
      noteContent,
      summary,
      currentNoteId,
      isSummaryVisible,
    });
  }, [userId, noteContent, summary, currentNoteId, isSummaryVisible]);

  useEffect(() => {
    const closeOnOutside = (event: MouseEvent) => {
      if (!isSelectionMenuOpen) return;
      const target = event.target as Node;
      if (
        selectionMenuRef.current?.contains(target) ||
        selectionTriggerRef.current?.contains(target)
      ) {
        return;
      }
      setIsSelectionMenuOpen(false);
    };

    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [isSelectionMenuOpen]);

  const loadLatestNote = async () => {
    if (!userId) return;
    try {
      const notes = await notesDb.fetchNotes(userId);
      if (notes && notes.length > 0) {
        // Filter for TODAY's notes
        const today = new Date();
        const todaysNotes = notes.filter(note => {
            const d = new Date(note.createdAt);
            return d.getDate() === today.getDate() && 
                   d.getMonth() === today.getMonth() && 
                   d.getFullYear() === today.getFullYear();
        });

        // Keep current note if still exists, otherwise default to latest today's note
        const existingSelected = currentNoteId ? notes.find(n => n.id === currentNoteId) : null;
        const selected = existingSelected || todaysNotes[0] || null;

        if (selected) {
            setNoteContent(selected.content);
            setSummary(selected.summary || '');
            setIsSummaryExpanded(false);
            setCurrentNoteId(selected.id);
            setLastSavedAt(selected.updatedAt || selected.createdAt);
        } else {
            // Reset if no note selected
            setNoteContent('');
            setSummary('');
            setIsSummaryExpanded(false);
            setCurrentNoteId(null);
            setLastSavedAt(null);
        }

      } else {
        setNoteContent('');
        setSummary('');
        setIsSummaryExpanded(false);
        setCurrentNoteId(null);
        setLastSavedAt(null);
      }
    } catch (err) {
      console.error('Failed to load notes', err);
    }
  };

  const handleSave = async () => {
    if (!userId) return;
    setIsSaving(true);
    setError(null);
    try {
      if (currentNoteId) {
        const updated = await notesDb.updateNote(currentNoteId, { content: noteContent, summary });
        setLastSavedAt(updated.updatedAt);
      } else {
        const newNote = await notesDb.addNote({
          user_id: userId,
          content: noteContent,
          summary
        });
        setCurrentNoteId(newNote.id);
        setLastSavedAt(newNote.updatedAt || newNote.createdAt);
      }
      await loadLatestNote();
      onNoteSaved?.();
    } catch (err: any) {
      console.error('Failed to save note', err);
      setError('Failed to save note. ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateNewNote = () => {
    setCurrentNoteId(null);
    setNoteContent('');
    setSummary('');
    setActionItems([]);
    setAddedItems(new Set());
    setIsSummaryVisible(false);
    setIsSummaryExpanded(false);
    setEditingIndex(null);
    setEditForm(null);
    setLastSavedAt(null);
    setSelectedRange(null);
  };

  const handleSummarize = async () => {
    if (!noteContent.trim()) return;
    setIsSummaryVisible(true);
    setIsLoading(true);
    setError(null);

    const startTime = Date.now();
    const log = (msg: string) => console.log(`[Client ${Date.now() - startTime}ms] ${msg}`);

    log('Starting summarization...');
    try {
      log('Calling /api/summarize...');
      const fetchStart = Date.now();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 35000);

      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteContent, projects: projects.map(p => p.name) }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      log(`API responded in ${Date.now() - fetchStart}ms. Status: ${res.status}`);

      if (!res.ok) {
        const data = await res.json();
        log(`API Error: ${JSON.stringify(data)}`);
        throw new Error(data.error || 'Failed to generate summary');
      }

      log('Parsing response...');
      const data = await res.json();
      log(`Summary received. Length: ${data.summary?.length || 0} chars`);
      log(`Action items received: ${data.actionItems?.length || 0}`);

      setSummary(data.summary);
      setIsSummaryExpanded(false);
      setActionItems(data.actionItems || []);
      setAddedItems(new Set()); // Reset added items

      // Persist note content + summary together to avoid missing summaries on new notes.
      if (userId) {
        if (currentNoteId) {
          const updated = await notesDb.updateNote(currentNoteId, { content: noteContent, summary: data.summary });
          setLastSavedAt(updated.updatedAt);
          log('Updated existing note with summary');
        } else {
          const created = await notesDb.addNote({
            user_id: userId,
            content: noteContent,
            summary: data.summary,
          });
          setCurrentNoteId(created.id);
          setLastSavedAt(created.updatedAt || created.createdAt);
          log(`Created note with summary: ${created.id}`);
        }
        onNoteSaved?.();
      }

      log(`Total time: ${Date.now() - startTime}ms`);
    } catch (err: any) {
      const message = err.name === 'AbortError'
        ? 'Request timed out. Please try again.'
        : (err.message || 'An unexpected error occurred');
      log(`ERROR: ${message}`);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const updateSelectionRange = () => {
    const element = textareaRef.current;
    const container = writingSurfaceRef.current;
    if (!element || !container) return;
    const start = element.selectionStart ?? 0;
    const end = element.selectionEnd ?? 0;
    const text = element.value.slice(start, end).trim();
    if (end - start >= 3 && text.length >= 3) {
      setSelectedRange({ start, end, text });
      setRefineAnchor(getSelectionAnchorFromTextarea(element, container, end));
      return;
    }
    setIsSelectionMenuOpen(false);
    setSelectedRange(null);
    setRefineAnchor(null);
  };

  const handleSelectionAction = async (
    mode: 'rephrase' | 'shorten' | 'elaborate' | 'more_formal' | 'custom'
  ) => {
    if (!selectedRange || selectionActionLoading) return;
    if (!isPro) {
      setError('Text refinement is a Pro feature.');
      setIsSelectionMenuOpen(false);
      return;
    }
    if (mode === 'custom' && !selectionPrompt.trim()) return;

    setSelectionActionLoading(mode);
    setError(null);
    try {
      const res = await fetch('/api/refine-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedText: selectedRange.text,
          fullText: noteContent,
          mode,
          instruction: selectionPrompt.trim() || undefined,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
        ? await res.json()
        : { error: await res.text() };
      if (!res.ok) throw new Error(data?.error || 'Failed to refine selection');
      const refined = String(data?.refinedText || '').trim();
      if (!refined) throw new Error('No refined text returned');

      setNoteContent((prev) => {
        const next = `${prev.slice(0, selectedRange.start)}${refined}${prev.slice(selectedRange.end)}`;
        return clampToMaxWords(next, MAX_NOTE_WORDS);
      });

      const nextCursor = selectedRange.start + refined.length;
      setSelectedRange(null);
      setRefineAnchor(null);
      setIsSelectionMenuOpen(false);
      setSelectionPrompt('');
      requestAnimationFrame(() => {
        const element = textareaRef.current;
        if (!element) return;
        element.focus();
        element.setSelectionRange(nextCursor, nextCursor);
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to refine selection';
      setError(message);
    } finally {
      setSelectionActionLoading(null);
    }
  };

  const createTaskFromItem = (item: ActionItem): Task => ({
    id: crypto.randomUUID(),
    user_id: userId,
    title: item.title,
    description: item.description || '',
    category: item.category || 'Admin',
    priority: item.priority || 3,
    estimatedMinutes: item.estimatedMinutes || 30,
    energyLevel: item.energyLevel || 'medium',
    deadline: item.deadline || undefined,
    status: 'todo',
    tags: [],
    createdAt: Date.now(),
  });

  // Check for missing projects before adding tasks
  const checkMissingProjects = (indices: number[] | 'all') => {
    const itemsToCheck = indices === 'all' 
      ? actionItems 
      : indices.map(i => actionItems[i]);
    
    // Filter out items that are already added
    const items = indices === 'all'
        ? itemsToCheck.filter((_, i) => !addedItems.has(i))
        : itemsToCheck;

    if (items.length === 0) return;

    const usedCategories = new Set(items.map(item => item.category));
    const existingProjectNames = new Set(projects.map(p => p.name.toLowerCase()));
    
    const missing = Array.from(usedCategories).filter(cat => 
        cat && !existingProjectNames.has(cat.toLowerCase()) && cat !== 'Admin'
    );

    if (missing.length > 0) {
      setMissingProjects(missing);
      setPendingTasksToAdd(indices);
    } else {
      executeAddTasks(indices);
    }
  };

  const executeAddTasks = async (indices: number[] | 'all', createdProjectMap: Record<string, string> = {}) => {
    if (!onAddTask) return;

    const projectMap = new Map<string, string>();
    projects.forEach(p => projectMap.set(p.name.toLowerCase(), p.id));
    
    // Add newly created projects to map
    Object.entries(createdProjectMap).forEach(([name, id]) => {
        projectMap.set(name.toLowerCase(), id);
    });

    const itemsToAdd = indices === 'all' 
        ? actionItems.map((item, i) => ({ item, index: i }))
        : indices.map(i => ({ item: actionItems[i], index: i }));

    itemsToAdd.forEach(({ item, index }) => {
        if (!addedItems.has(index)) {
            const projectId = projectMap.get(item.category.toLowerCase());
            const task = createTaskFromItem(item);
            if (projectId) {
                task.project_id = projectId;
            }
            onAddTask(task);
            setAddedItems(prev => new Set(prev).add(index));
        }
    });
    
    setMissingProjects([]);
    setPendingTasksToAdd(null);
  };

  const handleConfirmCreateProjects = async () => {
    const newProjectMap: Record<string, string> = {};
    
    // Create projects sequentially to ensure we get IDs
    for (const name of missingProjects) {
        try {
            const newProject = await addProject?.({ name, color: 'blue' }); // Default color
            if (newProject) {
                newProjectMap[name] = newProject.id;
            }
        } catch (e) {
            console.error(`Failed to create project ${name}`, e);
        }
    }

    if (pendingTasksToAdd !== null) {
        executeAddTasks(pendingTasksToAdd, newProjectMap);
    }
  };

  const handleSkipCreateProjects = () => {
      if (pendingTasksToAdd !== null) {
          executeAddTasks(pendingTasksToAdd);
      }
  };

  const handleAddTask = (index: number) => {
    if (!onAddTask || addedItems.has(index)) return;
    checkMissingProjects([index]);
  };

  const handleAddAllTasks = () => {
    if (!onAddTask) return;
    checkMissingProjects('all');
  };

  const handleEditClick = (index: number) => {
    setEditingIndex(index);
    setEditForm({ ...actionItems[index] });
  };

  const handleEditSave = () => {
    if (editingIndex === null || !editForm) return;
    const newItems = [...actionItems];
    newItems[editingIndex] = editForm;
    setActionItems(newItems);
    setEditingIndex(null);
    setEditForm(null);
  };

  const handleEditCancel = () => {
    setEditingIndex(null);
    setEditForm(null);
  };

  const summaryPoints = useMemo(() => {
    if (!summary.trim()) return [];
    const normalized = summary.replace(/\r\n/g, '\n').trim();
    const lines = normalized
      .split('\n')
      .map((line) => line.replace(/^[\-\*\u2022]\s*/, '').trim())
      .filter(Boolean);

    const rawPoints = lines.length > 1
      ? lines
      : normalized
          .split(/(?<=[.!?])\s+/)
          .map((part) => part.trim())
          .filter(Boolean);

    const unique: string[] = [];
    rawPoints.forEach((point) => {
      if (!unique.includes(point)) unique.push(point);
    });
    return unique;
  }, [summary]);
  if (!userId) return null;

  const wordCount = countWords(noteContent);
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const saveStatusLabel = isSaving
    ? 'Saving...'
    : lastSavedAt
      ? `Saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : 'Not saved yet';
  const previewSummaryPoints = isSummaryExpanded ? summaryPoints : summaryPoints.slice(0, 5);
  const hasHiddenSummaryPoints = summaryPoints.length > 5 && !isSummaryExpanded;

  return (
    <div className="bg-white dark:bg-gray-800 p-5 md:p-7 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
      
      {/* Missing Projects Confirmation Modal */}
      {missingProjects.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl w-full max-w-md shadow-xl border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-bold mb-2 text-gray-900 dark:text-gray-100">Create Missing Projects?</h3>
                <p className="text-gray-600 dark:text-gray-300 mb-4 text-sm">
                    The following categories from your summary do not exist as projects. Would you like to create them automatically?
                </p>
                <div className="flex flex-wrap gap-2 mb-6">
                    {missingProjects.map(p => (
                        <span key={p} className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded text-sm font-medium">
                            {p}
                        </span>
                    ))}
                </div>
                <div className="flex justify-end gap-3">
                    <button 
                        onClick={handleSkipCreateProjects}
                        className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 font-medium"
                    >
                        Skip
                    </button>
                    <button 
                        onClick={handleConfirmCreateProjects}
                        className="px-4 py-2 text-sm rounded-lg font-medium accent-solid-btn"
                    >
                        Create & Add
                    </button>
                </div>
            </div>
        </div>
      )}

      <div className="mb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[28px] md:text-[32px] leading-tight font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              Daily Notes
            </h2>
            <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span>{todayLabel}</span>
              <span>•</span>
              <span>{saveStatusLabel}</span>
            </div>
          </div>
          <div className="flex gap-1.5">
            <button
                onClick={handleCreateNewNote}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 bg-transparent border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
            >
                <Plus size={13} />
                New
            </button>
            <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700/70 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
                {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                Save
            </button>
            <button
                onClick={handleSummarize}
                disabled={isLoading || !noteContent.trim()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)] hover:opacity-90"
            >
                {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                Summarize
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg">
          {error}
        </div>
      )}

      <div className="space-y-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Writing</label>
            <div className="flex items-center gap-2">
              <span className={`text-xs ${wordCount >= MAX_NOTE_WORDS ? 'text-red-500' : 'text-gray-400'}`}>
                {wordCount}/{MAX_NOTE_WORDS} words
              </span>
            </div>
          </div>
          <div ref={writingSurfaceRef} className="relative rounded-2xl bg-gray-50/70 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 px-5 py-4">
            {selectedRange && refineAnchor && isPro && (
              <>
                <button
                  ref={selectionTriggerRef}
                  type="button"
                  onClick={() => setIsSelectionMenuOpen((prev) => !prev)}
                  disabled={!!selectionActionLoading}
                  className="absolute z-10 h-9 w-9 inline-flex items-center justify-center rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)] shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
                  style={{ left: refineAnchor.x, top: refineAnchor.y }}
                  title="Text actions"
                >
                  {selectionActionLoading ? <Loader2 size={14} className="animate-spin" /> : <WandSparkles size={14} />}
                </button>
                {isSelectionMenuOpen && (
                  <div
                    ref={selectionMenuRef}
                    className="absolute z-20 min-w-[280px] rounded-xl border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800"
                    style={{ left: refineAnchor.x, top: refineAnchor.y + 40 }}
                  >
                    <div className="mb-1.5">
                      <input
                        type="text"
                        value={selectionPrompt}
                        onChange={(e) => setSelectionPrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleSelectionAction('custom');
                          }
                        }}
                        placeholder="Modify with a prompt"
                        className="w-full rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-700 outline-none focus:border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectionAction('rephrase')}
                      disabled={!!selectionActionLoading}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-60 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      <WandSparkles size={14} />
                      Rephrase
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectionAction('shorten')}
                      disabled={!!selectionActionLoading}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-60 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      <ChevronsUpDown size={14} />
                      Shorten
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectionAction('elaborate')}
                      disabled={!!selectionActionLoading}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-60 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      <TextQuote size={14} />
                      Elaborate
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectionAction('more_formal')}
                      disabled={!!selectionActionLoading}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-60 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      <Briefcase size={14} />
                      More formal
                    </button>
                  </div>
                )}
              </>
            )}
            <textarea
              ref={textareaRef}
              value={noteContent}
              onChange={(e) => setNoteContent(clampToMaxWords(e.target.value, MAX_NOTE_WORDS))}
              onSelect={updateSelectionRange}
              onMouseUp={updateSelectionRange}
              onKeyUp={updateSelectionRange}
              placeholder="Start writing your notes..."
              className="w-full min-h-[320px] md:min-h-[360px] bg-transparent border-0 outline-none resize-none text-[17px] leading-8 tracking-[0.01em] text-gray-800 dark:text-gray-200 placeholder:text-gray-400/90 dark:placeholder:text-gray-500"
            />
          </div>
        </div>

        {isSummaryVisible && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase text-gray-400">AI Summary & Action Items</label>
              {actionItems.length > 0 && onAddTask && (
                <button
                  onClick={handleAddAllTasks}
                  disabled={addedItems.size === actionItems.length}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-[var(--accent-soft-foreground)] bg-[var(--accent-soft)] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <ListPlus size={12} />
                  Add All ({actionItems.length - addedItems.size})
                </button>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/60 p-3">
              {summaryPoints.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Summary Preview
                  </p>
                  <ul className="space-y-1">
                    {previewSummaryPoints.map((point, idx) => (
                      <li key={`${point.slice(0, 24)}-${idx}`} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                        • {point}
                      </li>
                    ))}
                  </ul>
                  {(hasHiddenSummaryPoints || isSummaryExpanded) && (
                    <button
                      type="button"
                      onClick={() => setIsSummaryExpanded((prev) => !prev)}
                      className="text-xs font-medium text-[var(--accent-soft-foreground)] hover:opacity-80 transition-opacity"
                    >
                      {isSummaryExpanded ? 'Show less' : `Show more (${summaryPoints.length - previewSummaryPoints.length} more)`}
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Click &quot;Summarize with AI&quot; to generate a concise plan from your note.
                </p>
              )}
            </div>

            <div className="w-full max-h-[28rem] p-4 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 overflow-y-auto">
              {summary || actionItems.length > 0 ? (
                <div className="space-y-4">
                      {actionItems.length > 0 && (
                        <div className="space-y-2">
                          {actionItems.map((item, index) => (
                            <div key={index}>
                              {editingIndex === index && editForm ? (
                                <div className="p-3 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-gray-800 space-y-3">
                                  <div>
                                    <label className="text-xs text-gray-500 dark:text-gray-400">Title</label>
                                    <input
                                      type="text"
                                      value={editForm.title}
                                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                      className="w-full mt-1 px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-500 dark:text-gray-400">Description</label>
                                    <input
                                      type="text"
                                      value={editForm.description}
                                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                      className="w-full mt-1 px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-xs text-gray-500 dark:text-gray-400">Category</label>
                                      <select
                                        value={editForm.category}
                                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value as TaskCategory })}
                                        className="w-full mt-1 px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                      >
                                        {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="text-xs text-gray-500 dark:text-gray-400">Priority</label>
                                      <select
                                        value={editForm.priority}
                                        onChange={(e) => setEditForm({ ...editForm, priority: Number(e.target.value) as 1|2|3|4|5 })}
                                        className="w-full mt-1 px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                      >
                                        <option value={1}>P1 - Urgent</option>
                                        <option value={2}>P2 - High</option>
                                        <option value={3}>P3 - Normal</option>
                                        <option value={4}>P4 - Low</option>
                                        <option value={5}>P5 - Someday</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="text-xs text-gray-500 dark:text-gray-400">Est. Minutes</label>
                                      <input
                                        type="number"
                                        value={editForm.estimatedMinutes}
                                        onChange={(e) => setEditForm({ ...editForm, estimatedMinutes: Number(e.target.value) })}
                                        className="w-full mt-1 px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-xs text-gray-500 dark:text-gray-400">Energy</label>
                                      <select
                                        value={editForm.energyLevel}
                                        onChange={(e) => setEditForm({ ...editForm, energyLevel: e.target.value as TaskEnergyLevel })}
                                        className="w-full mt-1 px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                      >
                                        {energyLevels.map(level => <option key={level} value={level}>{level}</option>)}
                                      </select>
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-500 dark:text-gray-400">Deadline</label>
                                    <input
                                      type="date"
                                      value={editForm.deadline || ''}
                                      onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value || null })}
                                      className="w-full mt-1 px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                  </div>
                                  <div className="flex justify-end gap-2 pt-2">
                                    <button
                                      onClick={handleEditCancel}
                                      className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={handleEditSave}
                                      className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                                    >
                                      Save
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                                    addedItems.has(index)
                                      ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700'
                                  }`}
                                >
                                  <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                      {item.title}
                                    </h4>
                                    {item.description && (
                                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                                        {item.description}
                                      </p>
                                    )}
                                    <div className="flex flex-wrap gap-2 mt-1.5">
                                      <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300">
                                        {item.category}
                                      </span>
                                      <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300">
                                        {item.estimatedMinutes}m
                                      </span>
                                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                                        item.priority <= 2
                                          ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                                      }`}>
                                        P{item.priority}
                                      </span>
                                      {item.deadline && (
                                        <span className="text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded flex items-center gap-1">
                                          <Calendar size={10} />
                                          {new Date(item.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    {!addedItems.has(index) && (
                                      <button
                                        onClick={() => handleEditClick(index)}
                                        className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:text-indigo-400 dark:hover:bg-indigo-900/30 transition-colors"
                                        title="Edit task"
                                      >
                                        <Pencil size={16} />
                                      </button>
                                    )}
                                    {onAddTask && (
                                      <button
                                        onClick={() => handleAddTask(index)}
                                        disabled={addedItems.has(index)}
                                        className={`flex-shrink-0 p-1.5 rounded-lg transition-colors ${
                                          addedItems.has(index)
                                            ? 'text-green-600 dark:text-green-400'
                                            : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:text-indigo-400 dark:hover:bg-indigo-900/30'
                                        }`}
                                        title={addedItems.has(index) ? 'Added' : 'Add to tasks'}
                                      >
                                        {addedItems.has(index) ? <CheckCircle size={16} /> : <Plus size={16} />}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                  Click &quot;Summarize with AI&quot; to generate action items from your notes.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
