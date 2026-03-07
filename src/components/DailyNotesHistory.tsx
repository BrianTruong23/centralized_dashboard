'use client';

import { useMemo, useState, useEffect } from 'react';
import { notesDb, Note } from '@/lib/notes';
import { Sparkles, Trash2, Pencil, Check, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDateKey } from '@/lib/dateKey';

interface DailyNotesHistoryProps {
  userId?: string;
  refreshToken?: number;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function startOfCalendarGrid(date: Date): Date {
  const first = startOfMonth(date);
  const day = first.getDay();
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - day);
  return gridStart;
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function DailyNotesHistory({ userId, refreshToken = 0 }: DailyNotesHistoryProps) {
  const [pastNotes, setPastNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleMonth, setVisibleMonth] = useState(new Date());
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isContentExpanded, setIsContentExpanded] = useState(false);
  const [pendingDeleteNoteId, setPendingDeleteNoteId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    void loadHistory();
  }, [userId, refreshToken]);

  const loadHistory = async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const notes = await notesDb.fetchNotes(userId);
      const history = (notes || []).sort((a, b) => b.createdAt - a.createdAt);

      setPastNotes(history);

      if (history.length > 0) {
        const firstDate = new Date(history[0].createdAt);
        const firstDayKey = formatDateKey(firstDate);
        setVisibleMonth(new Date(firstDate.getFullYear(), firstDate.getMonth(), 1));
        setSelectedDayKey(firstDayKey);
        setSelectedNoteId(history[0].id);
      } else {
        setSelectedDayKey(null);
        setSelectedNoteId(null);
      }
    } catch (err) {
      console.error('Failed to load notes history', err);
    } finally {
      setLoading(false);
    }
  };

  const notesByDay = useMemo(() => {
    const grouped = new Map<string, Note[]>();
    pastNotes.forEach((note) => {
      const key = formatDateKey(new Date(note.createdAt));
      const existing = grouped.get(key) || [];
      existing.push(note);
      grouped.set(key, existing);
    });
    grouped.forEach((arr) => arr.sort((a, b) => b.createdAt - a.createdAt));
    return grouped;
  }, [pastNotes]);

  const selectedDayNotes = selectedDayKey ? notesByDay.get(selectedDayKey) || [] : [];
  const selectedNote =
    selectedDayNotes.find((n) => n.id === selectedNoteId) ||
    selectedDayNotes[0] ||
    null;
  const shouldCollapseContent = !!selectedNote && selectedNote.content.length > 500;

  useEffect(() => {
    if (!selectedDayNotes.length) {
      setSelectedNoteId(null);
      return;
    }
    if (!selectedNoteId || !selectedDayNotes.some((n) => n.id === selectedNoteId)) {
      setSelectedNoteId(selectedDayNotes[0].id);
    }
  }, [selectedDayNotes, selectedNoteId]);

  useEffect(() => {
    setIsContentExpanded(false);
  }, [selectedNoteId]);

  if (!userId || (pastNotes.length === 0 && !loading)) return null;

  const handleDelete = async (noteId: string) => {
    try {
      await notesDb.deleteNote(noteId);
      setPastNotes((prev) => prev.filter((n) => n.id !== noteId));
      setEditingNoteId(null);
      setEditingContent('');
      setPendingDeleteNoteId(null);
    } catch (err) {
      console.error('Failed to delete note', err);
      alert('Failed to delete note');
    }
  };

  const startEdit = (note: Note) => {
    setEditingNoteId(note.id);
    setEditingContent(note.content);
  };

  const cancelEdit = () => {
    setEditingNoteId(null);
    setEditingContent('');
  };

  const saveEdit = async () => {
    if (!editingNoteId) return;
    setIsSavingEdit(true);
    try {
      await notesDb.updateNote(editingNoteId, { content: editingContent });
      setPastNotes((prev) =>
        prev.map((n) => (n.id === editingNoteId ? { ...n, content: editingContent } : n))
      );
      setEditingNoteId(null);
      setEditingContent('');
    } catch (err) {
      console.error('Failed to update note', err);
      alert('Failed to update note');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const gridStart = startOfCalendarGrid(visibleMonth);
  const firstDayOfMonth = startOfMonth(visibleMonth).getDay();
  const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
  const weekRows = Math.ceil((firstDayOfMonth + daysInMonth) / 7);
  const gridDays = Array.from({ length: weekRows * 7 }).map((_, idx) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + idx);
    return d;
  });

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
      {pendingDeleteNoteId && (
        <div className="fixed inset-0 z-[220] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow-xl">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Delete this note?</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteNoteId(null)}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(pendingDeleteNoteId)}
                className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">Previous Days</h3>

      {loading ? (
        <div className="text-center py-4 text-gray-400 text-sm">Loading history...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">
          <aside className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => setVisibleMonth((m) => addMonths(m, -1))}
                className="p-1.5 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <ChevronLeft size={16} />
              </button>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                {visibleMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </p>
              <button
                type="button"
                onClick={() => setVisibleMonth((m) => addMonths(m, 1))}
                className="p-1.5 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS.map((day, idx) => (
                <div key={`${day}-${idx}`} className="text-[10px] font-semibold text-gray-400 text-center py-1">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {gridDays.map((day) => {
                const dayKey = formatDateKey(day);
                const notes = notesByDay.get(dayKey) || [];
                const isSelected = selectedDayKey === dayKey;
                const inMonth = isSameMonth(day, visibleMonth);
                return (
                  <button
                    key={dayKey}
                    type="button"
                    onClick={() => {
                      setSelectedDayKey(dayKey);
                      setSelectedNoteId(notes[0]?.id || null);
                      if (!isSameMonth(day, visibleMonth)) {
                        setVisibleMonth(new Date(day.getFullYear(), day.getMonth(), 1));
                      }
                    }}
                    className={`h-14 rounded-md border text-left p-1.5 transition-colors ${
                      isSelected
                        ? 'bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)] border-[var(--accent-border)]'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className={`text-xs font-medium ${inMonth ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500'}`}>
                      {day.getDate()}
                    </div>
                    {notes.length > 0 && (
                      <div className="mt-1 text-[10px] font-semibold text-[var(--accent-link)]">
                        {notes.length} note{notes.length > 1 ? 's' : ''}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            {!selectedNote ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Select a date with notes.</p>
            ) : (
              <>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {new Date(selectedNote.createdAt).toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {new Date(selectedNote.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {editingNoteId === selectedNote.id ? (
                      <>
                        <button
                          type="button"
                          onClick={saveEdit}
                          disabled={isSavingEdit}
                          className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:text-emerald-400 dark:hover:bg-emerald-900/30 rounded-lg disabled:opacity-50"
                          title="Save changes"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={isSavingEdit}
                          className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50"
                          title="Cancel editing"
                        >
                          <X size={16} />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(selectedNote)}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:text-indigo-400 dark:hover:bg-indigo-900/30 rounded-lg"
                        title="Edit note"
                      >
                        <Pencil size={16} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPendingDeleteNoteId(selectedNote.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/30 rounded-lg"
                      title="Delete note"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {selectedDayNotes.length > 1 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {selectedDayNotes.map((note, idx) => (
                      <button
                        key={note.id}
                        type="button"
                        onClick={() => {
                          setSelectedNoteId(note.id);
                          if (editingNoteId && editingNoteId !== note.id) cancelEdit();
                        }}
                        className={`px-2.5 py-1 text-xs rounded-md border ${
                          note.id === selectedNote.id
                            ? 'bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)] border-[var(--accent-border)]'
                            : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300'
                        }`}
                      >
                        Note {idx + 1} · {new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </button>
                    ))}
                  </div>
                )}

                {editingNoteId === selectedNote.id ? (
                  <textarea
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    className="w-full min-h-[240px] text-sm whitespace-pre-wrap leading-relaxed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)]/35"
                  />
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="min-w-0">
                      <p
                        className={`text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed min-h-[160px] ${
                          shouldCollapseContent && !isContentExpanded ? 'line-clamp-8' : ''
                        }`}
                      >
                        {selectedNote.content}
                      </p>
                      {shouldCollapseContent && (
                        <button
                          type="button"
                          onClick={() => setIsContentExpanded((prev) => !prev)}
                          className="mt-2 text-xs font-medium text-gray-500 hover:text-[var(--accent-link)] transition-colors"
                        >
                          {isContentExpanded ? 'Show less' : 'Show more'}
                        </button>
                      )}
                    </div>

                    <div className="bg-[var(--accent-soft)]/70 p-4 rounded-xl border border-[var(--accent-border)] h-fit">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-soft-foreground)]/80 mb-2">
                        AI Summary
                      </p>
                      {selectedNote.summary ? (
                        <p className="text-sm text-[var(--accent-soft-foreground)] italic flex gap-2">
                          <Sparkles size={16} className="shrink-0 mt-0.5" />
                          <span>{selectedNote.summary}</span>
                        </p>
                      ) : (
                        <p className="text-sm text-[var(--accent-soft-foreground)]/80">
                          No AI summary for this note yet.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
