'use client';

import { useState, useEffect } from 'react';
import { notesDb, Note } from '@/lib/notes';
import { Sparkles, Calendar, Trash2 } from 'lucide-react';

interface DailyNotesHistoryProps {
  userId?: string;
}

export function DailyNotesHistory({ userId }: DailyNotesHistoryProps) {
  const [pastNotes, setPastNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!userId) return;
    loadHistory();
  }, [userId]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const notes = await notesDb.fetchNotes();
      if (notes && notes.length > 0) {
        const today = new Date();
        // Filter out today's note
        const history = notes.filter(note => {
            const d = new Date(note.createdAt);
            return d.getDate() !== today.getDate() || 
                   d.getMonth() !== today.getMonth() || 
                   d.getFullYear() !== today.getFullYear();
        }).sort((a, b) => b.createdAt - a.createdAt);
        
        setPastNotes(history);
      }
    } catch (err) {
      console.error('Failed to load notes history', err);
    } finally {
        setLoading(false);
    }
  };

  if (!userId || (pastNotes.length === 0 && !loading)) return null;

  const toggleExpanded = (noteId: string) => {
    setExpandedNotes((prev) => ({ ...prev, [noteId]: !prev[noteId] }));
  };

  const handleDelete = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return;
    try {
      await notesDb.deleteNote(noteId);
      setPastNotes(prev => prev.filter(note => note.id !== noteId));
    } catch (err) {
      console.error('Failed to delete note', err);
      alert('Failed to delete note');
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">Previous Days</h3>
        
        {loading ? (
            <div className="text-center py-4 text-gray-400 text-sm">Loading history...</div>
        ) : (
            <div className="space-y-8">
                {pastNotes.map(note => (
                    <div key={note.id} className="group relative pl-6 border-l-2 border-gray-100 dark:border-gray-800 hover:border-indigo-500 dark:hover:border-indigo-500 transition-colors">
                        <div className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-gray-200 dark:bg-gray-700 group-hover:bg-indigo-500 transition-colors" />
                        {(() => {
                          const isExpanded = !!expandedNotes[note.id];
                          return (
                            <>
                        
                        <div className="mb-3 flex items-center justify-between">
                            <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                {new Date(note.createdAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                            </span>
                            <button
                                type="button"
                                onClick={() => handleDelete(note.id)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                title="Delete note"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                        
                        <div className="prose dark:prose-invert max-w-none text-gray-600 dark:text-gray-400 mb-4">
                            <p className={`whitespace-pre-wrap leading-relaxed ${isExpanded ? '' : 'line-clamp-4'}`}>
                              {note.content}
                            </p>
                        </div>
                        
                        {note.summary && isExpanded && (
                            <div className="bg-indigo-50/50 dark:bg-indigo-900/10 p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
                                <p className="text-sm text-indigo-700 dark:text-indigo-300 italic flex gap-2">
                                    <Sparkles size={16} className="shrink-0 mt-0.5" />
                                    <span>{note.summary}</span>
                                </p>
                            </div>
                        )}
                        
                        <button
                          type="button"
                          onClick={() => toggleExpanded(note.id)}
                          className="mt-2 text-xs font-semibold text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-300 transition-colors"
                        >
                          {isExpanded ? 'Show less' : 'See more'}
                        </button>
                            </>
                          );
                        })()}
                    </div>
                ))}
            </div>
        )}
    </div>
  );
}
