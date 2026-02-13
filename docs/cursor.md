# Cursor.md - Quick Reference

> **Read this first. Quick navigation, not explanations.**

## 🚫 Critical Rules
- ❌ **NO MD files in root** (except README.md, cursor.md, antigravity.md)
- ✅ **All plans go in `.plans/`** (gitignored)
- ✅ **Follow integration checklist** before merge

## 🌿 Branch Workflow
- **Naming**: `v10-<feature>` (e.g., `v10-dark-mode`, `v10-kanban-board`)
- **Process**: Create branch → Implement → Test → Checklist → PR → Merge

## ✅ Integration Checklist (Before Merge)
- [ ] `npm install` (clean deps)
- [ ] `npm run lint` (passes)
- [ ] `npm test` (passes)
- [ ] `npm run dev` (runs locally)
- [ ] README updated (if feature added)
- [ ] No new MD files in root

## 👥 Team Roles
- **Me (Antigravity)**: Orchestrate, coordinate, manage releases
- **Claude**: Code implementation (when CLI works, otherwise implement directly)
- **Codex**: Testing, verification (when CLI works, otherwise test directly)

## 📁 Project Structure
```
src/app/          # Next.js pages
src/components/   # React components
src/lib/          # Utilities & services
src/hooks/        # Custom hooks
src/types/        # TypeScript types
.plans/           # Planning docs (gitignored) ⚠️
```

## 🔧 Commands
```bash
npm run dev      # Start dev server
npm run build    # Build for production
npm run lint     # Run linter
npm test         # Run tests
```

## 🌍 Env Vars
**Required**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`  
**Optional**: `GITHUB_APIKEY`, `GITHUB_REPO`

## 🔄 Quick Workflow
1. Read this file
2. Create branch `v10-<feature>`
3. Implement (use Claude CLI if working, otherwise code directly)
4. Test (use Codex CLI if working, otherwise test directly)
5. Run checklist
6. PR → Merge → Deploy

## 💡 Notes
- **Claude/Codex CLI**: Currently not working smoothly. Implement/test directly until CLI is configured.
- **Planning**: Complex plans → `.plans/` folder
- **Scope**: Keep it tight, MVP focus
