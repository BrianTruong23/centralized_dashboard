import { useState, useEffect } from 'react';
import { 
  Inbox, 
  Calendar, 
  CalendarDays, 
  Hash, 
  Plus, 
  Layout, 
  ChevronDown,
  Settings,
  NotebookPen,
  Trash2,
  CheckCircle2,
  Menu,
  X,
  ListTodo
} from 'lucide-react';
import { Task } from '@/types/task';
import { Project, CreateProjectInput } from '@/types/project';
import clsx from 'clsx';
import { ThemeToggle } from './ThemeToggle';
import { UserDropdown } from './UserDropdown';
import { formatDateKey } from '@/lib/dateKey';
import { PlanningPreferences } from '@/types/planningPreferences';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  tasks: Task[];
  onAddTask: () => void;
  className?: string;
  user: any;
  onLogout: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenSettings: () => void;
  projects?: Project[];
  onOpenProjectModal: () => void;
  onDeleteProject?: (id: string) => Promise<void> | void;
  onOpenActivityLog: () => void;
  focusPlantEnabled: boolean;
  onToggleFocusPlant: (enabled: boolean) => void;
  isPro: boolean;
  forceProUser: boolean;
  onToggleForceProUser: (enabled: boolean) => void;
  planningPreferences: PlanningPreferences;
  onPlanningPreferencesChange: (next: PlanningPreferences) => void;
  onRestartOnboarding: () => void;
}

export const Sidebar = ({
  currentView,
  onViewChange,
  tasks,
  user,
  onLogout,
  onAddTask,
  className,
  searchQuery,
  onSearchChange,
  projects = [],
  onOpenProjectModal,
  onDeleteProject,
  onOpenActivityLog,
  focusPlantEnabled,
  onToggleFocusPlant,
  isPro,
  forceProUser,
  onToggleForceProUser,
  planningPreferences,
  onPlanningPreferencesChange,
  onRestartOnboarding,
  onOpenSettings,
}: SidebarProps) => {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [showAllNavItems, setShowAllNavItems] = useState(false);

  // Close mobile menu when view changes
  useEffect(() => {
    setIsMobileOpen(false);
  }, [currentView]);

  // Calculate counts
  const inboxCount = tasks.filter(t => t.status !== 'done').length;
  // Basic filtering for "Today" - this should ideally match page.tsx logic
  const todayCount = tasks.filter(t => {
      if (t.status === 'done') return false;
      if (!t.deadline) return false;
      const today = formatDateKey(new Date());
      return t.deadline === today;
  }).length;
  
  const NavItem = ({ 
    id, 
    icon: Icon, 
    label, 
    count, 
  }: { 
    id: string; 
    icon: any; 
    label: string; 
    count?: number; 
  }) => {
    const isActive = currentView === id;
    return (
      <button
        onClick={() => onViewChange(id)}
        className={clsx(
          "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-all duration-200 group",
          isActive 
            ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium" 
            : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-gray-200"
        )}
      >
        <div className="flex items-center gap-3">
          <Icon size={18} className={clsx("transition-colors", isActive ? "text-gray-900 dark:text-gray-100" : "text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300")} strokeWidth={1.5} />
          <span>{label}</span>
        </div>
        {count !== undefined && count > 0 && (
          <span className="text-xs text-gray-400 group-hover:text-gray-600 dark:text-gray-600 dark:group-hover:text-gray-400">{count}</span>
        )}
      </button>
    );
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="md:hidden fixed top-4 right-4 z-50 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
        aria-label="Toggle menu"
      >
        {isMobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside 
        className={clsx(
          "fixed md:static inset-y-0 left-0 z-40 w-64 flex flex-col h-screen bg-gray-50/50 dark:bg-black border-r border-gray-100 dark:border-gray-900 transition-transform duration-300 ease-in-out md:translate-x-0",
          isMobileOpen ? "translate-x-0" : "-translate-x-full",
          className
        )}
      >
        {/* Header with Logo + UserDropdown */}
        <div className="p-4 mb-2 flex items-center gap-3">
           <div
             className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center"
             style={{ backgroundColor: 'var(--accent-solid)', color: 'var(--accent-solid-foreground)' }}
             aria-label="Minismo"
           >
             <ListTodo size={18} />
           </div>
           <div className="min-w-0 flex-1">
               {user ? (
                   <div className="min-w-0">
                       <UserDropdown 
                         user={user} 
                         onLogout={onLogout} 
                         onOpenSettings={onOpenSettings}
                         onOpenActivityLog={onOpenActivityLog}
                       />
                   </div>
               ) : (
                   <span className="text-sm font-bold">Minismo</span>
               )}
           </div>
           
           <div className="flex items-center pl-1 flex-shrink-0">
               <ThemeToggle />
           </div>
        </div>

        {/* ... (Main Nav) ... */}
        <div className="flex-1 overflow-y-auto px-3 space-y-1 scrollbar-hide">
          {/* ... (Actions same as before) ... */}
          <div className="mb-3" />

          <NavItem id="today" icon={Calendar} label="Today" count={todayCount} />
          <NavItem id="inbox" icon={Inbox} label="Inbox" count={inboxCount} />
          <NavItem id="upcoming" icon={CalendarDays} label="Upcoming" />
          
          {showAllNavItems && (
            <>
              <NavItem id="daily-notes" icon={NotebookPen} label="Daily Notes" />
              <NavItem id="completed" icon={CheckCircle2} label="Completed" />
            </>
          )}

          <button
             onClick={() => setShowAllNavItems(!showAllNavItems)}
             className="w-full mt-1 text-xs text-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 py-1.5 font-medium transition-colors"
          >
             {showAllNavItems ? 'Show less' : 'Show more'}
          </button>

          
          {/* Projects section (same) */}
          <div className="mt-8 mb-2 px-2 flex items-center justify-between group">
              <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Projects</h3>
              <button 
                  onClick={onOpenProjectModal}
                  className="text-gray-400 hover:text-black dark:hover:text-white transition-colors"
                  title="Add Project"
              >
                  <Plus size={14} />
              </button>
          </div>
          <div className="space-y-0.5">
             {(showAllProjects ? projects : projects.slice(0, 3)).map(project => (
                 <div key={project.id} className="group relative">
                     <button
                       onClick={() => onViewChange(`project-${project.id}`)}
                       className={clsx(
                         "w-full flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors rounded-lg",
                         currentView === `project-${project.id}`
                           ? "bg-white dark:bg-gray-800 text-black dark:text-white shadow-sm"
                           : "text-gray-500 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-200"
                       )}
                     >
                       <span 
                          className="w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-black" 
                          style={{ backgroundColor: project.color }}
                       />
                       <span className="truncate flex-1 text-left">{project.name}</span>
                     </button>
                     
                     {/* Delete Button - Only visible on hover */}
                     <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Are you sure you want to delete project "${project.name}"? This action cannot be undone.`)) {
                                Promise.resolve(onDeleteProject?.(project.id)).catch((err: any) => {
                                    alert(err.message || 'Failed to delete project');
                                });
                            }
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                        title="Delete project"
                     >
                        <Trash2 size={14} />
                     </button>
                 </div>
             ))}
             {projects.length === 0 && (
                 <p className="px-3 text-xs text-gray-400 italic">No projects yet</p>
             )}
             {projects.length > 3 && (
                <button
                   onClick={() => setShowAllProjects(!showAllProjects)}
                   className="w-full mt-2 text-xs text-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 py-1.5 font-medium transition-colors"
                >
                   {showAllProjects ? 'Show less' : `Show ${projects.length - 3} more`}
                </button>
             )}
          </div>

        </div>

        {/* Footer Settings Button - Now Functional */}
        <div className="p-4">
           <button 
              onClick={onOpenSettings}
              className="flex items-center gap-3 text-gray-400 text-sm px-2 py-2 hover:text-gray-800 dark:hover:text-gray-200 transition-colors w-full"
           >
              <Settings size={18} strokeWidth={1.5} />
              <span>Settings</span>
           </button>
        </div>

      </aside>
    </>
  );
};
