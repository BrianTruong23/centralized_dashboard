import { useState, useEffect } from 'react';
import { 
  Inbox, 
  Calendar, 
  CalendarDays, 
  Hash, 
  Plus, 
  Search, 
  Columns, 
  Layout, 
  ChevronDown,
  Settings,
  NotebookPen,
  Trash2,
  CheckCircle2
} from 'lucide-react';
import { Task } from '@/types/task';
import { Project, CreateProjectInput } from '@/types/project';
import clsx from 'clsx';
import { ThemeToggle } from './ThemeToggle';
import { UserDropdown } from './UserDropdown';
import { CreateProjectModal } from './CreateProjectModal';
import { SettingsModal } from './SettingsModal';
import { ActivityLogModal } from './ActivityLogModal';
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
  projects?: Project[];
  addProject?: (input: CreateProjectInput) => Promise<Project | undefined>;
  focusPlantEnabled: boolean;
  onToggleFocusPlant: (enabled: boolean) => void;
  isPro: boolean;
  forceProUser: boolean;
  onToggleForceProUser: (enabled: boolean) => void;
  planningPreferences: PlanningPreferences;
  onPlanningPreferencesChange: (next: PlanningPreferences) => void;
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
  addProject,
  focusPlantEnabled,
  onToggleFocusPlant,
  isPro,
  forceProUser,
  onToggleForceProUser,
  planningPreferences,
  onPlanningPreferencesChange,
}: SidebarProps) => {
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);

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
    <aside className={clsx("w-64 flex flex-col h-screen bg-gray-50/50 dark:bg-black border-r border-gray-100 dark:border-gray-900", className)}>
      {/* Header with Logo + UserDropdown */}
      <div className="p-4 mb-2 flex items-center justify-between">
         <div className="flex items-center gap-2 flex-1 mr-2">
             <img src="/logo.svg" alt="Minima" width={48} height={48} className="rounded-lg" />
             {user ? (
                 <div className="flex-1">
                     <UserDropdown 
                       user={user} 
                       onLogout={onLogout} 
                       onOpenSettings={() => setIsSettingsOpen(true)}
                       onOpenActivityLog={() => setIsActivityLogOpen(true)}
                     />
                 </div>
             ) : (
                 <span className="text-sm font-bold">Minima</span>
             )}
         </div>
         
         <div className="flex items-center gap-1 opacity-0 hover:opacity-100 transition-opacity">
             <ThemeToggle />
         </div>
      </div>

      {/* ... (Main Nav) ... */}
      <div className="flex-1 overflow-y-auto px-3 space-y-1 scrollbar-hide">
        {/* ... (Actions same as before) ... */}
        <button 
          onClick={onAddTask}
          className="w-full flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white px-2 py-2 mb-4 hover:bg-white dark:hover:bg-gray-900 rounded-md shadow-sm border border-transparent hover:border-gray-100 dark:hover:border-gray-800 transition-all group"
        >
          <div className="bg-gray-900 dark:bg-gray-100 rounded-full p-0.5 text-white dark:text-black">
            <Plus size={14} />
          </div>
          <span className="text-sm font-medium">Add task</span>
        </button>

        {/* Search (same) */}
       <div className="relative group mb-6">
           <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
           <input 
             type="text" 
             placeholder="Search" 
             value={searchQuery}
             onChange={(e) => onSearchChange(e.target.value)}
             className="w-full bg-transparent border-none outline-none pl-9 py-1.5 text-sm text-gray-600 placeholder:text-gray-400 focus:ring-0"
           />
        </div>

        <NavItem id="today" icon={Calendar} label="Today" count={todayCount} />
        <NavItem id="inbox" icon={Inbox} label="Inbox" count={inboxCount} />
        <NavItem id="upcoming" icon={CalendarDays} label="Upcoming" />
        <NavItem id="daily-notes" icon={NotebookPen} label="Daily Notes" />
        <NavItem id="kanban" icon={Columns} label="Kanban" />
        <NavItem id="completed" icon={CheckCircle2} label="Completed" />

        
        {/* Projects section (same) */}
        <div className="mt-8 mb-2 px-2 flex items-center justify-between group">
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Projects</h3>
            <button 
                onClick={() => setIsProjectModalOpen(true)}
                className="text-gray-400 hover:text-black dark:hover:text-white transition-colors"
                title="Add Project"
            >
                <Plus size={14} />
            </button>
        </div>
        <div className="space-y-0.5">
           {projects.map(project => (
               <button
                 key={project.id}
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
                 <span className="truncate">{project.name}</span>
               </button>
           ))}
           {projects.length === 0 && (
               <p className="px-3 text-xs text-gray-400 italic">No projects yet</p>
           )}
        </div>

      </div>

      {/* Footer Settings Button - Now Functional */}
      <div className="p-4">
         <button 
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-3 text-gray-400 text-sm px-2 py-2 hover:text-gray-800 dark:hover:text-gray-200 transition-colors w-full"
         >
            <Settings size={18} strokeWidth={1.5} />
            <span>Settings</span>
         </button>
      </div>

      {/* Modals */}
      <CreateProjectModal 
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        onAddProject={addProject as any}
      />
      
      <SettingsModal 
         isOpen={isSettingsOpen}
         onClose={() => setIsSettingsOpen(false)}
         user={user}
         onLogout={onLogout}
         focusPlantEnabled={focusPlantEnabled}
         onToggleFocusPlant={onToggleFocusPlant}
         isPro={isPro}
         forceProUser={forceProUser}
         onToggleForceProUser={onToggleForceProUser}
         planningPreferences={planningPreferences}
         onPlanningPreferencesChange={onPlanningPreferencesChange}
      />

      <ActivityLogModal
        isOpen={isActivityLogOpen}
        onClose={() => setIsActivityLogOpen(false)}
        userId={user?.id}
      />
    </aside>
  );
};
