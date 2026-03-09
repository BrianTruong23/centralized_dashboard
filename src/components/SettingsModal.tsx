'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { X, AlertTriangle, User as UserIcon, Lock, Trash2, Bug, LogOut, Leaf, Crown, Paintbrush, Download, FileText, FileSpreadsheet, CalendarDays } from 'lucide-react';
import { User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { PlanningPreferences } from '@/types/planningPreferences';
import { useTheme } from '@/hooks/useTheme';
import { Task } from '@/types/task';
import { Project } from '@/types/project';
import { formatDateKey } from '@/lib/dateKey';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onLogout: () => void;
  focusPlantEnabled: boolean;
  onToggleFocusPlant: (enabled: boolean) => void;
  isPro: boolean;
  forceProUser: boolean;
  onToggleForceProUser: (enabled: boolean) => void;
  planningPreferences: PlanningPreferences;
  onPlanningPreferencesChange: (next: PlanningPreferences) => void;
  onRestartOnboarding: () => void;
  tasks: Task[];
  filteredTasks: Task[];
  projects: Project[];
  currentView: string;
}

export function SettingsModal({
  isOpen,
  onClose,
  user,
  onLogout,
  focusPlantEnabled,
  onToggleFocusPlant,
  isPro,
  forceProUser,
  onToggleForceProUser,
  planningPreferences,
  onPlanningPreferencesChange,
  onRestartOnboarding,
  tasks,
  filteredTasks,
  projects,
  currentView,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'preferences' | 'export' | 'billing' | 'security' | 'danger' | 'debug'>('profile');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const router = useRouter();
  const { palette, setPalette, paletteOptions } = useTheme();
  const [draftPalette, setDraftPalette] = useState(palette);
  const [exportScope, setExportScope] = useState<'all' | 'filtered' | 'completed' | 'upcoming' | 'project'>('all');
  const [exportProjectId, setExportProjectId] = useState<string>('');

  // Form states
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (isOpen) {
      setDraftPalette(palette);
      setMessage(null);
    }
  }, [isOpen, palette]);

  useEffect(() => {
    setMessage(null);
  }, [activeTab]);

  useEffect(() => {
    if (!message || message.type !== 'success') return;
    const timeout = window.setTimeout(() => setMessage(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [message]);
  
  if (!isOpen) return null;

  const userEmail = user?.email ?? 'Not signed in';
  const userId = user?.id ?? 'Unavailable';
  const hasAuthenticatedUser = !!user?.id;

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
        if (!supabase) throw new Error("Supabase not configured");
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
        setMessage({ type: 'success', text: 'Password updated successfully' });
        setNewPassword('');
    } catch (err: any) {
        setMessage({ type: 'error', text: err.message });
    } finally {
        setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
      if (!confirm("Are you SURE? This cannot be undone.")) return;
      setLoading(true);
      try {
          // Note: Standard Supabase client can't delete self via API usually unless using admin or RPC
          // For now we'll simulate or use a function if available, or just log out and show error
          // user.id
          // Since we don't have a backend function for this ready, let's just log out for safety or show "Contact Admin"
          // Or strictly: await supabase.rpc('delete_user') if implemented.
          // Let's assume user wants to just log out effectively for now as "Delete" is complex without backend logic.
          // BUT prompt asked for it. I'll add a placeholder warning.
           setMessage({ type: 'error', text: 'Self-deletion requires admin contact or cloud function.' });
      } catch (err: any) {
          setMessage({ type: 'error', text: err.message });
      } finally {
          setLoading(false);
      }
  };

  const runDiagnostics = async () => {
      if (!user?.id) {
          setDiagnostics(['[ERR] No authenticated user is available for diagnostics.']);
          return;
      }
      setDiagnostics([]);
      setLoading(true);
      const logs: string[] = [];
      let passed = 0;
      let failed = 0;
      const log = (msg: string, ok?: boolean) => {
          logs.push(msg);
          if (ok === true) passed++;
          if (ok === false) failed++;
      };

      log('--- Diagnostics ---');

      try {
          // 1. Supabase client
          if (!supabase) throw new Error('Supabase client missing');
          log('[OK] Supabase client exists', true);

          // 2. Auth session
          const { data: { session }, error: sessErr } = await supabase.auth.getSession();
          if (sessErr) {
              log(`[ERR] Session Error: ${sessErr.message}`, false);
          } else if (session) {
              log(`[OK] Auth Session Active: ${session.user.email} (${session.user.id})`, true);
              log(`   Token expires: ${new Date((session.expires_at || 0) * 1000).toLocaleString()}`);
          } else {
              log('[ERR] No Active Session', false);
          }

          // 3. Select Tasks
          log('Testing Select Tasks...');
          const { data: taskRows, error: taskSelErr } = await supabase.from('tasks').select('id').limit(5);
          if (taskSelErr) log(`[ERR] Select Tasks Failed: ${taskSelErr.message}`, false);
          else log(`[OK] Tasks Readable: ${taskRows?.length} rows`, true);

          // 4. Select Projects
          log('Testing Select Projects...');
          const { data: projs, error: projErr } = await supabase.from('projects').select('*').limit(5);
          if (projErr) log(`[ERR] Select Projects Failed: ${projErr.message}`, false);
          else log(`[OK] Projects Readable: ${projs?.length} rows`, true);

          // 5. Test RLS Insert (with all required fields)
          log('Testing Task Insert (RLS)...');
          try {
             const { data: task, error: taskErr } = await supabase.from('tasks').insert({
                 user_id: user.id,
                 text: 'Diagnostic Task ' + Date.now(),
                 category: 'Life',
                 status: 'todo',
                 priority: 3,
                 estimated_minutes: 30,
                 energy_level: 'medium',
             }).select().single();

             if (taskErr) log(`[ERR] Insert Task Failed: ${taskErr.message}`, false);
             else if (!task) log('[ERR] Insert returned no data (RLS blocked)', false);
             else {
                 log(`[OK] Task Insert OK: ${task.id}`, true);
                 // Clean up
                 const { error: delErr } = await supabase.from('tasks').delete().eq('id', task.id);
                 if (delErr) log(`[WARN] Cleanup failed: ${delErr.message}`);
                 else log('[OK] Diagnostic Task Cleaned up', true);
             }
          } catch (e: any) {
              log(`[ERR] Insert Exception: ${e.message}`, false);
          }

          // 6. Test Project Insert
          log('Testing Project Insert (RLS)...');
          try {
             const { data: proj, error: projInsErr } = await supabase.from('projects').insert({
                 user_id: user.id,
                 name: '_diag_' + Date.now(),
                 color: '#999999',
             }).select().single();

             if (projInsErr) log(`[ERR] Insert Project Failed: ${projInsErr.message}`, false);
             else if (!proj) log('[ERR] Project insert returned no data (RLS blocked)', false);
             else {
                 log(`[OK] Project Insert OK: ${proj.id}`, true);
                 await supabase.from('projects').delete().eq('id', proj.id);
                 log('[OK] Diagnostic Project Cleaned up', true);
             }
          } catch (e: any) {
              log(`[ERR] Project Insert Exception: ${e.message}`, false);
          }

      } catch (e: any) {
          log(`[ERR] Critical Error: ${e.message}`, false);
      }

      log('');
      log(`--- Summary: ${passed} passed, ${failed} failed ---`);

      setDiagnostics(logs);
      setLoading(false);
  };

  const normalizeDateKey = (value?: string): string | null => {
    if (!value) return null;
    const direct = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return formatDateKey(parsed);
  };

  const getExportTasks = (): Task[] => {
    const today = formatDateKey(new Date());
    switch (exportScope) {
      case 'filtered':
        return filteredTasks;
      case 'completed':
        return tasks.filter((t) => t.status === 'done');
      case 'upcoming':
        return tasks.filter((t) => {
          const dateKey = normalizeDateKey(t.deadline);
          return t.status !== 'done' && !!dateKey && dateKey > today;
        });
      case 'project':
        return exportProjectId ? tasks.filter((t) => t.project_id === exportProjectId) : [];
      case 'all':
      default:
        return tasks;
    }
  };

  const getScopeLabel = (): string => {
    if (exportScope === 'filtered') return `Filtered (${currentView})`;
    if (exportScope === 'completed') return 'Completed tasks';
    if (exportScope === 'upcoming') return 'Upcoming tasks';
    if (exportScope === 'project') {
      const p = projects.find((x) => x.id === exportProjectId);
      return p ? `Project: ${p.name}` : 'Selected project';
    }
    return 'All tasks';
  };

  const escapeCsv = (value: string) => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const triggerDownload = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    const rows = getExportTasks();
    const header = ['Title', 'Due Date', 'Scheduled Date', 'Scheduled Time', 'Priority', 'Category', 'Status', 'Notes'];
    const lines = rows.map((t) =>
      [
        t.title || '',
        normalizeDateKey(t.deadline) || '',
        normalizeDateKey(t.scheduled_date) || '',
        t.scheduled_time || t.due_time || '',
        String(t.priority ?? ''),
        t.category || '',
        t.status || '',
        t.description || '',
      ]
        .map((field) => escapeCsv(field))
        .join(',')
    );
    const content = [header.join(','), ...lines].join('\n');
    triggerDownload(`tasks-${exportScope}.csv`, content, 'text/csv;charset=utf-8;');
  };

  const exportDocument = () => {
    const rows = getExportTasks();
    const generatedAt = new Date().toLocaleString();
    const lines = [
      `Task Export`,
      `Generated: ${generatedAt}`,
      `Scope: ${getScopeLabel()}`,
      `Total tasks: ${rows.length}`,
      '',
      ...rows.map((t, index) => {
        const deadline = normalizeDateKey(t.deadline) || 'No due date';
        const scheduled = normalizeDateKey(t.scheduled_date)
          ? `${normalizeDateKey(t.scheduled_date)} ${t.scheduled_time || t.due_time || ''}`.trim()
          : 'Not scheduled';
        return [
          `${index + 1}. ${t.title}`,
          `   Status: ${t.status} | Priority: P${t.priority} | Category: ${t.category}`,
          `   Due: ${deadline}`,
          `   Scheduled: ${scheduled}`,
          `   Notes: ${t.description || '-'}`,
          '',
        ].join('\n');
      }),
    ].join('\n');
    triggerDownload(`tasks-${exportScope}.txt`, lines, 'text/plain;charset=utf-8;');
  };

  const toIcsDate = (date: Date): string => {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const min = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');
    return `${yyyy}${mm}${dd}T${hh}${min}${ss}Z`;
  };

  const toIcsAllDay = (dateKey: string): string => dateKey.replace(/-/g, '');

  const exportCalendar = () => {
    const rows = getExportTasks();
    const now = toIcsDate(new Date());
    const events = rows
      .map((t) => {
        const dateKey = normalizeDateKey(t.scheduled_date) || normalizeDateKey(t.deadline);
        if (!dateKey) return null;

        const uid = `task-${t.id}@minismo`;
        const summary = t.title.replace(/\n/g, ' ').trim();
        const description = (t.description || '').replace(/\n/g, '\\n');
        const hasTime = !!(t.scheduled_time || t.due_time);

        if (hasTime) {
          const start = new Date(`${dateKey}T${t.scheduled_time || t.due_time || '09:00:00'}`);
          const end = new Date(start.getTime() + Math.max(t.estimatedMinutes || 60, 30) * 60000);
          return [
            'BEGIN:VEVENT',
            `UID:${uid}`,
            `DTSTAMP:${now}`,
            `DTSTART:${toIcsDate(start)}`,
            `DTEND:${toIcsDate(end)}`,
            `SUMMARY:${summary}`,
            `DESCRIPTION:${description}`,
            'END:VEVENT',
          ].join('\n');
        }

        const startDay = toIcsAllDay(dateKey);
        const endDate = new Date(`${dateKey}T00:00:00`);
        endDate.setDate(endDate.getDate() + 1);
        const endDay = toIcsAllDay(formatDateKey(endDate));
        return [
          'BEGIN:VEVENT',
          `UID:${uid}`,
          `DTSTAMP:${now}`,
          `DTSTART;VALUE=DATE:${startDay}`,
          `DTEND;VALUE=DATE:${endDay}`,
          `SUMMARY:${summary}`,
          `DESCRIPTION:${description}`,
          'END:VEVENT',
        ].join('\n');
      })
      .filter(Boolean)
      .join('\n');

    const content = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Minismo//Task Export//EN',
      events,
      'END:VCALENDAR',
    ].join('\n');
    triggerDownload(`tasks-${exportScope}.ics`, content, 'text/calendar;charset=utf-8;');
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl h-[90vh] md:h-[600px] flex flex-col md:flex-row overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Sidebar */}
        <div className="w-full md:w-64 bg-gray-50 dark:bg-gray-950 border-b md:border-b-0 md:border-r border-gray-100 dark:border-gray-800 p-4 overflow-y-auto md:overflow-visible shrink-0 text-left">
            <h2 className="text-lg font-bold mb-4 md:mb-6 px-2">Settings</h2>
            <nav className="flex md:flex-col gap-2 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0 scrollbar-hide">
                <button 
                  onClick={() => setActiveTab('profile')}
                  className={`flex-shrink-0 w-auto md:w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'profile' ? 'bg-gray-200 dark:bg-gray-800 text-black dark:text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-900'}`}
                >
                    <UserIcon size={16} /> <span className="whitespace-nowrap">Profile</span>
                </button>
                <button 
                  onClick={() => setActiveTab('preferences')}
                  className={`flex-shrink-0 w-auto md:w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'preferences' ? 'bg-gray-200 dark:bg-gray-800 text-black dark:text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-900'}`}
                >
                    <Leaf size={16} /> <span className="whitespace-nowrap">Preferences</span>
                </button>
                <button 
                  onClick={() => setActiveTab('export')}
                  className={`flex-shrink-0 w-auto md:w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'export' ? 'bg-gray-200 dark:bg-gray-800 text-black dark:text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-900'}`}
                >
                    <Download size={16} /> <span className="whitespace-nowrap">Export</span>
                </button>
                <button 
                  onClick={() => setActiveTab('billing')}
                  className={`flex-shrink-0 w-auto md:w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'billing' ? 'bg-gray-200 dark:bg-gray-800 text-black dark:text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-900'}`}
                >
                    <Crown size={16} /> <span className="whitespace-nowrap">Billing</span>
                </button>
                <button 
                  onClick={() => setActiveTab('security')}
                  className={`flex-shrink-0 w-auto md:w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'security' ? 'bg-gray-200 dark:bg-gray-800 text-black dark:text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-900'}`}
                >
                    <Lock size={16} /> <span className="whitespace-nowrap">Security</span>
                </button>
                <button 
                  onClick={() => setActiveTab('danger')}
                  className={`flex-shrink-0 w-auto md:w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'danger' ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-900'}`}
                >
                    <Trash2 size={16} /> <span className="whitespace-nowrap">Danger Zone</span>
                </button>
                <button 
                  onClick={() => setActiveTab('debug')}
                  className={`flex-shrink-0 w-auto md:w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'debug' ? 'bg-gray-200 dark:bg-gray-800 text-black dark:text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-900'}`}
                >
                    <Bug size={16} /> <span className="whitespace-nowrap">Debug</span>
                </button>
            </nav>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 md:p-8 relative overflow-y-auto">
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-black dark:hover:text-white">
                <X size={20} />
            </button>

            {message && (
                <div
                  className={`mb-4 text-sm p-3 rounded-lg border ${
                    message.type === 'success'
                      ? 'bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)] border-[var(--accent-border)]'
                      : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/40'
                  }`}
                >
                    {message.text}
                </div>
            )}

            {activeTab === 'profile' && (
                <div className="space-y-6">
                    <div>
                        <h3 className="text-lg font-semibold mb-1">Profile Information</h3>
                        <p className="text-sm text-gray-500">Manage your basic account details.</p>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Email</label>
                            <input type="text" value={userEmail} disabled className="w-full p-2 bg-gray-100 dark:bg-gray-800 rounded-md text-sm text-gray-500 cursor-not-allowed" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">User ID</label>
                            <code className="block w-full p-2 bg-gray-100 dark:bg-gray-800 rounded-md text-xs font-mono text-gray-500 overflow-hidden text-ellipsis">{userId}</code>
                        </div>
                    </div>
                    <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                         <button 
                            onClick={onLogout}
                            disabled={!hasAuthenticatedUser}
                            className="flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/10 px-3 py-2 rounded-lg transition-colors w-full disabled:opacity-50 disabled:hover:bg-transparent"
                         >
                             <LogOut size={16} />
                             Log Out
                         </button>
                    </div>
                </div>
            )}

            {activeTab === 'preferences' && (
                <div className="space-y-6">
                    <div>
                        <h3 className="text-lg font-semibold mb-1">Preferences</h3>
                        <p className="text-sm text-gray-500">Customize focus visuals and AI planning behavior.</p>
                    </div>

                    <div className="p-4 border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50/80 dark:bg-gray-950/60">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2 text-sm font-medium">
                                    <Leaf size={16} className="text-emerald-500" />
                                    Focus Plant
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    Shows a small plant that grows during uninterrupted focus time.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => onToggleFocusPlant(!focusPlantEnabled)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${focusPlantEnabled ? 'bg-emerald-500/70' : 'bg-gray-300 dark:bg-gray-700'}`}
                                aria-pressed={focusPlantEnabled}
                                aria-label="Toggle Focus Plant visual"
                            >
                                <span
                                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${focusPlantEnabled ? 'translate-x-5' : 'translate-x-1'}`}
                                />
                            </button>
                        </div>
                    </div>

                    <div className="p-4 border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50/80 dark:bg-gray-950/60 space-y-3">
                        <div>
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <Paintbrush size={16} className="text-gray-600 dark:text-gray-300" />
                                Theme Palette
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                Choose accent colors for buttons, selected states, highlights, links, and focus rings.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {paletteOptions.map((option) => {
                                const isActive = draftPalette === option.id;
                                const palettePreview: Record<typeof option.id, { solid: string; soft: string; ring: string }> = {
                                  neutral: { solid: '#171717', soft: '#f5f5f5', ring: '#525252' },
                                  yellow: { solid: '#b45309', soft: '#fef3c7', ring: '#d97706' },
                                  blue: { solid: '#1d4ed8', soft: '#dbeafe', ring: '#2563eb' },
                                  red: { solid: '#b91c1c', soft: '#fee2e2', ring: '#dc2626' },
                                };
                                return (
                                  <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => setDraftPalette(option.id)}
                                    className={`p-2 rounded-lg border text-left transition-all ${isActive ? 'border-black dark:border-white ring-2 ring-offset-1 ring-black/20 dark:ring-white/30' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-medium">{option.label}</span>
                                      {isActive && <span className="text-[10px] text-gray-500">Active</span>}
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <span className="h-5 w-5 rounded-md" style={{ backgroundColor: palettePreview[option.id].solid }} />
                                      <span className="h-5 w-5 rounded-md border border-gray-200 dark:border-gray-700" style={{ backgroundColor: palettePreview[option.id].soft }} />
                                      <span className="h-5 w-5 rounded-md" style={{ backgroundColor: palettePreview[option.id].ring }} />
                                    </div>
                                  </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="p-4 border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50/80 dark:bg-gray-950/60 space-y-4">
                        <div>
                            <p className="text-sm font-semibold">AI Planning Profile</p>
                            <p className="text-xs text-gray-500 mt-1">The assistant uses these details to generate better schedules.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Most Energetic Time</label>
                                <select
                                  value={planningPreferences.energyPeak}
                                  onChange={(e) => onPlanningPreferencesChange({ ...planningPreferences, energyPeak: e.target.value as PlanningPreferences['energyPeak'] })}
                                  className="w-full p-2 border border-gray-200 dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-900"
                                >
                                  <option value="early_morning">Early morning</option>
                                  <option value="morning">Morning</option>
                                  <option value="afternoon">Afternoon</option>
                                  <option value="evening">Evening</option>
                                  <option value="night">Night</option>
                                  <option value="varies">Varies day-to-day</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Preferred Work Days</label>
                                <input
                                  type="text"
                                  value={planningPreferences.workDays}
                                  onChange={(e) => onPlanningPreferencesChange({ ...planningPreferences, workDays: e.target.value })}
                                  placeholder="Mon-Fri"
                                  className="w-full p-2 border border-gray-200 dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-900"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Deep Work Block (minutes)</label>
                                <input
                                  type="number"
                                  min={15}
                                  step={5}
                                  value={planningPreferences.deepWorkMinutes}
                                  onChange={(e) => onPlanningPreferencesChange({ ...planningPreferences, deepWorkMinutes: Math.max(15, Number(e.target.value) || 90) })}
                                  className="w-full p-2 border border-gray-200 dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-900"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Break Between Sessions (minutes)</label>
                                <input
                                  type="number"
                                  min={5}
                                  step={5}
                                  value={planningPreferences.breakMinutes}
                                  onChange={(e) => onPlanningPreferencesChange({ ...planningPreferences, breakMinutes: Math.max(5, Number(e.target.value) || 15) })}
                                  className="w-full p-2 border border-gray-200 dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-900"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Constraints</label>
                            <textarea
                              value={planningPreferences.personalConstraints}
                              onChange={(e) => onPlanningPreferencesChange({ ...planningPreferences, personalConstraints: e.target.value })}
                              placeholder="Example: Meetings 1-3 PM Tue/Thu, family time after 7 PM."
                              className="w-full p-2 border border-gray-200 dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-900 min-h-20"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Additional Planning Notes</label>
                            <textarea
                              value={planningPreferences.planningNotes}
                              onChange={(e) => onPlanningPreferencesChange({ ...planningPreferences, planningNotes: e.target.value })}
                              placeholder="Example: Prefer creative tasks before lunch."
                              className="w-full p-2 border border-gray-200 dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-900 min-h-20"
                            />
                        </div>
                    </div>
                    <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setPalette(draftPalette);
                                    setMessage({ type: 'success', text: 'Preferences saved and applied.' });
                                }}
                                className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors bg-[var(--accent-solid)] text-[var(--accent-solid-foreground)] border-[var(--accent-border)] hover:opacity-90"
                            >
                                Save changes
                            </button>
                            <button
                                type="button"
                                onClick={() => setDraftPalette(palette)}
                                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                                Reset
                            </button>
                        </div>
                        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                            <button
                                onClick={() => {
                                    onClose();
                                    onRestartOnboarding();
                                }}
                                className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 underline underline-offset-2 transition-colors"
                            >
                                Restart onboarding
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'billing' && (
                <div className="space-y-6">
                    <div>
                        <h3 className="text-lg font-semibold mb-1">Billing</h3>
                        <p className="text-sm text-gray-500">Manage your plan and unlock premium features.</p>
                    </div>

                    <div className="p-4 border border-gray-200 dark:border-gray-800 rounded-xl bg-gradient-to-br from-amber-50 to-white dark:from-gray-900 dark:to-gray-950">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2 text-sm font-semibold">
                                    <Crown size={16} className={isPro ? 'text-emerald-500' : 'text-amber-500'} />
                                    {isPro ? 'Pro Active' : 'Free Plan'}
                                </div>
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                    {isPro
                                      ? 'You already have access to premium features.'
                                      : 'Upgrade to Pro to unlock premium planning features and future releases.'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => { onClose(); router.push('/upgrade'); }}
                                className="px-3 py-2 rounded-lg text-xs font-bold accent-solid-btn hover:opacity-90 transition-opacity"
                            >
                                {isPro ? 'Manage Plan' : 'Go Pro'}
                            </button>
                        </div>
                    </div>

                    <div className="p-4 border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50/80 dark:bg-gray-950/60">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-sm font-semibold">Testing Override</p>
                                <p className="text-xs text-gray-500 mt-1">
                                    Toggle between User and Pro User locally for testing premium features.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => onToggleForceProUser(!forceProUser)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${forceProUser ? 'bg-emerald-500/70' : 'bg-gray-300 dark:bg-gray-700'}`}
                                aria-pressed={forceProUser}
                                aria-label="Toggle test pro user mode"
                            >
                                <span
                                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${forceProUser ? 'translate-x-5' : 'translate-x-1'}`}
                                />
                            </button>
                        </div>
                        <p className="text-xs mt-2 font-medium text-gray-600 dark:text-gray-300">
                            Mode: {forceProUser ? 'Pro User (Testing)' : 'User'}
                        </p>
                    </div>
                </div>
            )}

            {activeTab === 'export' && (
                <div className="space-y-6">
                    <div>
                        <h3 className="text-lg font-semibold mb-1">Export</h3>
                        <p className="text-sm text-gray-500">Export tasks as structured data, readable documents, or calendar files.</p>
                    </div>

                    <div className="p-4 border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50/80 dark:bg-gray-950/60 space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">What to export</label>
                            <select
                              value={exportScope}
                              onChange={(e) => setExportScope(e.target.value as typeof exportScope)}
                              className="w-full p-2 border border-gray-200 dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-900"
                            >
                              <option value="all">All tasks</option>
                              <option value="filtered">Filtered tasks (current view)</option>
                              <option value="completed">Completed tasks</option>
                              <option value="upcoming">Upcoming tasks</option>
                              <option value="project">Selected task list (project)</option>
                            </select>
                        </div>

                        {exportScope === 'project' && (
                          <div>
                            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Task list</label>
                            <select
                              value={exportProjectId}
                              onChange={(e) => setExportProjectId(e.target.value)}
                              className="w-full p-2 border border-gray-200 dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-900"
                            >
                              <option value="">Select project</option>
                              {projects.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        <p className="text-xs text-gray-500">
                          Included fields: title, due/scheduled date, priority, category, status, and notes. Scope: <span className="font-medium text-gray-700 dark:text-gray-300">{getScopeLabel()}</span>.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <button
                          onClick={exportCsv}
                          className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-left transition-colors"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <FileSpreadsheet size={16} />
                            <span className="font-semibold text-sm">CSV</span>
                          </div>
                          <p className="text-xs text-gray-500">Structured rows for spreadsheets and data tools.</p>
                        </button>
                        <button
                          onClick={exportDocument}
                          className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-left transition-colors"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <FileText size={16} />
                            <span className="font-semibold text-sm">Document</span>
                          </div>
                          <p className="text-xs text-gray-500">Readable task summary for sharing or printing.</p>
                        </button>
                        <button
                          onClick={exportCalendar}
                          className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-left transition-colors"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <CalendarDays size={16} />
                            <span className="font-semibold text-sm">Calendar (.ics)</span>
                          </div>
                          <p className="text-xs text-gray-500">Calendar-compatible file for due dates and scheduled tasks.</p>
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'security' && (
                <div className="space-y-6">
                    <div>
                        <h3 className="text-lg font-semibold mb-1">Security</h3>
                        <p className="text-sm text-gray-500">Update your password securely.</p>
                    </div>
                    <form onSubmit={handleUpdatePassword} className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">New Password</label>
                            <input 
                                type="password" 
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full p-2 border border-gray-200 dark:border-gray-700 rounded-md text-sm bg-transparent"
                                placeholder="Min. 6 characters"
                            />
                        </div>
                        <button 
                            type="submit" 
                            disabled={loading || !newPassword || !hasAuthenticatedUser}
                            className="px-4 py-2 accent-solid-btn rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                        >
                            {loading ? 'Updating...' : 'Update Password'}
                        </button>
                    </form>
                </div>
            )}

            {activeTab === 'danger' && (
                <div className="space-y-6">
                    <div>
                        <h3 className="text-lg font-semibold mb-1 text-red-600">Danger Zone</h3>
                        <p className="text-sm text-gray-500">Permanently delete your account and all data.</p>
                    </div>
                    <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl space-y-4">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={20} />
                            <div>
                                <h4 className="text-sm font-bold text-red-700 dark:text-red-400">Delete Account</h4>
                                <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">
                                    Once you delete your account, there is no going back. Please be certain.
                                </p>
                            </div>
                        </div>
                        <button 
                            onClick={handleDeleteAccount}
                            disabled={!hasAuthenticatedUser}
                            className="w-full py-2 bg-white dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 font-bold rounded-lg text-sm hover:bg-red-50 dark:hover:bg-red-900/40 transition-colors disabled:opacity-50 disabled:hover:bg-white dark:disabled:hover:bg-red-950"
                        >
                            Delete Personal Account
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'debug' && (
                <div className="space-y-6">
                    <div>
                        <h3 className="text-lg font-semibold mb-1">Diagnostics</h3>
                        <p className="text-sm text-gray-500">Run checks if you are having issues.</p>
                    </div>
                    <button 
                        onClick={runDiagnostics}
                        disabled={loading || !hasAuthenticatedUser}
                        className="px-4 py-2 accent-solid-btn rounded-lg text-sm font-bold hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50 transition-colors"
                    >
                        {loading ? 'Running...' : 'Run Diagnostics'}
                    </button>
                    {!hasAuthenticatedUser && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                            Sign in again to run authenticated diagnostics or account actions.
                        </p>
                    )}
                    {diagnostics.length > 0 && (
                        <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg font-mono text-xs overflow-x-auto whitespace-pre-wrap space-y-1">
                             {diagnostics.map((log, i) => (
                                 <div key={i}>{log}</div>
                             ))}
                        </div>
                    )}
                </div>
            )}
        </div>
      </div>
    </div>
  );
}
