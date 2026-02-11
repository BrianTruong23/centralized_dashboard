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
  Trash2
} from 'lucide-react';
import { Task } from '@/types/task';
import clsx from 'clsx';
import { ThemeToggle } from './ThemeToggle';
import { UserDropdown } from './UserDropdown';
import { projectsDb, Project } from '@/lib/projects';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  tasks: Task[];
  onAddTask: () => void;
  className?: string;
  user: any; 
  onLogout: () => void;
}

export const Sidebar = ({ 
  currentView, 
  onViewChange, 
  tasks, 
  onAddTask,
  className,
  user,
  onLogout
}: SidebarProps) => {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    if (user) {
        projectsDb.fetchProjects().then(setProjects);
    } else {
        setProjects([]);
    }
  }, [user]);

  // Calculate counts
  const inboxCount = tasks.filter(t => t.status !== 'done').length;
  const todayCount = tasks.filter(t => {
    if (t.status === 'done') return false;
    const deadline = t.deadline ? new Date(t.deadline) : null;
    const now = new Date();
    return deadline && 
           deadline.getDate() === now.getDate() && 
           deadline.getMonth() === now.getMonth() && 
           deadline.getFullYear() === now.getFullYear();
  }).length;
  
  // const tags = Array.from(new Set(tasks.flatMap(t => t.tags || []))).sort(); // REPLACED by explicit projects

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
      {/* Header */}
      <div className="p-4 mb-2 flex items-center justify-between">
         {user ? (
            <div className="flex-1 mr-2">
                <UserDropdown user={user} onLogout={onLogout} />
            </div>
         ) : (
            <div className="text-sm font-bold px-2">Minima</div>
         )}
         
         <div className="flex items-center gap-1 opacity-0 hover:opacity-100 transition-opacity">
             <ThemeToggle />
         </div>
      </div>

      {/* Main Nav */}
      <div className="flex-1 overflow-y-auto px-3 space-y-1 scrollbar-hide">
        {/* Actions */}
        <button 
          onClick={onAddTask}
          className="w-full flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white px-2 py-2 mb-4 hover:bg-white dark:hover:bg-gray-900 rounded-md shadow-sm border border-transparent hover:border-gray-100 dark:hover:border-gray-800 transition-all group"
        >
          <div className="bg-gray-900 dark:bg-gray-100 rounded-full p-0.5 text-white dark:text-black">
            <Plus size={14} />
          </div>
          <span className="text-sm font-medium">Add task</span>
        </button>

        <div className="relative group mb-6">
           <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
           <input 
             type="text" 
             placeholder="Search" 
             className="w-full bg-transparent border-none outline-none pl-9 py-1.5 text-sm text-gray-600 placeholder:text-gray-400 focus:ring-0"
           />
        </div>

        <NavItem id="inbox" icon={Inbox} label="Inbox" count={inboxCount} />
        <NavItem id="today" icon={Calendar} label="Today" count={todayCount} />
        <NavItem id="upcoming" icon={CalendarDays} label="Upcoming" />
        <NavItem id="daily-notes" icon={NotebookPen} label="Daily Notes" />
        <NavItem id="kanban" icon={Columns} label="Kanban" />
        
        <div className="mt-8 mb-2 px-2 flex items-center justify-between group">
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Projects</h3>
            <button 
                onClick={async () => {
                    const name = prompt('Project Name:');
                    if (name) {
                        try {
                            const newProject = await projectsDb.addProject(name);
                            if (newProject) setProjects([...projects, newProject]);
                        } catch (e) {
                            console.error(e);
                        }
                    }
                }}
                className="text-gray-300 hover:text-gray-600 dark:hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
            >
                <Plus size={12} />
            </button>
        </div>
        
        {projects.length > 0 ? projects.map(project => (
            <div key={project.id} className="group/item relative">
                <NavItem 
                    id={`project-${project.name}`} 
                    icon={Hash} 
                    label={project.name} 
                    count={tasks.filter(t => t.tags?.includes(project.name) && t.status !== 'done').length}
                />
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete project "${project.name}"?`)) {
                            projectsDb.deleteProject(project.id).then(() => {
                                setProjects(projects.filter(p => p.id !== project.id));
                            });
                        }
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/item:opacity-100 text-gray-400 hover:text-red-500 transition-opacity p-1"
                >
                    <Trash2 size={12} />
                </button>
            </div>
        )) : (
            <div className="px-3 py-2 text-xs text-gray-400 italic">No projects yet</div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4">
         <button className="flex items-center gap-3 text-gray-400 text-sm px-2 py-2 hover:text-gray-800 dark:hover:text-gray-200 transition-colors w-full">
            <Settings size={18} strokeWidth={1.5} />
            <span>Settings</span>
         </button>
      </div>
    </aside>
  );
};
