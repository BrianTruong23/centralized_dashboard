# Onboarding Implementation for Issue #38

## Overview
This implementation adds a minimal, skip-heavy onboarding flow for new users as specified in GitHub Issue #38. The onboarding introduces default projects (Life/Work), explains core features (Inbox, Today, Focus Mode, Kanban), and captures basic user preferences.

## Features Implemented

### 1. Three-Screen Onboarding Flow

#### Screen 1: Welcome & Default Projects
- Introduces users to the dashboard
- Shows the two default projects:
  - **Life** (green #22c55e) - Personal tasks, hobbies, and goals
  - **Work** (blue #3b82f6) - Professional tasks and projects
- Explains that users can create more projects anytime

#### Screen 2: Inbox & Focus Mode Explanation
- **Inbox**: Central hub for all active tasks
- **Today View**: Focus on tasks with today's deadline
- **Focus Mode**: Distraction-free timer with optional plant growth visualization
- **Kanban Board**: Visual workflow with To Do, Doing, and Done columns

#### Screen 3: User Preferences
- **Week starts on**: Toggle between Sunday/Monday
- **Maximum tasks per day**: Slider from 3-15 tasks
  - Labels: Focused (3), Moderate (8), Busy (15)
- Pro tip about additional settings available in Settings menu

### 2. Skip-Heavy UX
- **Skip button** visible in top-right corner on all screens
- **Skip button** also in bottom-left footer
- Users can skip at any time without penalty
- Skipping saves default preferences automatically

### 3. User Preferences Storage

#### Database Schema
New table: `onboarding_status`
```sql
- id: uuid (primary key)
- user_id: uuid (references auth.users)
- completed: boolean (default false)
- completed_at: timestamp
- week_starts_monday: boolean (default true)
- max_tasks_per_day: integer (default 8)
- created_at: timestamp
- updated_at: timestamp
```

#### Features:
- Row Level Security (RLS) policies for user privacy
- Unique constraint on user_id (one record per user)
- Automatic timestamp updates via trigger
- Index on user_id for fast lookups

### 4. Integration with Authentication Flow

#### Flow:
1. User signs up or logs in
2. System checks if onboarding is completed
3. If not completed, onboarding modal appears automatically
4. User completes or skips onboarding
5. Preferences are saved to database
6. User lands in Inbox/Today view with default projects

#### Default Projects:
- Life and Work projects are automatically created by existing `ensureDefaultProjects()` function
- Created during first authentication, before onboarding

## Files Created/Modified

### New Files
1. **`/src/types/onboarding.ts`**
   - TypeScript interfaces for onboarding preferences
   - Default preferences constants
   - OnboardingStatus interface

2. **`/src/components/OnboardingModal.tsx`**
   - Three-screen modal component
   - Step-by-step navigation
   - Preference selection UI
   - Progress indicator

3. **`/sql/onboarding_schema.sql`**
   - Database table definition
   - RLS policies
   - Indexes and triggers

### Modified Files
1. **`/src/app/page.tsx`**
   - Added onboarding state management
   - Added onboarding check effect
   - Added handlers for complete/skip
   - Integrated OnboardingModal component

2. **`/src/lib/db.ts`**
   - Added `getOnboardingStatus()` function
   - Added `createOnboardingStatus()` function
   - Added `skipOnboarding()` function

## Database Setup

To enable onboarding in your Supabase project, run the SQL schema:

```bash
# Connect to your Supabase project and run:
psql -h <your-db-host> -U postgres -d postgres < sql/onboarding_schema.sql
```

Or via Supabase Dashboard:
1. Go to SQL Editor
2. Copy contents of `sql/onboarding_schema.sql`
3. Execute the SQL

## User Experience Flow

### New User Flow:
1. Visit dashboard → See auth modal
2. Sign up with email/password or Google OAuth
3. Auth modal closes → Onboarding modal appears automatically
4. Progress through 3 screens (or skip)
5. Complete onboarding → Land in Today view
6. See empty dashboard with Life/Work projects in sidebar
7. Start creating tasks

### Returning User Flow:
1. Visit dashboard → Auto-login from cached session
2. No onboarding modal (already completed)
3. Land directly in last viewed section (or Today)

## Preferences Usage

The onboarding preferences are stored but not yet actively used in the application. Future enhancements could use these preferences for:

- **Week starts on Monday/Sunday**: Calendar views, week planning
- **Max tasks per day**: Warnings when adding too many tasks to a day
- AI planning suggestions based on capacity limits

Currently, preferences are saved and can be retrieved via:
```typescript
const preferences = JSON.parse(localStorage.getItem('onboarding_preferences') || '{}');
```

Or from database:
```typescript
const status = await db.getOnboardingStatus(userId);
console.log(status.week_starts_monday, status.max_tasks_per_day);
```

## Testing Guide

### Manual Testing Steps

#### Test 1: New User Onboarding
1. Clear local storage and cookies
2. Sign up with a new email account
3. Verify onboarding modal appears automatically
4. Click through all 3 screens
5. Select preferences on screen 3
6. Click "Get Started"
7. Verify:
   - Modal closes
   - Today view is shown
   - Life and Work projects exist in sidebar
   - No errors in console

#### Test 2: Skip Functionality
1. Create another new account
2. On screen 1, click "Skip" (top-right X)
3. Verify:
   - Modal closes immediately
   - Default preferences saved
   - User lands in Today view

#### Test 3: Back Navigation
1. Create another new account
2. Navigate to screen 3
3. Click "Back" to screen 2
4. Click "Back" to screen 1
5. Verify all content displays correctly

#### Test 4: Returning User
1. Log out
2. Log back in with account that completed onboarding
3. Verify:
   - Onboarding does NOT appear again
   - User lands in dashboard directly

#### Test 5: Database Persistence
1. Complete onboarding with specific preferences
2. Check Supabase database
3. Verify record exists in `onboarding_status` table
4. Verify preferences match selections

### Database Queries for Testing

```sql
-- View all onboarding records
SELECT * FROM onboarding_status;

-- Check specific user's onboarding
SELECT * FROM onboarding_status WHERE user_id = 'YOUR_USER_ID';

-- Reset onboarding for testing (allows re-onboarding)
DELETE FROM onboarding_status WHERE user_id = 'YOUR_USER_ID';
```

## Accessibility Features

- **Keyboard navigation**: Tab through buttons and inputs
- **ARIA labels**: Skip button has aria-label
- **Focus indicators**: Visible focus states on interactive elements
- **High contrast**: Clear visual hierarchy with dark theme
- **Screen reader friendly**: Semantic HTML structure

## Performance Considerations

- **Lazy loading**: Onboarding modal only renders when `isOpen={true}`
- **Optimistic checks**: Uses local flag to avoid repeated DB queries
- **Minimal re-renders**: State updates batched, useEffect dependencies optimized
- **No animations**: Fast, snappy transitions between screens

## Future Enhancements

1. **Analytics tracking**: Track completion rate, drop-off points
2. **A/B testing**: Test different copy, screen orders
3. **Personalization**: Custom recommendations based on user type
4. **Progressive onboarding**: Tutorial tooltips for advanced features
5. **Sample data**: Optional "Add sample tasks" button
6. **Video tutorials**: Embedded walkthrough videos
7. **Interactive demo**: Click-through simulation of features

## Acceptance Criteria ✅

- [x] Onboarding shown only for new users
- [x] 2-3 screens max (implemented 3 screens)
- [x] Default projects explained (Life/Work)
- [x] Inbox concept explained
- [x] Focus Mode explained
- [x] Kanban workflow explained
- [x] User preferences captured (week start, max tasks)
- [x] Skip available anytime (X button + Skip button)
- [x] Preferences saved to database
- [x] User lands in Inbox/Today view after completion
- [x] Default projects automatically created

## Notes

- The onboarding flow is non-blocking and can be skipped entirely
- Default preferences are sensible (Monday start, 8 tasks/day)
- Database schema includes future-proof fields (created_at, updated_at)
- RLS policies ensure users can only see/edit their own onboarding status
- Integration is minimal and doesn't disrupt existing user flows
