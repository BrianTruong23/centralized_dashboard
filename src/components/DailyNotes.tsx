
'use client';

import { useState, useEffect } from 'react';
import { notesDb, Note } from '@/lib/notes';
import { Loader2, Sparkles, Save } from 'lucide-react';

interface DailyNotesProps {
  userId?: string; 
}

export function DailyNotes({ userId }: DailyNotesProps) {
  const [noteContent, setNoteContent] = useState('');
  const [summary, setSummary] = useState('');
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    console.log('[Client] Starting summarization...');
    try {
      // First save current state
      await handleSave();
      console.log('[Client] Notes saved. Calling API...');

      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteContent }),
      });
      
      console.log(`[Client] API response status: ${res.status}`);

      if (!res.ok) {
        const data = await res.json();
        console.error('[Client] API Error:', data);
        throw new Error(data.error || 'Failed to generate summary');
      }

      const data = await res.json();
      console.log('[Client] Summary received');
      setSummary(data.summary);
      
      // Update the note with the new summary
      if (currentNoteId && userId) {
        await notesDb.updateNote(currentNoteId, { summary: data.summary });
      }

    } catch (err: any) {
      console.error('[Client] Summarization failed exception:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
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
            <label className="text-xs font-semibold uppercase text-gray-400">AI Summary & Action Items</label>
            <div className="w-full h-64 p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 overflow-y-auto prose dark:prose-invert prose-sm">
                {summary ? (
                    <div className="whitespace-pre-wrap">{summary}</div>
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
