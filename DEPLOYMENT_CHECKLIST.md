# Auto-Plan My Week - Deployment Checklist

## Pre-Deployment Steps

### 1. Database Migration ✅ Required
Run the SQL migration in your Supabase project:

```bash
# Copy the contents of weekly_plans_schema.sql
# Paste into Supabase SQL Editor
# Execute the entire script
```

**What this does:**
- Creates `weekly_plans` table
- Creates `weekly_plan_items` table
- Creates `activity_log` table
- Adds new columns to `tasks` table (source, suggested_start, suggested_end, planning_week_id, planning_metadata)
- Sets up RLS policies
- Creates indexes for performance

**Verification:**
```sql
-- Verify tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('weekly_plans', 'weekly_plan_items', 'activity_log');

-- Verify new columns on tasks table
SELECT column_name FROM information_schema.columns
WHERE table_name = 'tasks'
AND column_name IN ('source', 'suggested_start', 'suggested_end', 'planning_week_id', 'planning_metadata');
```

### 2. Environment Variables
No new environment variables required. Feature uses existing Supabase configuration.

### 3. Dependencies
No new dependencies added. Feature uses existing packages:
- `date-fns` (already in package.json)
- `lucide-react` (already in package.json)

### 4. Build Verification ✅ Passed
```bash
npm run build
```
Expected output: Should compile successfully with `/api/plan` route detected.

### 5. Test Suite ✅ Passed
```bash
npm test -- __tests__/weeklyPlanner.test.ts
```
Expected: 17/17 tests passing

## Deployment

### Option A: Vercel (Recommended)

1. Push code to repository
2. Vercel will auto-deploy
3. Run database migration in Supabase (see step 1)
4. Verify feature works in production

### Option B: Manual Deploy

1. Run `npm run build`
2. Deploy build artifacts
3. Run database migration
4. Restart server

## Post-Deployment Verification

### 1. Visual Check
- [ ] Home page loads without errors
- [ ] "Auto-Plan My Week" button is visible
- [ ] Button has sparkles icon and indigo styling
- [ ] Button is positioned between day plan and daily notes

### 2. Functional Check
- [ ] Click "Auto-Plan My Week" button
- [ ] Wizard opens with constraint form
- [ ] Fill in goals and constraints
- [ ] Click "Generate Plan"
- [ ] Plan preview displays with tasks
- [ ] Can edit plan items
- [ ] Click "Create Tasks + Plan" or "Create Tasks Only"
- [ ] Tasks are created and visible in task list
- [ ] Tasks show `source: 'agent'` badge (if you add UI for it)

### 3. Database Check
```sql
-- Verify plan was created
SELECT * FROM weekly_plans ORDER BY created_at DESC LIMIT 1;

-- Verify plan items were created
SELECT * FROM weekly_plan_items ORDER BY created_at DESC LIMIT 10;

-- Verify activity log entries
SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 10;

-- Verify tasks were created with agent source
SELECT id, text, source, suggested_start, suggested_end
FROM tasks
WHERE source = 'agent'
ORDER BY created_at DESC
LIMIT 10;
```

### 4. Performance Check
- [ ] Plan generation completes in < 2 seconds
- [ ] UI remains responsive during generation
- [ ] No console errors or warnings
- [ ] Page load time acceptable

### 5. Error Handling Check
- [ ] Try generating plan without goals → Should show error
- [ ] Try with end date before start date → Should show warning
- [ ] Try with no available tasks → Should show empty state
- [ ] Try with very large task list (50+ tasks) → Should handle gracefully

## Rollback Plan

If issues are encountered:

### Quick Rollback (No Data Loss)
1. Revert code deployment to previous version
2. Keep database changes (they're additive and won't break existing functionality)

### Full Rollback (If Database Issues)
```sql
-- Remove new columns from tasks (optional, not required)
ALTER TABLE tasks
  DROP COLUMN IF EXISTS source,
  DROP COLUMN IF EXISTS suggested_start,
  DROP COLUMN IF EXISTS suggested_end,
  DROP COLUMN IF EXISTS planning_week_id,
  DROP COLUMN IF EXISTS planning_metadata;

-- Drop new tables (will lose plan data)
DROP TABLE IF EXISTS weekly_plan_items CASCADE;
DROP TABLE IF EXISTS weekly_plans CASCADE;
DROP TABLE IF EXISTS activity_log CASCADE;
```

**Note:** It's safer to keep the database changes even if rolling back code, as the new columns have defaults and won't break existing queries.

## Known Issues / Edge Cases

### Non-Breaking
1. **Timezone Handling:** Uses browser local timezone. Users traveling might see unexpected times.
   - **Impact:** Low - Suggested times are just hints
   - **Workaround:** User can edit times in preview

2. **Large Task Lists:** Not tested with 1000+ tasks
   - **Impact:** Low - Most users have < 100 tasks
   - **Workaround:** Algorithm is O(n log n), should handle reasonably well

3. **No Calendar Integration:** Feature doesn't sync with Google Calendar
   - **Impact:** Low - Documented as out of scope for MVP
   - **Workaround:** Users can manually add to calendar

### Breaking (None Expected)
No breaking changes. All database changes are additive.

## Monitoring

### Metrics to Watch
1. **API Performance:**
   - `/api/plan` response time (should be < 500ms)
   - Error rate (should be < 1%)

2. **User Engagement:**
   - Click rate on "Auto-Plan My Week" button
   - Plan approval rate vs discard rate
   - Task completion rate for agent-created tasks vs user-created

3. **Database:**
   - `weekly_plans` table growth
   - `activity_log` table growth (consider archival after 90 days)

### Error Tracking
Watch for errors in:
- Browser console (client-side errors)
- Server logs (API errors)
- Supabase logs (database errors)

Common errors to watch:
- `crypto.randomUUID is not a function` → Polyfill issue
- RLS policy violations → Permission issues
- Foreign key constraint violations → Data consistency issues

## Support

### User-Facing Issues
Direct users to:
1. Check they're signed in
2. Verify they have at least one task
3. Try refreshing the page
4. Check browser console for errors

### Developer Issues
Check:
1. Database migration ran successfully
2. Supabase environment variables are set
3. RLS policies are enabled
4. Build completed without errors
5. Console logs for helpful error messages

## Success Criteria

Consider deployment successful when:
- [ ] All post-deployment verification steps pass
- [ ] No critical errors in logs (first 24 hours)
- [ ] At least 1 successful plan generation by real user
- [ ] No user-reported bugs (first 48 hours)
- [ ] Performance metrics within acceptable range

## Timeline

- **Day 0:** Deploy to production
- **Day 1:** Monitor closely, check metrics
- **Day 2-7:** Continue monitoring, gather user feedback
- **Week 2:** Review metrics, plan iterations

## Contact

For issues or questions:
- Technical: Check WEEKLY_PLANNER.md for detailed documentation
- Implementation: See IMPLEMENTATION_SUMMARY.md for architecture details
- Testing: Review __tests__/weeklyPlanner.test.ts for test cases

---

**Status:** ✅ Ready for Deployment

**Last Updated:** 2026-02-11

**Prepared By:** Claude (AI Assistant)
