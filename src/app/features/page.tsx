
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ideasDb } from '@/lib/ideas';
import { Idea } from '@/types/idea';
import { KanbanBoard } from '@/components/KanbanBoard';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function FeaturesPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserId(session.user.id);
        try {
          const fetched = await ideasDb.fetchIdeas();
          setIdeas(fetched);
        } catch (e) {
          console.error(e);
        }
      }
      setLoading(false);
    };
    init();
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
      <header className="p-4 border-b flex items-center gap-4">
        <Link href="/" className="text-gray-500 hover:text-black">
          <ArrowLeft />
        </Link>
        <h1 className="font-bold">Features & Ideas</h1>
      </header>
      <main className="flex-1 p-4 overflow-hidden">
        <KanbanBoard initialIdeas={ideas} userId={userId} />
      </main>
    </div>
  );
}
