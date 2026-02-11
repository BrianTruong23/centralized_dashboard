
import { useState, useEffect } from 'react';
import { Idea, IdeaStatus } from '@/types/idea';
import { ideasDb } from '@/lib/ideas';
import { generateId } from '@/lib/utils';
import clsx from 'clsx';
import { Plus, X, ArrowRight, ArrowLeft } from 'lucide-react';

interface KanbanBoardProps {
  initialIdeas: Idea[];
  userId: string;
}

const COLUMNS: { id: IdeaStatus; title: string }[] = [
  { id: 'backlog', title: 'Backlog' },
  { id: 'planned', title: 'Planned' },
  { id: 'in-progress', title: 'In Progress' },
  { id: 'done', title: 'Done' },
];

export const KanbanBoard = ({ initialIdeas, userId }: KanbanBoardProps) => {
  const [ideas, setIdeas] = useState<Idea[]>(initialIdeas);
  const [isAdding, setIsAdding] = useState(false);
  const [newIdeaTitle, setNewIdeaTitle] = useState('');
  const [newIdeaDesc, setNewIdeaDesc] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Update ideas when initialIdeas prop changes
  useEffect(() => {
    setIdeas(initialIdeas);
  }, [initialIdeas]);

  const handleAdd = async (e: React.FormEvent, status: IdeaStatus = 'backlog') => {
    e.preventDefault();
    if (!newIdeaTitle.trim()) return;

    setError(null);
    try {
      const newIdea = await ideasDb.addIdea({
        title: newIdeaTitle,
        description: newIdeaDesc,
        status: status,
        user_id: userId,
      });
      setIdeas(prev => [newIdea, ...prev]);
      setNewIdeaTitle('');
      setNewIdeaDesc('');
      setIsAdding(false);
    } catch (err: any) {
      setError(err.message || 'Failed to add idea. Please try again.');
      console.error(err);
    }
  };

  const handleMove = async (idea: Idea, direction: 'next' | 'prev') => {
    const currentIndex = COLUMNS.findIndex(c => c.id === idea.status);
    if (currentIndex === -1) return;

    const newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (newIndex < 0 || newIndex >= COLUMNS.length) return;

    const newStatus = COLUMNS[newIndex].id;

    // Optimistic update
    setIdeas(prev => prev.map(i => i.id === idea.id ? { ...i, status: newStatus } : i));

    try {
      await ideasDb.updateIdeaStatus(idea.id, newStatus);
    } catch (err) {
      console.error('Failed to move idea', err);
      // Revert
      setIdeas(prev => prev.map(i => i.id === idea.id ? { ...i, status: idea.status } : i));
    }
  };

  const handleDelete = async (id: string) => {
     if (!confirm('Delete this idea?')) return;
     setIdeas(prev => prev.filter(i => i.id !== id));
     try {
       await ideasDb.deleteIdea(id);
     } catch (err) {
       console.error('Failed to delete', err);
     }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
       {/* Toolbar */}
       <div className="mb-4 flex justify-between items-center">
         <h2 className="text-xl font-bold">Feature Roadmap</h2>
         <button 
           onClick={() => setIsAdding(true)}
           className="bg-black text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-gray-800"
         >
           <Plus size={16} /> New Idea
         </button>
       </div>

       {isAdding && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setIsAdding(false)}>
           <div className="bg-white p-6 rounded-xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
             <div className="flex items-center justify-between mb-4">
               <h3 className="text-lg font-bold">Add New Feature</h3>
               <button 
                 onClick={() => setIsAdding(false)}
                 className="text-gray-400 hover:text-gray-600"
               >
                 <X size={20} />
               </button>
             </div>
             <form onSubmit={(e) => handleAdd(e, 'backlog')} className="space-y-4">
               <div>
                 <label className="block text-xs font-medium text-gray-700 mb-1">Feature Title *</label>
                 <input 
                   className="w-full border border-gray-200 p-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10" 
                   placeholder="e.g., Add dark mode support" 
                   value={newIdeaTitle}
                   onChange={e => setNewIdeaTitle(e.target.value)}
                   autoFocus
                   required
                 />
               </div>
               <div>
                 <label className="block text-xs font-medium text-gray-700 mb-1">Description (optional)</label>
                 <textarea 
                   className="w-full border border-gray-200 p-2.5 rounded-lg h-24 focus:outline-none focus:ring-2 focus:ring-black/10 resize-none" 
                   placeholder="Describe the feature in detail..." 
                   value={newIdeaDesc}
                   onChange={e => setNewIdeaDesc(e.target.value)}
                 />
               </div>
               {error && (
                 <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
                   {error}
                 </div>
               )}
               <div className="flex justify-end gap-2 pt-2">
                 <button 
                   type="button" 
                   onClick={() => {
                     setIsAdding(false);
                     setNewIdeaTitle('');
                     setNewIdeaDesc('');
                     setError(null);
                   }} 
                   className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                 >
                   Cancel
                 </button>
                 <button 
                   type="submit" 
                   className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
                 >
                   Add Feature
                 </button>
               </div>
             </form>
           </div>
         </div>
       )}

       {/* Error Display */}
       {error && (
         <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
           {error}
         </div>
       )}

       {/* Board */}
       <div className="flex-1 overflow-x-auto">
         <div className="flex gap-4 h-full min-w-[800px]">
           {COLUMNS.map((col, colIdx) => (
             <div key={col.id} className="flex-1 bg-gray-50 rounded-xl flex flex-col max-h-full">
               <div className="p-3 font-bold text-sm text-gray-500 uppercase tracking-wider border-b border-gray-100 flex justify-between">
                 <span>{col.title}</span>
                 <span className="bg-gray-200 text-gray-600 px-2 rounded-full text-xs">
                   {ideas.filter(i => i.status === col.id).length}
                 </span>
               </div>
               <div className="p-2 flex-1 overflow-y-auto space-y-2">
                 {/* Quick Add Button in Backlog Column */}
                 {col.id === 'backlog' && (
                   <button
                     onClick={() => setIsAdding(true)}
                     className="w-full p-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors flex items-center justify-center gap-2 text-sm font-medium mb-2"
                   >
                     <Plus size={16} />
                     Add Feature
                   </button>
                 )}
                 {/* Empty state - only show in backlog when no ideas at all */}
                 {ideas.length === 0 && col.id === 'backlog' && (
                   <div className="text-center py-8 text-gray-400 text-sm">
                     <p className="mb-1">No features yet</p>
                     <p className="text-xs">Click "Add Feature" above to get started</p>
                   </div>
                 )}
                 {/* Show message if this column is empty but other columns have items */}
                 {ideas.length > 0 && ideas.filter(i => i.status === col.id).length === 0 && (
                   <div className="text-center py-4 text-gray-400 text-xs">
                     No items in {col.title.toLowerCase()}
                   </div>
                 )}
                 {ideas.filter(i => i.status === col.id).map(idea => (
                   <div key={idea.id} className="bg-white p-3 rounded-lg shadow-sm border border-gray-100 group relative" draggable={false}>
                      <button 
                        onClick={() => handleDelete(idea.id)}
                        className="absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={14} />
                      </button>
                      <h4 className="font-bold text-sm mb-1" draggable={false}>{idea.title}</h4>
                      {idea.description && <p className="text-xs text-gray-500 line-clamp-3 mb-3" draggable={false}>{idea.description}</p>}
                      
                      <div className="flex justify-between mt-auto pt-2 border-t border-gray-50">
                        {colIdx > 0 ? (
                          <button onClick={() => handleMove(idea, 'prev')} className="text-gray-400 hover:text-black">
                            <ArrowLeft size={16} />
                          </button>
                        ) : <div />}
                        
                        {colIdx < COLUMNS.length - 1 ? (
                          <button onClick={() => handleMove(idea, 'next')} className="text-gray-400 hover:text-black">
                            <ArrowRight size={16} />
                          </button>
                        ) : <div />}
                      </div>
                   </div>
                 ))}
               </div>
             </div>
           ))}
         </div>
       </div>
    </div>
  );
};
