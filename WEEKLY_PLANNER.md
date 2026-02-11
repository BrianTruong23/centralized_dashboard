# Auto-Plan My Week Feature

## Overview

The "Auto-Plan My Week" feature is an AI-powered weekly planning system that helps users organize their tasks across the week based on priorities, deadlines, energy levels, and availability.

## Architecture

### Database Schema

The feature introduces three new tables:

1. **weekly_plans** - Stores weekly plan metadata
   - `id`, `user_id`, `title`, `date_range_start`, `date_range_end`
   - `goals`, `constraints` (jsonb), `status`
   - `created_at`, `approved_at`, `discarded_at`

2. **weekly_plan_items** - Stores individual plan items with suggested time blocks
   - Links to `weekly_plans` and optionally to `tasks`
   - Includes `suggested_start`, `suggested_end` timestamps
   - Stores `planning_metadata` (jsonb) for confidence scores and notes

3. **activity_log** - Tracks all plan-related actions
   - Logs `PLAN_GENERATED`, `PLAN_APPROVED`, `PLAN_DISCARDED`, `TASKS_CREATED_FROM_PLAN`, `TASK_UPDATED_FROM_PLAN_EDIT`

### Task Table Extensions

New columns added to the `tasks` table:
- `source` (text) - 'user' or 'agent'
- `suggested_start` (timestamp) - Suggested start time
- `suggested_end` (timestamp) - Suggested end time
- `planning_week_id` (uuid) - Links to weekly_plans
- `planning_metadata` (jsonb) - Stores confidence, assumptions, notes

### Key Components

1. **WeeklyPlanner Component** (`src/components/WeeklyPlanner.tsx`)
   - Three-step wizard: Constraints → Preview → Complete
   - Allows editing plan items before approval
   - Supports "Create Tasks Only" or "Create Tasks + Plan"

2. **Planning Algorithm** (`src/lib/weeklyPlanner.ts`)
   - Priority-based task scoring
   - Energy level matching
   - Deadline awareness
   - Time block allocation
   - Deterministic sorting (FIFO tie-breaker)

3. **API Route** (`src/app/api/plan/route.ts`)
   - POST endpoint for plan generation
   - Validates constraints
   - Returns plan, summary, and warnings

4. **Database Helpers** (`src/lib/plans.ts`)
   - CRUD operations for plans and plan items
   - Activity logging utilities

## User Flow

### Step 1: Input Constraints

Users provide:
- **Goals** - Free text describing what they want to accomplish
- **Date Range** - Start and end dates (default: current week Mon-Sun)
- **Available Hours** - Hours per day available for tasks
- **Energy Preferences** - Morning/afternoon/evening energy levels
- **Category Priorities** (optional) - Which task categories are most important

### Step 2: Preview Plan

The system generates a weekly plan showing:
- Tasks organized by day
- Suggested time blocks (start/end times)
- Task details (duration, category, energy level)
- Summary statistics

Users can:
- Edit individual plan items
- Move tasks to different times
- Review and adjust before approval

### Step 3: Approve & Create

Users choose:
- **Create Tasks + Plan** - Save plan to database and create tasks
- **Create Tasks Only** - Just create tasks without saving the plan structure
- **Discard** - Cancel and start over

## Planning Algorithm

### Scoring System

Tasks are scored based on:

1. **Base Priority** (P1-P5)
   - P1: +100 points
   - P2: +80 points
   - P3: +60 points
   - P4: +40 points
   - P5: +20 points

2. **Deadline Urgency**
   - Overdue: +200 points
   - Due within 24h: +100 points
   - Due within 3 days: +50 points
   - Due within 1 week: +25 points

3. **Category Priority**
   - User-defined category priorities add 0-50 points

4. **Energy Match**
   - Exact match: +30 points
   - Compatible (high → medium): +15 points
   - Incompatible (low → high): -50 points

### Time Allocation

1. Tasks are sorted by score (descending)
2. Tasks are allocated to time blocks across the week
3. Default schedule: 9 AM start, with lunch break at 12-1 PM
4. Tasks can be split across multiple blocks if needed
5. Maximum 2-hour blocks to prevent fatigue

### Guardrails

- Agent cannot delete tasks
- Agent cannot auto-create without explicit confirmation
- Agent can propose edits, but user approves
- All destructive actions require user confirmation

## Activity Logging

All plan-related actions are logged:

- **PLAN_GENERATED** - When agent creates a plan (actor=agent)
- **PLAN_APPROVED** - When user approves a plan (actor=user)
- **PLAN_DISCARDED** - When user discards a plan (actor=user)
- **TASKS_CREATED_FROM_PLAN** - When tasks are created from plan (actor=agent)
- **TASK_UPDATED_FROM_PLAN_EDIT** - When user edits a plan item (actor=user)

## Setup Instructions

### 1. Run Database Migration

Execute the SQL schema in Supabase:

```bash
# In Supabase SQL Editor, run:
cat weekly_plans_schema.sql
```

This will:
- Create `weekly_plans`, `weekly_plan_items`, and `activity_log` tables
- Add new columns to `tasks` table
- Set up RLS policies
- Create indexes for performance

### 2. Verify Installation

The feature is automatically available on the home page as an "Auto-Plan My Week" button.

### 3. Test the Feature

1. Sign in to the app
2. Add some tasks with various priorities and deadlines
3. Click "Auto-Plan My Week"
4. Fill in planning constraints
5. Generate and review the plan
6. Approve to create tasks

## Configuration

### Default Values

- **Hours per day**: 8
- **Start time**: 9:00 AM
- **Block duration**: Up to 2 hours
- **Week start**: Monday

### Customization

Users can customize:
- Date range (not limited to current week)
- Hours per day (1-16)
- Energy preferences by time of day
- Category priorities (1-5 scale)

## Testing

Run the test suite:

```bash
npm test -- __tests__/weeklyPlanner.test.ts
```

Tests cover:
- Plan generation correctness
- Task prioritization
- Time allocation
- Edge cases (empty tasks, completed tasks, oversized tasks)
- Constraint validation
- Plan stability (deterministic output)

## API Reference

### POST /api/plan

Generate a weekly plan.

**Request Body:**
```json
{
  "goals": "Complete project milestone",
  "constraints": {
    "startDate": "2026-02-10",
    "endDate": "2026-02-16",
    "hoursPerDay": 8,
    "energyPreferences": {
      "morning": "high",
      "afternoon": "medium",
      "evening": "low"
    },
    "categoryPriorities": {
      "Coding": 5,
      "Research": 4
    }
  },
  "existingTasks": [...]
}
```

**Response:**
```json
{
  "plan": {
    "id": "...",
    "title": "Week of Feb 10",
    "items": [...],
    "status": "draft"
  },
  "summary": "Created a 12-task plan for the week...",
  "warnings": []
}
```

## Future Enhancements

Out of scope for MVP but planned:
- Calendar integration (Google Calendar sync)
- Auto-rescheduling based on real-time events
- Multi-week planning
- Collaborative/team planning
- Machine learning-based time estimates
- Historical completion tracking

## Troubleshooting

### Plan items not showing
- Verify database migration ran successfully
- Check that tasks have `status !== 'done'`
- Ensure available time is sufficient

### Tasks not being created
- Check browser console for errors
- Verify user authentication
- Check Supabase RLS policies

### Unexpected task ordering
- Review task priorities and deadlines
- Check category priority settings
- Verify energy preferences are set

## Performance Considerations

- Plans are generated client-side (no AI API calls for MVP)
- Algorithm runs in O(n log n) time
- Database queries use indexes for fast lookups
- Activity logs are written asynchronously (non-blocking)

## Security

- All plans are user-scoped (RLS policies)
- Agent cannot access other users' data
- All mutations require user authentication
- Activity log tracks all changes for audit trail
