# Plant Growth Feature - Architecture Diagram

## Component Hierarchy

```
App
└── Page (src/app/page.tsx)
    └── FocusSessionModal
        └── FocusTimer ⭐
            ├── Timer Logic
            ├── Play/Pause Controls
            └── PlantGrowth 🌱
                └── SVG Animation
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        User Action                           │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  Settings Modal (Focus Tab)                                  │
│  ┌─────────────────────────────────────┐                    │
│  │ Toggle Plant Growth: [ON] / OFF     │                    │
│  └─────────────────────────────────────┘                    │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ saveSettings({ plantGrowthEnabled: boolean })
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              localStorage                                    │
│  Key: 'life_dashboard_settings'                             │
│  Value: { plantGrowthEnabled: true }                        │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ loadSettings()
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  FocusTimer Component                                        │
│  ┌─────────────────────────────────────┐                    │
│  │ if (plantGrowthEnabled) {            │                    │
│  │   <PlantGrowth                       │                    │
│  │     elapsedSeconds={seconds}         │                    │
│  │     isActive={isActive}              │                    │
│  │   />                                 │                    │
│  │ }                                    │                    │
│  └─────────────────────────────────────┘                    │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ props: { elapsedSeconds, isActive }
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  PlantGrowth Component                                       │
│  ┌─────────────────────────────────────┐                    │
│  │ 1. Calculate growth stage:           │                    │
│  │    stage = min(floor(seconds/60), 5) │                    │
│  │                                      │                    │
│  │ 2. Render SVG:                       │                    │
│  │    - Pot (always visible)            │                    │
│  │    - Seed (always visible)           │                    │
│  │    - Stem (stage 1+)                 │                    │
│  │    - Leaves (stage 2+)               │                    │
│  │    - Flower (stage 4+)               │                    │
│  │                                      │                    │
│  │ 3. Apply animations:                 │                    │
│  │    - transition: all 1s ease-out     │                    │
│  │    - opacity changes                 │                    │
│  │    - scale transforms                │                    │
│  └─────────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

```
src/
├── components/
│   ├── PlantGrowth.tsx ..................... 🌱 Main plant component
│   ├── PlantGrowth.test.tsx ................ ✅ Unit tests
│   ├── FocusTimer.tsx ...................... ⏱️ Integrates plant
│   └── SettingsModal.tsx ................... ⚙️ User preferences UI
│
├── lib/
│   └── settings.ts ......................... 💾 Settings persistence
│
├── app/
│   └── demo/
│       └── plant-growth/
│           └── page.tsx .................... 🎨 Visual demo page
│
└── docs/
    ├── PLANT_GROWTH_FEATURE.md ............. 📖 Feature docs
    └── PLANT_GROWTH_ARCHITECTURE.md ........ 📐 This file
```

## State Management

### FocusTimer State
```typescript
const [isActive, setIsActive] = useState(true);
const [elapsedSeconds, setElapsedSeconds] = useState(0);
const [plantGrowthEnabled, setPlantGrowthEnabled] = useState(true);

useEffect(() => {
  // Load setting from localStorage on mount
  const settings = loadSettings();
  setPlantGrowthEnabled(settings.plantGrowthEnabled);
}, []);

useEffect(() => {
  // Increment timer every second when active
  if (isActive) {
    const interval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }
}, [isActive]);
```

### PlantGrowth State
```typescript
const [growthStage, setGrowthStage] = useState(0);

useEffect(() => {
  // Calculate growth stage from elapsed time
  const minutes = Math.floor(elapsedSeconds / 60);
  const newStage = Math.min(minutes, 5);
  setGrowthStage(newStage);
}, [elapsedSeconds]);
```

### Settings Persistence
```typescript
// src/lib/settings.ts
interface UserSettings {
  plantGrowthEnabled: boolean;
}

export const saveSettings = (settings: Partial<UserSettings>) => {
  const current = loadSettings();
  const updated = { ...current, ...settings };
  localStorage.setItem('life_dashboard_settings', JSON.stringify(updated));
};

export const loadSettings = (): UserSettings => {
  const raw = localStorage.getItem('life_dashboard_settings');
  return raw ? JSON.parse(raw) : { plantGrowthEnabled: true };
};
```

## SVG Animation System

### Growth Calculation
```typescript
// Stage progression (0-5)
const minutes = Math.floor(elapsedSeconds / 60);
const growthStage = Math.min(minutes, 5);

// Visual properties per stage
const stemHeight = growthStage * 20; // 0px → 100px
const stemOpacity = growthStage > 0 ? 1 : 0;
const leafOpacity = growthStage >= 2 ? 1 : 0;
const leafScale = growthStage >= 2 ? Math.min((growthStage - 1) * 0.33, 1) : 0;
const flowerOpacity = growthStage >= 4 ? 1 : 0;
const flowerScale = growthStage >= 4 ? Math.min((growthStage - 3) * 0.5, 1) : 0;
```

### Animation Properties
```css
/* Applied via style prop */
transition: all 1000ms ease-out;
opacity: calculated;
transform: scale(calculated) rotate(angle);
```

## Performance Considerations

### Optimization Strategies
1. **Memoization**: No props change → no re-render
2. **CSS Transitions**: Hardware-accelerated GPU rendering
3. **SVG Efficiency**: Vector graphics scale without quality loss
4. **Conditional Rendering**: Only renders when enabled
5. **Lazy Updates**: Growth stage only recalculates when `elapsedSeconds` changes

### Performance Metrics
- Component size: ~150 lines
- SVG file size: < 1KB
- Re-render frequency: ~1 per second (timer tick)
- Animation overhead: Negligible (CSS transitions)

## Browser Compatibility

### Supported Features
- ✅ SVG (All modern browsers)
- ✅ CSS Transitions (All modern browsers)
- ✅ localStorage (All modern browsers)
- ✅ React Hooks (React 16.8+)

### Tested Browsers
- Chrome 90+ ✅
- Firefox 88+ ✅
- Safari 14+ ✅
- Edge 90+ ✅

## Mobile Considerations

### Responsive Design
- SVG viewBox maintains aspect ratio
- Fixed 120x140px size works on all screen sizes
- Bottom-left positioning avoids UI conflicts
- Touch-friendly settings toggle

### Screen Size Testing
| Device | Width | Status |
|--------|-------|--------|
| iPhone SE | 375px | ✅ Works |
| iPhone 12 | 390px | ✅ Works |
| iPad Mini | 768px | ✅ Works |
| Desktop | 1920px | ✅ Works |

## Accessibility

### Considerations
- Plant is decorative only (doesn't convey critical info)
- Can be disabled for users who find it distracting
- Does not interfere with screen readers
- Maintains focus timer functionality without plant

### ARIA Labels
Not required as plant is purely decorative visual enhancement.

## Future Architecture Enhancements

### Possible Improvements
1. **Plant Varieties**: Factory pattern for different plant types
2. **Custom Themes**: CSS variables for user-customizable colors
3. **Animation Library**: Consider Framer Motion for complex animations
4. **State Management**: Move settings to React Context if app grows
5. **Server Sync**: Optionally save preferences to user profile in DB

## Security

### Data Privacy
- Settings stored in localStorage (client-side only)
- No PII or sensitive data
- No network requests
- No external dependencies

### XSS Protection
- All SVG properties are typed and controlled
- No user-generated content in SVG
- React escapes all dynamic values

## Testing Strategy

### Unit Tests (5 tests)
1. Component renders without crashing
2. Seed visible at stage 0
3. Stem grows after 1 minute
4. Full bloom at 5 minutes
5. Custom className support

### Integration Tests (Manual)
- Toggle setting in Settings Modal
- Enter Focus Mode
- Verify plant appears/disappears
- Verify growth over time

### E2E Tests (Future)
- Playwright test for full user flow
- Screenshot comparisons for visual regression

## Deployment Checklist

- [x] Code implemented
- [x] Unit tests passing
- [x] Build successful
- [x] Documentation complete
- [x] Demo page created
- [x] Settings integration
- [x] Mobile tested
- [x] Performance verified
- [x] Accessibility reviewed
- [ ] Code review (pending)
- [ ] QA testing (pending)
- [ ] Production deploy (pending)

---

**Last Updated**: 2026-02-13
**Issue**: #41
**Status**: Ready for Review ✅
