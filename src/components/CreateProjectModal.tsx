import React, { useState } from 'react';
import { CreateProjectInput } from '@/types/project';
import { X, Check } from 'lucide-react';
import clsx from 'clsx';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddProject: (project: CreateProjectInput) => Promise<void>;
}

const COLORS = [
  '#000000', // Black
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#64748b', // Slate
];

export function CreateProjectModal({ isOpen, onClose, onAddProject }: CreateProjectModalProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#000000');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onAddProject({ name, color });
      onClose();
      setName('');
      setColor('#000000');
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden relative animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">New Project</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 uppercase">Project Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Work, Personal..."
              className="w-full text-base bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400"
              autoFocus
              required
            />
          </div>

          <div className="space-y-2">
             <label className="text-xs font-semibold text-gray-500 uppercase">Color</label>
             <div className="flex flex-wrap gap-3">
               {COLORS.map((c) => (
                 <button
                   key={c}
                   type="button"
                   onClick={() => setColor(c)}
                   className={clsx(
                     "w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center",
                     color === c ? "border-gray-900 dark:border-white scale-110" : "border-transparent hover:scale-110"
                   )}
                   style={{ backgroundColor: c }}
                 >
                   {color === c && <Check size={14} className="text-white mix-blend-difference" />}
                 </button>
               ))}
             </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
               type="button"
               onClick={onClose}
               className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
             >
               Cancel
             </button>
             <button
               type="submit"
               disabled={!name.trim() || isSubmitting}
               className="px-6 py-2 text-sm font-bold bg-black dark:bg-white text-white dark:text-black rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
             >
               {isSubmitting ? 'Creating...' : 'Create Project'}
             </button>
          </div>
        </form>
      </div>
    </div>
  );
}
