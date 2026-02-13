# Task and Project Flow (Current Implementation)

This document explains how tasks and projects are currently created in the app.

## Add Task Flow

### 1. UI entry points

A task can be created from:
- `src/components/TaskInput.tsx` (quick add)
- `src/components/CreateTaskModal.tsx` (full form)
- `src/components/DailyNotes.tsx` (note to task)
- `src/components/AutoPlanModal.tsx` (batch-generated tasks)

Most of these eventually call `addTask` or `addTasksBatch` from `useTasks`.

### 2. Home page wiring

In `src/app/page.tsx`:
- `const { tasks, addTask, addTasksBatch, updateTask, deleteTask, isLoaded } = useTasks();`
- `addTask` is passed into task creation components.
- `addTasksBatch` is used by auto-plan via `handleAutoPlanTasks`.

### 3. Hook-level creation logic

In `src/hooks/useTasks.ts`:
1. Build `taskWithUser` by attaching `user_id` when available.
2. Apply optimistic state update immediately:
   - prepend task to `tasks`
   - persist locally with `saveTasks(next)`
3. If authenticated user exists:
   - call `db.addTask(taskWithUser)` (or `db.addTasksBatch`)
   - on DB failure for single-task add, rollback optimistic insert
4. If no user:
   - keep localStorage-only persistence

### 4. Persistence and DB write

In `src/lib/db.ts`:
- `db.addTask()` writes to `tasks` table through Supabase PostgREST (`fetch`, not `supabase.from()`)
- Data mapping happens through `taskToRow()`:
  - `title -> text`
  - `estimatedMinutes -> estimated_minutes`
  - `energyLevel -> energy_level`
  - `project_id` passed when present
- Activity log is written asynchronously via `logActivity(...)`.

### 5. Offline/degraded behavior

If auth/session/DB is unavailable:
- `useTasks` falls back to `localStorage` (`src/lib/storage.ts`)
- User can still add tasks locally
- DB sync is skipped until auth/network recovers

## Add Project Flow

### 1. UI entry points

Project creation is triggered from:
- Sidebar project section (`+` button)
- `src/components/CreateProjectModal.tsx`
- Some planner flows that can create missing projects (for example Daily Notes / Auto Plan integrations)

### 2. Home page wiring

In `src/app/page.tsx`:
- `const { projects, addProject: addProjectFn } = useProjects();`
- `addProjectFn` is passed to components that can create projects.

### 3. Hook-level creation logic

In `src/hooks/useProjects.ts`:
1. Recover authenticated user from `userRef` (or `supabase.auth.getUser()` fallback).
2. If still no user, abort project creation.
3. Create optimistic `tempProject` with generated id.
4. Append optimistic project to state.
5. Call `db.addProject({ user_id, name, color })`.
6. Replace temp project with real DB row.
7. On failure, rollback optimistic project and rethrow.

### 4. Persistence and DB write

In `src/lib/db.ts`:
- `db.addProject()` checks for existing project by `(user_id, name)`.
- If not found, inserts into `projects` table.
- Handles unique constraint race (`23505`) by refetching.
- Returns the canonical stored row.

### 5. Initial/default projects

On project load (`useProjects`):
- `db.ensureDefaultProjects(userId)` ensures `Life` and `Work` exist.
- Then `db.fetchProjects(userId)` loads ordered project list.

## Key Characteristics of the Current Design

- Optimistic UI first, DB second.
- Local backup for tasks via `localStorage`.
- Projects are DB-first for authenticated users.
- Auth/session race protections are built into both hooks.
- Supabase writes use direct PostgREST HTTP in `src/lib/db.ts`.
