
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ideasDb } from '@/lib/ideas';
import { Idea } from '@/types/idea';
import { KanbanBoard } from '@/components/KanbanBoard';
import { GitHubSync } from '@/components/GitHubSync';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function FeaturesPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadIdeas = async () => {
    if (!supabase || !userId) return;
    
    try {
      const fetched = await ideasDb.fetchIdeas();
      setIdeas(fetched);
      setError(null);
    } catch (e: any) {
      console.error('Failed to fetch ideas:', e);
      setError(e.message || 'Failed to load ideas. Please check your connection.');
    }
  };

  useEffect(() => {
    const init = async () => {
      if (!supabase) {
        setLoading(false);
        setError('Supabase is not configured. Please set up your environment variables.');
        return;
      }
      
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserId(session.user.id);
        await loadIdeas();
      }
      setLoading(false);
    };
    init();

    // Listen for auth state changes
    if (!supabase) return;
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUserId(session.user.id);
        await loadIdeas();
      } else {
        setUserId(null);
        setIdeas([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div className="p-8">Loading...</div>;

  if (!userId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="mb-4">Please log in to manage features.</p>
        <Link href="/" className="text-blue-500 hover:underline">Go Home</Link>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white">
      <header className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-gray-500 hover:text-black">
            <ArrowLeft />
          </Link>
          <h1 className="font-bold">Features & Ideas</h1>
        </div>
        {userId && <GitHubSync userId={userId} onSyncComplete={loadIdeas} />}
      </header>
      <main className="flex-1 p-4 overflow-hidden">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}
        <KanbanBoard initialIdeas={ideas} userId={userId} />
      </main>
    </div>
  );
}
