# Backed-up WIP: "router-engine" unified-router prototype (2026-10-01)

Set aside during the relay-routing work. This was an **abandoned, non-functional
prototype** that claimed (in `LLM_ROUTING_MIGRATION.md`) to replace `ai-modules`,
but in reality:

- `router-engine.ts` used a hardcoded placeholder model catalog (coze/doubao/
  claude/deepseek/local_llama) that does not match the project's real endpoints,
  and its health monitor was `setTimeout` + `Math.random()` (mock).
- `api-chat-route.ts` (was `src/app/api/chat/route.ts`) had every adapter
  `throw 'not implemented'`, a syntax error (`async () => throw …`) that broke
  `pnpm ts-check`, and **no caller** — the frontend uses `/api/chat/stream`.
- `generate-image-route.ts.modified` was a half-finished refactor with ~20 type
  errors (also broke ts-check).
- `llm-router.test.ts.modified` had been repointed from the real `../llm-router`
  to the mock `../router-engine`; the live test was restored to HEAD.

The production routing system (`src/lib/ai-modules/*` + `src/lib/llm-router.ts`
via `/api/chat/stream`) was kept and extended with the relay provider instead.

## Files
- `router-engine.ts.bak`            ← src/lib/router-engine.ts
- `api-chat-route.ts.bak`           ← src/app/api/chat/route.ts
- `LLM_ROUTING_MIGRATION.md.bak`    ← docs/LLM_ROUTING_MIGRATION.md
- `llm-router.test.ts.modified.bak` ← src/lib/__tests__/llm-router.test.ts (pre-restore)
- `generate-image-route.ts.modified.bak` ← src/app/api/generate-image/route.ts (pre-restore)

## To restore any of them
Copy back to the original path and drop the `.bak` suffix. Note they will
re-break `pnpm ts-check`/`lint` until the type/syntax errors above are fixed.
