# Antigravity (Architect + Release Manager)

## Role
- Split work into small branches, integrate safely, keep MVP scope tight.

## Branch naming
- v10-<feature>
Examples:
- v10-task-crud
- v10-scheduler-core
- v10-today-timeline
- v10-now-panel
- v10-tests-scheduler

## Integration checklist
- [ ] Install deps clean
- [ ] Lint passes
- [ ] Unit tests pass
- [ ] App runs locally
- [ ] README updated (run + storage + heuristic)
- [ ] Small commits with clear messages

## Definition of Done (MVP)
- Task CRUD working + persistence
- Generate Today Plan works
- Now panel recommends next task
- Tests for scheduling/selection pass
