'use client';

import { useState } from 'react';
import { ParsedTemporal } from '@/lib/temporalParser';
import { X, Calendar, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface TemporalClarificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selected: ParsedTemporal) => void;
  ambiguous: string[];
  originalText: string;
  alternatives: ParsedTemporal[];
}

export function TemporalClarificationModal({
  isOpen,
  onClose,
  onConfirm,
  ambiguous,
  originalText,
  alternatives,
}: TemporalClarificationModalProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (!isOpen) return null;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'No date';
    return format(new Date(dateStr), 'EEE, MMM d, yyyy');
  };

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const formatInterpretation = (alt: ParsedTemporal) => {
    if (alt.interpretation_type === 'due') return 'Deadline';
    if (alt.interpretation_type === 'scheduled') return 'Scheduled time';
    return 'Interpretation';
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Clarify Date/Time</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Multiple interpretations found for: &quot;{ambiguous.join(', ')}&quot;
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Which date/time did you mean?
          </p>

          {/* Alternatives */}
          <div className="space-y-2">
            {alternatives.map((alt, index) => (
              <button
                key={index}
                onClick={() => setSelectedIndex(index)}
                className={`
                  w-full text-left p-3 rounded-lg border transition-colors
                  ${selectedIndex === index
                    ? 'border-black dark:border-white bg-gray-50 dark:bg-gray-800'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }
                `}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    checked={selectedIndex === index}
                    onChange={() => setSelectedIndex(index)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {alt.cleanedText || originalText}
                      </div>
                      <span className="text-[10px] uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
                        {formatInterpretation(alt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      {alt.due_date && (
                        <span className="flex items-center gap-1">
                          <Calendar size={12} />
                          Due: {formatDate(alt.due_date)}
                        </span>
                      )}
                      {alt.scheduled_date && (
                        <span className="flex items-center gap-1">
                          <Calendar size={12} />
                          {formatDate(alt.scheduled_date)}
                        </span>
                      )}
                      {(alt.start_time || alt.scheduled_time) && (
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {formatTime(alt.start_time || alt.scheduled_time)}
                          {alt.end_time ? ` - ${formatTime(alt.end_time)}` : ''}
                        </span>
                      )}
                      {alt.due_time && !alt.scheduled_time && !alt.start_time && (
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {formatTime(alt.due_time)}
                        </span>
                      )}
                      {alt.duration_minutes && (
                        <span>{alt.duration_minutes} min</span>
                      )}
                      {alt.is_all_day && (
                        <span className="text-gray-400">All day</span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm(alternatives[selectedIndex]);
              onClose();
            }}
            className="px-4 py-2 text-sm font-semibold accent-solid-btn rounded-lg hover:opacity-90 transition-opacity"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
