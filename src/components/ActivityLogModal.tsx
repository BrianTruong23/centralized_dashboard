import { useState, useEffect } from 'react';
import { X, CheckCircle2, PlusCircle, Calendar, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';

interface ActivityLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string; 
}

interface ActivityLog {
    id: string;
    action: string;
    details: any;
    created_at: string;
}

export const ActivityLogModal = ({ isOpen, onClose, userId }: ActivityLogModalProps) => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Loading activity...');

  useEffect(() => {
      if (isOpen && userId) {
          fetchLogs();
      }
  }, [isOpen, userId]);

  const fetchLogs = async () => {
      if (!supabase) return;
      
      // Cache-First Strategy
      const cached = localStorage.getItem('activity_logs_cache');
      let hasCache = false;
      if (cached) {
          try {
              setLogs(JSON.parse(cached));
              hasCache = true;
          } catch (e) {
              console.error('Cache parse error', e);
          }
      }

      if (!hasCache) {
          setLoading(true);
      }

      // Timer for "Hang in there..." message (only relevant if loading is true)
      const messageTimer = setTimeout(() => {
          setLoadingText('Hang in there...');
      }, 3000);
      
      // Safety timeout
      const safetyTimer = setTimeout(() => {
          setLoading(false);
      }, 5000);

      try {
        const { data } = await supabase
            .from('activity_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
        
        if (data) {
            setLogs(data);
            localStorage.setItem('activity_logs_cache', JSON.stringify(data));
        }
      } catch (error) {
        console.error('Error fetching logs:', error);
      } finally {
        clearTimeout(messageTimer);
        clearTimeout(safetyTimer);
        setLoading(false);
        setLoadingText('Loading activity...');
      }
  };


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative animate-in zoom-in-95 duration-200 max-h-[80vh] flex flex-col">
        
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Activity Log</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
              <div className="text-center py-8 text-gray-400">{loadingText}</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              No activity recorded yet.
            </div>
          ) : (
            <div className="relative border-l border-gray-100 dark:border-gray-800 ml-2 space-y-6 pl-6 pb-2">
              {logs.map(log => {
                  let icon = PlusCircle;
                  let color = "text-blue-500";
                  let message = "Unknown activity";

                  if (log.action === 'created_task') {
                      icon = PlusCircle;
                      color = "text-blue-500";
                      message = `Created task "${log.details?.title || 'Untitled'}"`;
                  } else if (log.action === 'completed_task') {
                      icon = CheckCircle2;
                      color = "text-green-500";
                      message = `Completed task "${log.details?.title || 'Untitled'}"`;
                  } else if (log.action === 'deleted_task') {
                      icon = Trash2;
                      color = "text-red-500";
                      message = `Deleted task "${log.details?.title || 'Untitled'}"`;
                  }

                  const Icon = icon;

                  return (
                    <div key={log.id} className="relative">
                        <span 
                        className={`absolute -left-[31px] bg-white dark:bg-gray-900 ring-4 ring-white dark:ring-gray-900 rounded-full ${color}`}
                        >
                        <Icon size={14} />
                        </span>
                        <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {message}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                            {format(new Date(log.created_at), 'MMM d, yyyy • h:mm a')}
                        </p>
                        </div>
                    </div>
                  );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
