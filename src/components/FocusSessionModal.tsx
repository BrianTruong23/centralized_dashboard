import React from 'react';
import { FocusTimer } from './FocusTimer';
import { Task } from '@/types/task';
import { X } from 'lucide-react';

interface FocusSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  onComplete: (task: Task) => void;
  showFocusPlant?: boolean;
}

export function FocusSessionModal({ isOpen, onClose, task, onComplete, showFocusPlant = true }: FocusSessionModalProps) {
  if (!isOpen || !task) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl relative">
        <button 
          onClick={onClose}
          className="absolute -top-12 right-0 text-white/60 hover:text-white text-sm px-2 py-1 rounded-md hover:bg-white/10 transition-colors"
        >
          <span className="inline-flex items-center gap-1">
            <X size={16} />
            Close
          </span>
        </button>
        
        <FocusTimer 
          task={task}
          onComplete={onComplete}
          onStop={onClose}
          showFocusPlant={showFocusPlant}
        />
      </div>
    </div>
  );
}
