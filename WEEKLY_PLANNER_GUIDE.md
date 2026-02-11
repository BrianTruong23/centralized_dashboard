# Auto-Plan My Week Feature Guide

## Overview

The "Auto-Plan My Week" feature is an AI-powered weekly planning system that helps users organize their tasks across the week with suggested time blocks and smart scheduling based on priorities, deadlines, and energy levels.

## Features

### ✅ Implemented

1. **Clear UI Entry Point**
   - Prominent button on the home page: "Auto-Plan My Week"
   - Distinct from Daily Notes functionality
   - Professional card-based design

2. **Wizard Flow (3 Steps)**
   - **Step 1: Inputs** - Collect planning constraints
     - Goals/objectives for the week
     - Planning horizon (start/end dates)
     - Available hours per day (1-16 hours)
     - Energy preferences (morning/afternoon/evening)
   - **Step 2: Preview** - Review and edit generated plan
     - Tasks grouped by day of week
     - Suggested time blocks for each task
     - Edit task details (title, category, duration, etc.)
     - Move tasks to different days
     - View warnings for tasks that don't fit
   - **Step 3: Done** - Confirmation of plan creation

3. **Smart Planning Algorithm**
   - Prioritizes tasks by:
     - Priority level (P1-P5)
     - Deadlines (urgent tasks first)
     - Energy level matching (high-energy tasks in morning, etc.)
     - FIFO for same-priority tasks
   - Respects time constraints
   - Distributes tasks across available days
   - Generates suggested start/end times

4. **Data Model**
   - `weekly_plans` table for plan metadata
   - `weekly_plan_items` table for scheduled tasks
   - New task fields:
     - `source` (user or agent)
     - `suggested_start` (ISO timestamp)
     - `suggested_end` (ISO timestamp)
     - `planning_week_id` (reference to plan)
     - `planning_metadata` (JSONB for notes/confidence)

5. **Activity Logging**
   - `plan_activities` table tracks all plan events:
     - `PLAN_GENERATED` (actor=agent)
     - `PLAN_APPROVED` (actor=user)
     - `PLAN_DISCARDED` (actor=user)
     - `TASKS_CREATED_FROM_PLAN` (actor=agent)
     - `TASK_UPDATED_FROM_PLAN_EDIT` (actor=user)

6. **Safety Features**
   - Agent cannot delete tasks
   - Agent cannot auto-create tasks without approval
   - All actions require explicit user confirmation
   - Preview before committing changes

7. **Two Creation Modes**
   - **Create Tasks + Schedule**: Creates tasks with suggested times
   - **Create Tasks Only**: Creates tasks without time blocks

## Setup Instructions

### 1. Database Schema

Run the SQL migration in Supabase SQL Editor:

```bash
# Run this file in Supabase SQL Editor
cat weekly_plans_schema.sql
```

This creates:
- `weekly_plans` table
- `weekly_plan_items` table
- `plan_activities` table
- Updates `tasks` table with new fields
- Sets up Row Level Security policies

### 2. Environment Variables

No additional environment variables needed beyond existing Supabase configuration.

### 3. Testing

Run the test suite:

```bash
npm test -- weeklyPlanner.test.ts
```

## Usage

### User Flow

1. **Click "Auto-Plan My Week"** on the home page
2. **Enter planning inputs:**
   - What you want to accomplish this week
   - Start and end dates (default: Monday-Sunday)
   - Available hours per day (slider: 1-16 hours)
   - Energy preferences for different times of day
3. **Review the generated plan:**
   - See tasks organized by day
   - Check suggested time slots
   - Edit any task details if needed
   - Review warnings for tasks that don't fit
4. **Approve the plan:**
   - Choose "Create Tasks + Schedule" to include time blocks
   - Or "Create Tasks Only" for just the task list
   - Or "Discard" to cancel
5. **Tasks are created** and appear in your task list

### API Endpoint

**POST** `/api/plan-week`

**Request Body:**
```json
{
  "userId": "user-uuid",
  "goals": "Finish project proposal, prepare presentation",
  "constraints": {
    "startDate": "2024-01-01",
    "endDate": "2024-01-07",
    "totalHoursPerDay": 8,
    "energyPreferences": {
      "morningEnergy": "high",
      "afternoonEnergy": "medium",
      "eveningEnergy": "low"
    }
  },
  "existingTasks": [...] // Array of Task objects
}
```

**Response:**
```json
{
  "success": true,
  "plan": {
    "id": "plan-uuid",
    "user_id": "user-uuid",
    "title": "My Weekly Plan",
    "items": [...],
    ...
  },
  "summary": "Scheduled 12 of 15 tasks across 7 days (40 hours total).",
  "warnings": [
    "Could not fit task 'Large Project' (240m) into schedule."
  ]
}
```

## Architecture

### Files Created/Modified

**New Files:**
- `src/types/weeklyPlan.ts` - Type definitions
- `src/lib/weeklyPlanner.ts` - Planning algorithm
- `src/lib/weeklyPlanDb.ts` - Database operations
- `src/lib/activityLog.ts` - Activity logging
- `src/components/WeeklyPlanner.tsx` - UI component
- `src/app/api/plan-week/route.ts` - API endpoint
- `__tests__/weeklyPlanner.test.ts` - Tests
- `weekly_plans_schema.sql` - Database schema

**Modified Files:**
- `src/types/task.ts` - Added planning fields
- `src/lib/db.ts` - Updated task CRUD operations
- `src/app/page.tsx` - Added entry point

### Planning Algorithm

The algorithm uses a greedy approach:

1. **Filter** pending tasks (status !== 'done')
2. **Score** tasks based on:
   - Priority (P1=100, P2=80, P3=60, P4=40, P5=20)
   - Deadline urgency (overdue=+200, <24h=+100, <3d=+50, <1w=+25)
3. **Sort** by score (descending), then by createdAt (FIFO)
4. **Initialize** day schedules with available time
5. **Iterate** through sorted tasks:
   - Find best day based on:
     - Available time
     - Energy level match
     - Day preference (earlier for urgent tasks)
   - Assign time slot
   - Update day schedule
6. **Return** scheduled items + warnings

### Constraints Validation

- Start/end dates required
- End date must be after start date
- Planning horizon max 14 days
- Hours per day between 1-16

## Testing

The test suite covers:

✅ Constraint validation (dates, hours, etc.)
✅ Plan generation with various task configurations
✅ Priority ordering (high-priority tasks first)
✅ Time constraint respect (warnings for tasks that don't fit)
✅ Suggested time calculation (duration matches estimatedMinutes)
✅ Empty task handling
✅ Deterministic ordering (FIFO for same priority)
✅ Deadline handling (urgent tasks prioritized)

Run tests:
```bash
npm test -- weeklyPlanner.test.ts
```

## Future Enhancements (Out of Scope for MVP)

- [ ] Full calendar integration (Google Calendar sync)
- [ ] Auto-rescheduling based on real-time events
- [ ] Multi-week planning
- [ ] Collaborative/team planning
- [ ] AI-enhanced constraint detection from notes
- [ ] Recurring task support
- [ ] Conflict detection with existing calendar events
- [ ] Mobile-optimized interface
- [ ] Export to various calendar formats (iCal, etc.)
- [ ] Analytics on planning accuracy
- [ ] Smart suggestions based on past behavior

## Troubleshooting

### Database Issues

**Error: "weekly_plans table does not exist"**
- Run `weekly_plans_schema.sql` in Supabase SQL Editor

**Error: "Column 'source' does not exist"**
- Run the migration section in `weekly_plans_schema.sql` to add new task columns

### Planning Issues

**Warning: "Could not fit task into schedule"**
- Increase available hours per day
- Split large tasks into smaller subtasks
- Extend planning horizon (more days)

**Tasks not being prioritized correctly**
- Check task priority values (1=highest, 5=lowest)
- Set deadlines for urgent tasks
- Verify energy level preferences

## Support

For issues or feature requests, please create a GitHub issue at:
https://github.com/BrianTruong23/centralized-dashboard/issues

## License

Same as parent project (Minima Dashboard).
