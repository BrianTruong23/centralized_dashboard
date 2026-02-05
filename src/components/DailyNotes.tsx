'use client';

import { useState, useEffect } from 'react';
import { notesDb, Note } from '@/lib/notes';
import { Loader2, Sparkles, Save, Plus, CheckCircle, ListPlus, Calendar, Pencil, X } from 'lucide-react';
import { Task, TaskCategory, TaskEnergyLevel } from '@/types/task';

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
}

export function DailyNotes({ userId, onAddTask }: DailyNotesProps) {
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

  const categories: TaskCategory[] = ['Research', 'Coding', 'Admin', 'Health', 'Life', 'Finance', 'Social', 'Content', 'UX'];
  const energyLevels: TaskEnergyLevel[] = ['low', 'medium', 'high'];

  // Load latest note on mount
  useEffect(() => {
    if (!userId) return;
    loadLatestNote();
  }, [userId]);

  const loadLatestNote = async () => {
    try {
      const notes = await notesDb.fetchNotes();
      if (notes && notes.length > 0) {
        // Just grab the most recent one for now
        const latest = notes[0];
        setNoteContent(latest.content);
        setSummary(latest.summary || '');
        setCurrentNoteId(latest.id);
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
        await notesDb.updateNote(currentNoteId, { content: noteContent, summary });
      } else {
        const newNote = await notesDb.addNote({
          user_id: userId,
          content: noteContent,
          summary
        });
        setCurrentNoteId(newNote.id);
      }
    } catch (err: any) {
      console.error('Failed to save note', err);
      setError('Failed to save note. ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSummarize = async () => {
    if (!noteContent.trim()) return;
    setIsLoading(true);
    setError(null);

    const startTime = Date.now();
    const log = (msg: string) => console.log(`[Client ${Date.now() - startTime}ms] ${msg}`);

    log('Starting summarization...');
    try {
      // First save current state
      log('Saving notes first...');
      await handleSave();
      log('Notes saved successfully');

      log('Calling /api/summarize...');
      const fetchStart = Date.now();

      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteContent }),
      });

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
      setActionItems(data.actionItems || []);
      setAddedItems(new Set()); // Reset added items

      // Update the note with the new summary
      if (currentNoteId && userId) {
        log('Saving summary to database...');
        await notesDb.updateNote(currentNoteId, { summary: data.summary });
        log('Summary saved to database');
      }

      log(`Total time: ${Date.now() - startTime}ms`);
    } catch (err: any) {
      log(`ERROR: ${err.message}`);
      setError(err.message);
    } finally {
      setIsLoading(false);
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

  const handleAddTask = (index: number) => {
    if (!onAddTask || addedItems.has(index)) return;
    const item = actionItems[index];
    const task = createTaskFromItem(item);
    onAddTask(task);
    setAddedItems(prev => new Set(prev).add(index));
  };

  const handleAddAllTasks = () => {
    if (!onAddTask) return;
    actionItems.forEach((item, index) => {
      if (!addedItems.has(index)) {
        const task = createTaskFromItem(item);
        onAddTask(task);
      }
    });
    setAddedItems(new Set(actionItems.map((_, i) => i)));
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

  if (!userId) return null;

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">Daily Notes & Dump</h2>
        <div className="flex gap-2">
            <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save
            </button>
            <button
                onClick={handleSummarize}
                disabled={isLoading || !noteContent.trim()}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
                {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Summarize with AI
            </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase text-gray-400">Your Thoughts</label>
            <textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Dump your tasks, ideas, and thoughts here..."
                className="w-full h-64 p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 resize-none focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
            />
        </div>

        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase text-gray-400">AI Summary & Action Items</label>
              {actionItems.length > 0 && onAddTask && (
                <button
                  onClick={handleAddAllTasks}
                  disabled={addedItems.size === actionItems.length}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors disabled:opacity-50"
                >
                  <ListPlus size={12} />
                  Add All ({actionItems.length - addedItems.size})
                </button>
              )}
            </div>
            <div className="w-full h-64 p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 overflow-y-auto">
                {summary || actionItems.length > 0 ? (
                    <div className="space-y-4">
                      {summary && (
                        <p className="text-sm text-gray-600 dark:text-gray-300 pb-3 border-b border-indigo-100 dark:border-indigo-900/30">
                          {summary}
                        </p>
                      )}
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
                    <div className="h-full flex items-center justify-center text-gray-400 text-sm italic">
                        Click "Summarize with AI" to generate a plan from your notes.
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
}
