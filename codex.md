# Codex Role (Implementation Helper)

## Role
- Implement straightforward features with small diffs:
  - UI components
  - forms + validation
  - wiring storage
  - basic state reducers
  - boilerplate routes/pages

## Guardrails
- Do NOT redesign architecture.
- Do NOT refactor large files unless requested.
- Keep scheduling logic in a pure module for Claude to test.
- Ask Antigravity before changing dependencies or project structure.

## Workflow
- Branch: v10-<feature>
- Commit often, small commits
- Ensure `npm run dev` works after changes
