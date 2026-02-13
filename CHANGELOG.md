# Changelog

## [Unreleased] - 2026-02-13

### Features

#### 1. Daily Notes & History
- **Separation**: Split "Today's Notes" and "Previous Days" into distinct sections for better focus.
- **History Component**: Created `src/components/DailyNotesHistory.tsx` to handle past notes.

#### 2. Login Persistence & Performance
- **Persist Session**: Enabled `persistSession: true` in `src/lib/supabase.ts`. Users now stay logged in across reloads.
- **Optimistic UI**: Implemented synchronous `localStorage` reading in `src/app/page.tsx`. The dashboard now loads instantly for logged-in users, bypassing the initial network wait.

#### 3. Smart Input (Natural Language)
- **Date Parsing**: Typing days (e.g., "Mon", "Friday") automatically sets the due date.
- **Tag Detection**: Typing `#project` (e.g., "#work") automatically sets the project category.
- **Visuals**: Implemented a "transparent overlay" technique in `TaskInput.tsx` to highlight keywords in real-time.
- **Polish**: Fixed text desync issues using negative margin compensation.

#### 4. Activity Log
- **Database Backed**: Created `activity_logs` table to persist user history.
- **Smart Loading**: `ActivityLogModal` now uses a "Cache-First" strategy—loading instantly from local storage while fetching fresh data in the background.
- **UX**: Added "Hang in there..." message for slow connections.

#### 5. Project Management
- **Dynamic Categories**: Replaced hardcoded categories with dynamic Projects.
- **Refactoring**: Updated schemas and components to link Tasks to `project_id`.

### Fixes
- **Build System**: Resolved `lightningcss` and Next.js build errors.
- **Styling**: Fixed "Summarize with AI" button styling to match app theme (Black/White).
- **Navigation**: Fixed Bottom-Left Settings button not clicking.
- **Filters**: Fixed filter dropdown logic and added loading states.
