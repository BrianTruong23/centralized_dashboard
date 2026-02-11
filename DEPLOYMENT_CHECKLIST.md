# Deployment Checklist - Auto-Plan My Week Feature

## Pre-Deployment

### 1. Database Migration
- [ ] Open Supabase SQL Editor
- [ ] Run `weekly_plans_schema.sql` in full
- [ ] Verify tables created:
  ```sql
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN ('weekly_plans', 'weekly_plan_items', 'plan_activities');
  ```
- [ ] Verify task table columns added:
  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'tasks'
  AND column_name IN ('source', 'suggested_start', 'suggested_end', 'planning_week_id', 'planning_metadata');
  ```
- [ ] Verify RLS policies are enabled:
  ```sql
  SELECT tablename, policyname FROM pg_policies
  WHERE schemaname = 'public'
  AND tablename IN ('weekly_plans', 'weekly_plan_items', 'plan_activities');
  ```

### 2. Code Review
- [ ] Review all new files for security issues
- [ ] Check for hardcoded credentials or secrets
- [ ] Verify error handling is comprehensive
- [ ] Ensure user input is validated
- [ ] Confirm no SQL injection vulnerabilities

### 3. Testing
- [ ] Run test suite: `npm test -- weeklyPlanner.test.ts`
- [ ] Verify all tests pass
- [ ] Manual testing checklist (see below)

### 4. Build Verification
- [ ] Run `npm run build`
- [ ] Verify no TypeScript errors
- [ ] Verify no build warnings
- [ ] Check bundle size is reasonable

## Manual Testing Checklist

### Happy Path
- [ ] Open app, click "Auto-Plan My Week"
- [ ] Enter goals and constraints
- [ ] Click "Generate Plan"
- [ ] Verify plan is generated with tasks
- [ ] Edit a task in the preview
- [ ] Click "Create Tasks + Schedule"
- [ ] Verify tasks appear in task list
- [ ] Verify tasks have `source=agent` in database
- [ ] Verify suggested times are stored

### Edge Cases
- [ ] Try with no pending tasks (should show warning)
- [ ] Try with more tasks than can fit (should show warnings)
- [ ] Try with invalid date range (should show error)
- [ ] Try with very large hours per day (should show error)
- [ ] Try discarding a plan (should close without creating tasks)
- [ ] Try "Create Tasks Only" mode (should create tasks without times)

### UI/UX
- [ ] Test on mobile device
- [ ] Test in dark mode
- [ ] Test in light mode
- [ ] Verify responsive layout
- [ ] Check for UI glitches or overlaps
- [ ] Verify loading states display correctly
- [ ] Verify error messages are clear

### Database Integrity
- [ ] Check weekly_plans table has correct data
- [ ] Check weekly_plan_items table has correct data
- [ ] Check plan_activities table has logs
- [ ] Verify RLS policies work (try accessing another user's plan)
- [ ] Verify cascade deletes work

### Performance
- [ ] Test with 10 tasks
- [ ] Test with 50 tasks
- [ ] Test with 100 tasks
- [ ] Verify API response time < 2 seconds
- [ ] Check for memory leaks (long session)

## Deployment Steps

### 1. Merge to Main
- [ ] Ensure all tests pass
- [ ] Create pull request from `jarvis/issue-26` to `main`
- [ ] Request code review
- [ ] Address review comments
- [ ] Merge PR

### 2. Production Database
- [ ] Backup production database
- [ ] Run `weekly_plans_schema.sql` in production Supabase
- [ ] Verify migration success
- [ ] Test with production auth users

### 3. Deploy Application
- [ ] Deploy to production (Vercel/Netlify/etc.)
- [ ] Verify deployment success
- [ ] Check production logs for errors

### 4. Smoke Testing (Production)
- [ ] Sign in as test user
- [ ] Create a weekly plan
- [ ] Verify plan creation works
- [ ] Check database for correct data
- [ ] Verify activity logs are created

## Post-Deployment

### 1. Monitoring
- [ ] Monitor error logs for first 24 hours
- [ ] Check database query performance
- [ ] Monitor API endpoint latency
- [ ] Watch for user-reported issues

### 2. Documentation
- [ ] Update user-facing documentation
- [ ] Add to features list
- [ ] Create tutorial video (optional)
- [ ] Update changelog

### 3. Analytics
- [ ] Track feature usage
- [ ] Monitor plan creation rates
- [ ] Track approval vs. discard rates
- [ ] Monitor warnings frequency

### 4. User Feedback
- [ ] Collect user feedback
- [ ] Monitor support tickets
- [ ] Track feature requests
- [ ] Identify pain points

## Rollback Plan

If critical issues are found:

### Quick Rollback
1. [ ] Revert deployment to previous version
2. [ ] Database remains intact (no data loss)
3. [ ] Users can't access new feature but old features work

### Database Rollback (if needed)
```sql
-- Only if absolutely necessary
-- BACKUP FIRST!

-- Remove new columns from tasks
ALTER TABLE tasks DROP COLUMN IF EXISTS source;
ALTER TABLE tasks DROP COLUMN IF EXISTS suggested_start;
ALTER TABLE tasks DROP COLUMN IF EXISTS suggested_end;
ALTER TABLE tasks DROP COLUMN IF EXISTS planning_week_id;
ALTER TABLE tasks DROP COLUMN IF EXISTS planning_metadata;

-- Drop new tables
DROP TABLE IF EXISTS plan_activities;
DROP TABLE IF EXISTS weekly_plan_items;
DROP TABLE IF EXISTS weekly_plans;
```

## Success Criteria

The deployment is successful if:
- [ ] No errors in production logs
- [ ] Users can create weekly plans
- [ ] Tasks are created correctly
- [ ] Activity logs are recorded
- [ ] No performance degradation
- [ ] No security issues reported
- [ ] User feedback is positive

## Support Preparation

### Known Limitations
- Planning horizon limited to 14 days
- No calendar integration yet
- Manual refresh needed to see new tasks
- Energy preferences are basic

### Common Questions
1. **Q: How do I edit a plan after creation?**
   A: Edit the individual tasks in the task list.

2. **Q: Can I plan multiple weeks?**
   A: Not yet, max 14 days in MVP.

3. **Q: Why aren't all my tasks scheduled?**
   A: Check warnings for tasks that don't fit. Increase hours/day or split large tasks.

4. **Q: Can I sync with Google Calendar?**
   A: Not in MVP, coming in future update.

### Troubleshooting Guide
1. **Plan won't generate**: Check constraints, ensure dates are valid
2. **Tasks not appearing**: Check if approval was clicked, refresh page
3. **Time blocks missing**: Ensure "Create Tasks + Schedule" was selected
4. **Database errors**: Check RLS policies, verify user is authenticated

## Metrics to Track

### Usage Metrics
- Number of plans generated per day
- Number of plans approved vs. discarded
- Average tasks per plan
- Average hours scheduled per plan
- Most common planning horizons

### Performance Metrics
- API response time (p50, p95, p99)
- Database query latency
- Error rates
- Plan generation success rate

### User Behavior
- Time spent in wizard
- Edit frequency in preview
- "Tasks Only" vs. "Tasks + Schedule" preference
- Task completion rate for agent-created tasks

## Contact

For deployment issues:
- GitHub Issues: https://github.com/BrianTruong23/centralized-dashboard/issues
- Check logs in Vercel/Netlify dashboard
- Review Supabase logs for database issues

## Sign-off

- [ ] Code reviewed and approved
- [ ] Tests passing
- [ ] Database migration successful
- [ ] Deployment successful
- [ ] Smoke tests passed
- [ ] Documentation updated
- [ ] Monitoring in place

**Deployed by:** _________________
**Date:** _________________
**Version:** _________________
