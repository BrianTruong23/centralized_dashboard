
import { useState, useEffect, useRef } from 'react';
import { Task } from '@/types/task';
import { Play, Pause, Square, CheckCircle } from 'lucide-react';
import { getPlantStage } from '@/lib/focusPlant';

interface FocusTimerProps {
  task: Task;
  onComplete: (task: Task) => void;
  onStop: () => void;
  showFocusPlant?: boolean;
}

function FocusPlant({ elapsedSeconds }: { elapsedSeconds: number }) {
  const stage = getPlantStage(elapsedSeconds);
  const stemHeight = [4, 10, 16, 22, 24][stage];
  const leafScale = [0.4, 0.6, 0.8, 1, 1][stage];
  const bloomScale = stage >= 4 ? 1 : 0;

  return (
    <div
      className="absolute bottom-4 right-4 opacity-70 pointer-events-none"
      aria-hidden="true"
      title="Focus growth"
    >
      <div className="w-10 h-10 sm:w-11 sm:h-11 relative">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-1.5 rounded-full bg-emerald-500/30" />
        <div
          className="absolute bottom-1 left-1/2 -translate-x-1/2 w-0.5 bg-emerald-300/80 rounded-full transition-all duration-500"
          style={{ height: `${stemHeight}px` }}
        />
        <div
          className="absolute bottom-2 left-[43%] w-2 h-1 rounded-full bg-emerald-300/70 transition-all duration-500"
          style={{ transform: `rotate(-25deg) scale(${leafScale})` }}
        />
        <div
          className="absolute bottom-3 right-[40%] w-2 h-1 rounded-full bg-emerald-300/70 transition-all duration-500"
          style={{ transform: `rotate(25deg) scale(${leafScale})` }}
        />
        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-6 w-2 h-2 rounded-full bg-amber-200/80 transition-all duration-500"
          style={{ transform: `scale(${bloomScale})` }}
        />
      </div>
    </div>
  );
}

export const FocusTimer = ({ task, onComplete, onStop, showFocusPlant = true }: FocusTimerProps) => {
  const [isActive, setIsActive] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isActive) {
      intervalRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive]);

  // Reset timer when task changes
  useEffect(() => {
    setIsActive(true);
    setElapsedSeconds(0);
  }, [task.id]);

  const formatTime = (seconds: number) => {
    const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
    const ss = (seconds % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const handleComplete = () => {
    setIsActive(false);
    onComplete(task);
  };

  return (
    <div className="bg-black text-white p-6 rounded-2xl shadow-lg relative overflow-hidden flex flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-300">
      <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
        <Play size={150} />
      </div>
      
      <div className="relative z-10 w-full">
        <div className="mb-2 text-gray-400 text-xs uppercase tracking-widest font-bold">Focusing On</div>
        <h3 className="text-xl font-bold mb-6 line-clamp-1">{task.title}</h3>
        
        <div className="text-7xl font-mono font-bold mb-8 tracking-tighter tabular-nums">
          {formatTime(elapsedSeconds)}
        </div>

        <div className="flex items-center justify-center gap-4">
          {!isActive ? (
            <button
              onClick={() => setIsActive(true)}
              className="bg-white text-black rounded-full p-4 hover:bg-gray-100 transition-transform active:scale-95"
            >
              <Play fill="currentColor" size={24} />
            </button>
          ) : (
            <button
              onClick={() => setIsActive(false)}
              className="bg-gray-800 text-white rounded-full p-4 hover:bg-gray-700 transition-transform active:scale-95 border border-gray-700"
            >
              <Pause fill="currentColor" size={24} />
            </button>
          )}

          <button
            onClick={handleComplete}
            className="group flex items-center gap-2 bg-green-500/20 text-green-400 px-6 py-4 rounded-full font-bold hover:bg-green-500/30 transition-all border border-green-500/50"
          >
            <CheckCircle size={20} />
            <span>Done</span>
          </button>
          
          <button
            onClick={onStop}
             className="bg-gray-900 text-gray-400 rounded-full p-4 hover:text-white hover:bg-gray-800 transition-transform active:scale-95 border border-gray-800"
          >
            <Square fill="currentColor" size={20} />
          </button>
        </div>
      </div>
      {showFocusPlant && <FocusPlant elapsedSeconds={elapsedSeconds} />}
    </div>
  );
};
