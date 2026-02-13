# AI Agent Architecture (Conversational + Actionable)

## Goal

Provide one conversational agent that can:

- Plan tasks by day/week
- Identify top priorities from Inbox
- Delete selected tasks
- Clear Inbox
- Ask for user confirmation before destructive actions

## High-level flow

1. User opens AI Assistant popup.
2. User enters natural language request.
3. Client classifies request intent:
   - `plan`
   - `prioritize_inbox`
   - `delete_task`
   - `clear_inbox`
4. Agent executes by intent:
   - `plan`: call `/api/auto-plan`, show generated plan, user confirms additions
   - `prioritize_inbox`: rank inbox tasks locally and show top list
   - `delete_task`: show matching candidates, user selects and confirms delete
   - `clear_inbox`: show count preview, user confirms bulk delete
5. Client applies mutations through existing task hooks.
6. UI updates and assistant posts outcome message.

## Components

- `src/components/AiAssistant.tsx`
  - chat-like UI + expanded mode
  - intent routing
  - confirmation UI
- `src/lib/assistantAgent.ts`
  - intent detection
  - inbox ranking
  - delete candidate matching

## Data sources

- Existing task list in client state (`useTasks`)
- Existing project list in client state (`useProjects`)
- Existing planning endpoint (`/api/auto-plan`) for planning responses

## Safety and UX

- Never auto-delete immediately from text command alone.
- Always present candidate list for delete and require explicit confirm.
- Always show task count preview for clear inbox.
- Keep plan insertion explicit through “Add selected tasks”.

## Expandable UI behavior

- Default compact popup for quick interaction.
- Expand toggle switches to larger panel for detailed review.
- Same state/actions preserved across sizes.

## Test coverage

- `src/lib/assistantAgent.test.ts`:
  - intent detection
  - priority ranking behavior
  - delete candidate matching
