import React, { useState } from 'react';
import { Task, TaskStatus } from '@/types/task';
import { Idea, IdeaStatus } from '@/types/idea';
import { TaskItem } from './TaskItem';
import { Plus } from 'lucide-react';
import { ideasDb } from '@/lib/ideas';
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  DragEndEvent,
  DragStartEvent,
  closestCorners,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface KanbanBoardProps {
  // Task Mode Props
  tasks?: Task[];
  onUpdateTask?: (task: Task) => void;
  onDeleteTask?: (id: string) => void;
  onFocusTask?: (task: Task) => void;
  
  // Idea Mode Props
  initialIdeas?: Idea[];
  userId?: string;
}

// Wrapper for Sortable Task Item
const SortableTaskItem = ({ task, onUpdate, onDelete, onFocus }: { 
    task: Task; 
    onUpdate: (task: Task) => void; 
    onDelete: (id: string) => void;
    onFocus: (task: Task) => void;
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: task.id, data: { type: 'task', task } });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <TaskItem 
                task={task} 
                onUpdate={onUpdate} 
                onDelete={onDelete} 
                onFocus={onFocus}
            />
        </div>
    );
};

export const KanbanBoard = ({ 
  tasks, 
  onUpdateTask, 
  onDeleteTask, 
  onFocusTask,
  initialIdeas,
  userId
}: KanbanBoardProps) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Enable click on buttons inside
      },
    })
  );

  // --- Task Mode Logic ---
  const isTaskMode = !!tasks;
  
  const tasksByStatus = {
    todo: tasks?.filter(t => t.status === 'todo') || [],
    doing: tasks?.filter(t => t.status === 'doing') || [],
    done: tasks?.filter(t => t.status === 'done') || [],
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    if (event.active.data.current?.type === 'task') {
        setActiveTask(event.active.data.current.task);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    setActiveTask(null);

    const { active, over } = event;
    if (!over) return;

    if (active.data.current?.type === 'task' && onUpdateTask) {
        const task = active.data.current.task as Task;
        const overId = over.id as string;
        
        // Determine new status based on where it was dropped
        let newStatus: TaskStatus | null = null;

        // If dropped over a container (column)
        if (overId === 'todo' || overId === 'doing' || overId === 'done') {
            newStatus = overId as TaskStatus;
        } 
        // If dropped over another task
        else if (active.id !== overId) {
            // Find the task we dropped over to get its status
            const overTask = tasks?.find(t => t.id === overId);
            if (overTask && overTask.status !== task.status) {
                newStatus = overTask.status;
            }
        }

        if (newStatus && newStatus !== task.status) {
            onUpdateTask({ ...task, status: newStatus });
        }
    }
  };

  // --- Idea Mode Logic ---
  const [ideas, setIdeas] = useState<Idea[]>(initialIdeas || []);
  
  const ideasByStatus = {
    backlog: ideas.filter(i => i.status === 'backlog'),
    planned: ideas.filter(i => i.status === 'planned'),
    'in-progress': ideas.filter(i => i.status === 'in-progress'),
    done: ideas.filter(i => i.status === 'done'),
  };

  const handleMoveIdea = async (idea: Idea, newStatus: IdeaStatus) => {
    // Optimistic update
    const previousIdeas = [...ideas];
    setIdeas(prev => prev.map(i => i.id === idea.id ? { ...i, status: newStatus } : i));

    try {
      await ideasDb.updateIdeaStatus(idea.id, newStatus);
    } catch (error) {
      console.error('Failed to move idea:', error);
      // Revert on failure
      setIdeas(previousIdeas);
    }
  };

  // --- Shared Render Logic ---

  const Column = ({ 
    id,
    title, 
    items, 
    status, 
    color,
    type 
  }: { 
    id: string,
    title: string, 
    items: (Task | Idea)[], 
    status: string, 
    color: string,
    type: 'task' | 'idea'
  }) => {
    // Make the column itself droppable so we can drop into empty columns
    const { setNodeRef } = useDroppable({
        id: id,
        data: { type: 'column', id }
    });

    // For SortableContext, we need the list of IDs
    const itemIds = items.map(i => i.id);

    return (
     <div ref={setNodeRef} className="flex-1 min-w-[300px] flex flex-col h-full rounded-xl bg-gray-50/30 dark:bg-gray-900/10">
       <div className="p-3 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2">
             <div className={`w-1.5 h-1.5 rounded-full ${color}`} />
             <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100">{title}</h3>
             <span className="text-gray-400 text-xs">{items.length}</span>
          </div>
          <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
             <Plus size={14} />
          </button>
       </div>
       
       <div className="flex-1 px-2 pb-3 overflow-y-auto scrollbar-hide">
         {type === 'task' ? (
             <SortableContext id={id} items={itemIds} strategy={verticalListSortingStrategy}>
                 <div className="space-y-2 min-h-[50px]"> {/* min-h ensures drop target exists when empty */}
                     {items.map(item => (
                         <SortableTaskItem 
                            key={item.id} 
                            task={item as Task} 
                            onUpdate={onUpdateTask!} 
                            onDelete={onDeleteTask!} 
                            onFocus={onFocusTask!}
                         />
                     ))}
                     {items.length === 0 && (
                        <div className="py-8 text-center text-gray-300 dark:text-gray-700 text-xs border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-lg mx-2">
                            Empty
                        </div>
                     )}
                 </div>
             </SortableContext>
         ) : (
            // Ideas are not sortable yet in this implementation
             <div className="space-y-2">
                 {items.map(item => (
                     <div key={item.id} className="relative group bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
                        <h4 className="font-medium text-sm mb-1 text-gray-900 dark:text-gray-100">{(item as Idea).title}</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{(item as Idea).description}</p>
                        
                        <div className="mt-3 flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                             {status !== 'backlog' && (
                                 <button onClick={() => handleMoveIdea(item as Idea, 'backlog')} className="text-[10px] uppercase font-bold text-gray-400 hover:text-gray-600 px-1">Backlog</button>
                             )}
                              {status !== 'planned' && (
                                 <button onClick={() => handleMoveIdea(item as Idea, 'planned')} className="text-[10px] uppercase font-bold text-blue-400 hover:text-blue-600 px-1">Plan</button>
                             )}
                             {status !== 'in-progress' && (
                                 <button onClick={() => handleMoveIdea(item as Idea, 'in-progress')} className="text-[10px] uppercase font-bold text-amber-400 hover:text-amber-600 px-1">Start</button>
                             )}
                              {status !== 'done' && (
                                 <button onClick={() => handleMoveIdea(item as Idea, 'done')} className="text-[10px] uppercase font-bold text-green-400 hover:text-green-600 px-1">Done</button>
                             )}
                         </div>
                     </div>
                 ))}
                 {items.length === 0 && (
                     <div className="py-8 text-center text-gray-300 dark:text-gray-700 text-xs border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-lg mx-2">
                         Empty
                     </div>
                 )}
             </div>
         )}
       </div>
     </div>
    );
  };

  return (
    <DndContext 
        sensors={sensors} 
        collisionDetection={closestCorners} 
        onDragStart={handleDragStart} 
        onDragEnd={handleDragEnd}
    >
        <div className="flex gap-4 h-full overflow-x-auto pb-4">
            {isTaskMode ? (
                <>
                    <Column id="todo" title="To Do" items={tasksByStatus.todo} status="todo" color="bg-gray-400" type="task" />
                    <Column id="doing" title="In Progress" items={tasksByStatus.doing} status="doing" color="bg-blue-500" type="task" />
                    <Column id="done" title="Done" items={tasksByStatus.done} status="done" color="bg-green-500" type="task" />
                </>
            ) : (
                <>
                    <Column id="backlog" title="Backlog" items={ideasByStatus.backlog} status="backlog" color="bg-gray-400" type="idea" />
                    <Column id="planned" title="Planned" items={ideasByStatus.planned} status="planned" color="bg-purple-500" type="idea" />
                    <Column id="in-progress" title="In Progress" items={ideasByStatus['in-progress']} status="in-progress" color="bg-blue-500" type="idea" />
                    <Column id="done" title="Done" items={ideasByStatus.done} status="done" color="bg-green-500" type="idea" />
                </>
            )}
        </div>

        <DragOverlay>
            {activeTask ? (
               <div className="opacity-90 rotate-2 scale-105 cursor-grabbing">
                    <TaskItem 
                        task={activeTask} 
                        onUpdate={() => {}} 
                        onDelete={() => {}} 
                        onFocus={() => {}}
                    />
               </div>
            ) : null}
        </DragOverlay>
    </DndContext>
  );
};
