---
description: Plan a task the way CLAUDE.md requires - analyze, ask, write tasks/todo.md, wait
argument-hint: <task description>
---

Task: $ARGUMENTS

Do NOT write or edit any code yet.

1. Explore the real code for every area this touches (server, prisma, renderer/main, web, landing, infra). Point to the files and patterns you will follow.
2. Ask every clarifying question you need: numbered, one line each, max 7. Design or architecture decisions must be questions, not assumptions.
3. Write the plan to `tasks/todo.md` with checkable items, covering:
   - files to change per area, and which areas need a version bump
   - schema changes (PostgreSQL and/or SQLite), additive only, plus the feature flag (default = current behaviour)
   - POS compatibility (N-1) and offline behaviour
   - tests and how you will verify (staging, hardware, both store modes)
   - rollout order and rollback
4. Stop and wait for my explicit approval.
