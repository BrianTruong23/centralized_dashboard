/*
  TASKS SCHEMA REFINEMENT

  Goal:
  - separate due/deadline semantics from planned scheduling semantics
  - keep "planned day" distinct from "planned exact time block"
  - remove ambiguous names like start_time / end_time
  - tighten constraints for task-planning queries

  Recommended temporal model:
  - deadline: exact due moment if known; may also be used as date-only deadline in the current app
  - scheduled_on: local planning day bucket for Today / weekly planning / drag-to-day
  - scheduled_start: exact planned start instant
  - scheduled_end: exact planned end instant
  - completed_at: actual completion timestamp

  Why keep scheduled_on even though scheduled_start includes a date?
  - scheduled_on is the planning bucket, not just a timestamp derivative
  - it supports "move to today" without inventing an hour
  - it avoids timezone gymnastics for day-scoped planning queries
  - it lets a task be planned for a day even when no exact time exists

  Migration strategy:
  - Phase 1: additive + compatibility-safe
  - Phase 2: app rollout
  - Phase 3: remove deprecated columns once app code no longer depends on them
*/

begin;

-- 1. Add the clearer scheduling columns.
alter table public.tasks
  add column if not exists scheduled_on date,
  add column if not exists scheduled_start timestamp with time zone,
  add column if not exists scheduled_end timestamp with time zone;

-- 2. Backfill from the old ambiguous fields.
--    This is a best-effort migration. If you have per-user timezone logic,
--    you may want to run a follow-up application-level backfill.
update public.tasks
set
  scheduled_start = coalesce(scheduled_start, start_time),
  scheduled_end = coalesce(scheduled_end, end_time),
  scheduled_on = coalesce(
    scheduled_on,
    (coalesce(start_time, end_time) at time zone 'utc')::date,
    (deadline at time zone 'utc')::date
  )
where
  scheduled_on is null
  or scheduled_start is null
  or scheduled_end is null;

-- 3. Normalize completion metadata from status/completed.
update public.tasks
set completed_at = coalesce(completed_at, updated_at, created_at)
where status = 'done'
  and completed_at is null;

-- 4. Tighten domain constraints.
alter table public.tasks
  add constraint tasks_status_check
    check (status in ('todo', 'doing', 'done'))
    not valid;

alter table public.tasks
  add constraint tasks_priority_check
    check (priority between 1 and 5)
    not valid;

alter table public.tasks
  add constraint tasks_energy_level_check
    check (energy_level in ('low', 'medium', 'high'))
    not valid;

alter table public.tasks
  add constraint tasks_estimated_minutes_check
    check (estimated_minutes is null or estimated_minutes > 0)
    not valid;

alter table public.tasks
  add constraint tasks_scheduled_window_check
    check (
      scheduled_end is null
      or scheduled_start is null
      or scheduled_end > scheduled_start
    )
    not valid;

alter table public.tasks
  add constraint tasks_completed_at_requires_done_check
    check (completed_at is null or status = 'done')
    not valid;

alter table public.tasks
  add constraint tasks_completed_flag_consistency_check
    check (
      completed is null
      or completed = (status = 'done')
    )
    not valid;

-- 5. Indexes tuned for common user-scoped planning queries.
create index if not exists idx_tasks_user_active
  on public.tasks(user_id, status, updated_at desc)
  where archived = false;

create index if not exists idx_tasks_user_inbox_active
  on public.tasks(user_id, updated_at desc)
  where archived = false and inbox = true and status <> 'done';

create index if not exists idx_tasks_user_deadline_active
  on public.tasks(user_id, deadline)
  where archived = false and status <> 'done' and deadline is not null;

create index if not exists idx_tasks_user_scheduled_on_active
  on public.tasks(user_id, scheduled_on)
  where archived = false and status <> 'done' and scheduled_on is not null;

create index if not exists idx_tasks_user_scheduled_start_active
  on public.tasks(user_id, scheduled_start)
  where archived = false and status <> 'done' and scheduled_start is not null;

create index if not exists idx_tasks_user_project_active
  on public.tasks(user_id, project_id, status)
  where archived = false;

-- 6. Validate constraints after the data is in a good state.
alter table public.tasks validate constraint tasks_status_check;
alter table public.tasks validate constraint tasks_priority_check;
alter table public.tasks validate constraint tasks_energy_level_check;
alter table public.tasks validate constraint tasks_estimated_minutes_check;
alter table public.tasks validate constraint tasks_scheduled_window_check;
alter table public.tasks validate constraint tasks_completed_at_requires_done_check;
alter table public.tasks validate constraint tasks_completed_flag_consistency_check;

commit;

/*
  PHASE 2 APP ROLLOUT

  Update application code to:
  - read/write scheduled_on instead of overloading deadline for "planned day"
  - read/write scheduled_start / scheduled_end instead of start_time / end_time
  - treat deadline as due/deadline only
  - derive Today / week planning primarily from scheduled_on and scheduled_start
  - stop writing completed boolean directly; derive from status at the app edge until dropped

  PHASE 3 CLEANUP (after app rollout)

  -- rename deadline if you want stricter naming:
  -- alter table public.tasks rename column deadline to deadline_at;
  --
  -- drop the ambiguous legacy columns after application code is migrated:
  -- alter table public.tasks drop column start_time;
  -- alter table public.tasks drop column end_time;
  --
  -- eventually drop completed once all code reads status/completed_at:
  -- alter table public.tasks drop column completed;
*/
