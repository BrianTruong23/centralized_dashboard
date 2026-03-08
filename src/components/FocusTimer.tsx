
import { useState, useEffect, useRef } from 'react';
import { Task } from '@/types/task';
import { Play, Pause, Check } from 'lucide-react';
import { getPlantStage } from '@/lib/focusPlant';

interface FocusTimerProps {
  task: Task;
  onComplete: (task: Task) => void;
  onStop: () => void;
  showFocusPlant?: boolean;
  autoStart?: boolean;
}

function FocusPlant({ elapsedSeconds }: { elapsedSeconds: number }) {
  const stage = getPlantStage(elapsedSeconds);
  const progress = Math.min(elapsedSeconds / (45 * 60), 1);
  const stemHeight = 12 + Math.round(42 * progress);
  const leafScale = 0.78 + (0.72 * progress);
  const bloomScale = stage >= 4 ? 1 : 0;
  const bloomOpacity = stage >= 4 ? 1 : 0;

  return (
    <div
      className="absolute bottom-4 right-4 sm:bottom-5 sm:right-5 opacity-95 pointer-events-none"
      aria-hidden="true"
      title="Focus growth"
    >
      <div className="w-24 h-24 sm:w-28 sm:h-28 relative">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-3 rounded-full bg-emerald-500/20" />
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-14 h-7 rounded-[999px_999px_14px_14px] bg-[#f6a96b] border border-[#e08f51]" />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-9 h-2 rounded-full bg-[#e08f51]/35" />

        {/* cute eyes on the pot */}
        <div className="absolute bottom-[22px] left-[44%] w-1 h-1 rounded-full bg-[#7a4b31]" />
        <div className="absolute bottom-[22px] right-[44%] w-1 h-1 rounded-full bg-[#7a4b31]" />
        <div className="absolute bottom-[19px] left-1/2 -translate-x-1/2 w-2.5 h-1 border-b border-[#7a4b31] rounded-full" />

        <div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 w-1.5 bg-emerald-400 rounded-full transition-all duration-500"
          style={{ height: `${stemHeight}px` }}
        />
        <div
          className="absolute bottom-12 left-[34%] w-6 h-3 rounded-full bg-emerald-300 transition-all duration-500"
          style={{ transform: `rotate(-28deg) scale(${leafScale})` }}
        />
        <div
          className="absolute bottom-14 right-[30%] w-6 h-3 rounded-full bg-emerald-300 transition-all duration-500"
          style={{ transform: `rotate(26deg) scale(${leafScale})` }}
        />
        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-[66px] w-6 h-6 rounded-full bg-[#ffd26e] border border-[#f0b93f] transition-all duration-500"
          style={{ transform: `scale(${bloomScale})`, opacity: bloomOpacity }}
        />
        {/* flower face */}
        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-[71px] w-1 h-1 rounded-full bg-[#7a4b31] transition-all duration-500"
          style={{ opacity: bloomOpacity }}
        />
        <div
          className="absolute left-[47%] bottom-[68px] w-2 h-1 border-b border-[#7a4b31] rounded-full transition-all duration-500"
          style={{ opacity: bloomOpacity }}
        />
      </div>
    </div>
  );
}

export const FocusTimer = ({ task, onComplete, onStop, showFocusPlant = true, autoStart = false }: FocusTimerProps) => {
  const [sessionState, setSessionState] = useState<'idle' | 'running' | 'paused'>(autoStart ? 'running' : 'idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (sessionState === 'running') {
      intervalRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sessionState]);

  const formatTime = (seconds: number) => {
    const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
    const ss = (seconds % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const handleComplete = () => {
    setSessionState('paused');
    onComplete(task);
  };

  const primaryActionLabel =
    sessionState === 'idle' ? 'Start Focus' : sessionState === 'running' ? 'Pause' : 'Resume';

  const handlePrimaryAction = () => {
    if (sessionState === 'idle') {
      setSessionState('running');
      return;
    }
    if (sessionState === 'running') {
      setSessionState('paused');
      return;
    }
    setSessionState('running');
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-8 rounded-2xl shadow-lg relative overflow-hidden animate-in fade-in zoom-in-95 duration-300">
      <div className="relative z-10 w-full">
        <div className="mb-2 text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-widest font-semibold">Focus Now</div>
        <h3 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2 leading-tight">{task.title}</h3>
        <div className="flex items-center gap-2 mb-8">
          {task.estimatedMinutes && (
            <span className="text-xs px-2 py-1 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">
              {task.estimatedMinutes} min
            </span>
          )}
          {sessionState !== 'idle' && (
            <span className="text-xs px-2 py-1 rounded-full border border-[var(--accent-border)] text-[var(--accent-soft-foreground)] bg-[var(--accent-soft)]">
              {sessionState === 'running' ? 'In session' : 'Paused'}
            </span>
          )}
        </div>

        <div className="text-8xl font-mono font-semibold text-gray-900 dark:text-gray-100 mb-10 tracking-tight tabular-nums text-center">
          {formatTime(elapsedSeconds)}
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handlePrimaryAction}
            className="w-full max-w-sm h-12 inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold accent-solid-btn hover:opacity-95 transition-opacity"
          >
            {sessionState === 'running' ? <Pause size={16} /> : <Play size={16} />}
            {primaryActionLabel}
          </button>

          <div className="flex items-center justify-center gap-2 w-full">
            <button
              onClick={handleComplete}
              className="h-10 px-4 inline-flex items-center gap-1.5 rounded-full text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <Check size={14} />
              Complete Task
            </button>
            <button
              onClick={onStop}
              className="h-10 px-4 rounded-full text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              End Session
            </button>
          </div>
        </div>
      </div>
      {showFocusPlant && sessionState !== 'idle' && <FocusPlant elapsedSeconds={elapsedSeconds} />}
    </div>
  );
};
