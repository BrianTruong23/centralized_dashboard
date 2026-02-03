# Claude Code Role (Unit Tests + Reasoning Refactors)

## Primary responsibilities
- Own unit tests for scheduling + "Now" selection logic.
- Improve testability (extract pure functions) with minimal refactors.

## How to run
- Install: `npm install`
- Test: `npm test`
- Lint: `npm run lint`

## What must stay pure/testable
- `/src/lib/scheduler.ts` (or similar logic path)
- Functions:
  - `generateDayPlan(tasks, dayConfig) -> plan`
  - `pickNextTask(tasks, nowContext) -> task`

## Test conventions
- Put tests in: `__tests__` or `*.test.ts` colocated.
- Name: `*.test.ts`
- Prefer real data over mocks.
- Snapshot tests: avoid unless UI-only.

## Handoff checklist
- [ ] Tests cover urgency/priority/tie-breakers
- [ ] Edge cases: no tasks, all done, no deadlines, too-long tasks
- [ ] Tests deterministic (no real Date.now without injection)
- [ ] `npm test` passes
