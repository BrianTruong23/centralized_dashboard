# Plant Growth Animation - Focus Mode Feature

## Overview
The Plant Growth Animation is a subtle, calming visual feature that appears during Focus Mode sessions. As users stay focused on their tasks, a small plant grows and blooms, providing gentle visual feedback without being distracting.

## Features

### Visual Progression
The plant grows through 6 stages based on focus time:
- **Stage 0 (0 min)**: Seed in the ground
- **Stage 1 (1 min)**: Small stem begins to grow
- **Stage 2 (2 min)**: Stem grows taller, leaves start to appear
- **Stage 3 (3 min)**: Leaves fully developed
- **Stage 4 (4 min)**: Flower begins to bloom
- **Stage 5 (5+ min)**: Full bloom with petals

### Design Principles
- **Subtle**: Low opacity (40% light mode, 30% dark mode) to avoid distraction
- **Calming**: Smooth transitions with 1-second duration for all growth changes
- **Responsive**: Positioned in bottom-left corner, scales appropriately on mobile
- **Accessible**: Works with both light and dark themes

### User Control
Users can toggle the plant growth animation on/off via:
1. Open Settings (click user avatar)
2. Navigate to "Focus" tab
3. Toggle "Plant Growth Animation" switch

The preference is saved in `localStorage` and persists across sessions.

## Implementation Details

### Components
1. **PlantGrowth.tsx** - The main plant visualization component
   - Uses SVG for crisp rendering at any size
   - Animates based on elapsed seconds
   - Supports light/dark themes via Tailwind CSS

2. **FocusTimer.tsx** - Integrates the plant animation
   - Conditionally renders based on user settings
   - Positioned in bottom-left corner

3. **SettingsModal.tsx** - User preferences UI
   - Added "Focus" tab with plant growth toggle
   - Includes Sparkles icon for visual appeal

### Data Storage
- **src/lib/settings.ts** - Settings persistence layer
  - `UserSettings` interface with `plantGrowthEnabled` flag
  - `saveSettings()` and `loadSettings()` helper functions
  - Uses `localStorage` key: `life_dashboard_settings`

### Technical Stack
- React functional components with hooks
- SVG for vector graphics (scalable, performant)
- Tailwind CSS for styling and theme support
- TypeScript for type safety

## Testing
Unit tests in `PlantGrowth.test.tsx` cover:
- Component rendering
- Growth stages at different time intervals
- Custom className support

Run tests with:
```bash
npm test PlantGrowth.test.tsx
```

## Mobile Optimization
The SVG is sized at 120x140px, which:
- Doesn't interfere with focus timer controls
- Scales well on mobile devices (320px+ width)
- Maintains aspect ratio across screen sizes

## Future Enhancements
Potential future improvements:
- Multiple plant varieties (user can choose)
- Animation speed control
- Different color themes for plants
- Sound effects (optional, off by default)
- Plant "collection" after completed sessions

## Acceptance Criteria Status
✅ Plant growth responds to focus time (1 stage per minute)
✅ Can be turned off in settings (Focus tab toggle)
✅ Doesn't distract (small, subtle, low opacity)
✅ Works on web + mobile (responsive SVG design)
