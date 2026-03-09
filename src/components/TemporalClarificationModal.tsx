'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { Calendar, Clock, X } from 'lucide-react';
import { ParsedTemporal } from '@/lib/temporalParser';

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

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'No date';
    return format(new Date(dateStr), 'EEE, MMM d, yyyy');
  };

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const formatInterpretation = (alt: ParsedTemporal) => {
    if (alt.interpretation_type === 'due') return 'Deadline';
    if (alt.interpretation_type === 'scheduled') return 'Scheduled time';
    return 'Interpretation';
  };

  const formatAmbiguitySummary = () => {
    const labels = ambiguous.map((value) => {
      if (value === 'due') return 'deadline';
      if (value === 'scheduled') return 'scheduled time';
      return value;
    });
    return labels.join(' or ');
  };

  return createPortal(
    <div className="fixed inset-0 z-[300] overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="flex min-h-full items-start justify-center p-4 py-8 sm:py-12"
        onClick={onClose}
      >
        <div
          key={`${originalText}:${alternatives.length}`}
          className="w-full max-w-md max-h-[min(88vh,720px)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900 flex flex-col"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-gray-200 p-5 dark:border-gray-700">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Clarify Date/Time</h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Choose whether this should be saved as a {formatAmbiguitySummary()}.
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X size={20} />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Which date/time did you mean?
            </p>

            <div className="space-y-2">
              {alternatives.map((alt, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedIndex(index)}
                  className={`
                    w-full rounded-lg border p-3 text-left transition-colors
                    ${selectedIndex === index
                      ? 'border-black bg-gray-50 dark:border-white dark:bg-gray-800'
                      : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
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
                      <div className="mb-1 flex items-center justify-between gap-2">
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
                        {alt.duration_minutes && <span>{alt.duration_minutes} min</span>}
                        {alt.is_all_day && <span className="text-gray-400">All day</span>}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onConfirm(alternatives[selectedIndex]);
                onClose();
              }}
              className="accent-solid-btn rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
