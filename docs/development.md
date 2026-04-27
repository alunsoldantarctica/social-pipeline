# Development

Lint, tests, CI, and the Claude Code on the web SessionStart hook.

## Scripts

```bash
pnpm dev          # Astro dev server on :4321
pnpm build        # Astro build (outputs Cloudflare Workers bundle)
pnpm preview      # Preview the production build locally
pnpm typecheck    # tsc --noEmit
pnpm lint         # biome check .
pnpm lint:fix     # biome check --write .
pnpm format       # biome format --write .
pnpm test         # vitest run
pnpm test:watch   # vitest in watch mode
```

`pnpx convex dev` runs separately in its own terminal — it generates `convex/_generated/` (gitignored) and watches schema changes.

## Lint and format — Biome

`biome.json` at the repo root. Defaults:

- 2-space indent, line width 100, LF line endings.
- Double quotes, trailing commas, semicolons, parens around arrow params.
- `recommended` linter rules with a few opt-outs for the Convex idiom (`noNonNullAssertion: off`, `noExplicitAny: off`, `useImportType: warn`, `noUnusedImports: warn`).
- Ignores `convex/_generated/`, `dist/`, `.astro/`, `node_modules/`, `.wrangler/`.

## Tests

Vitest config at `vitest.config.ts`. Two test directories:

### `tests/unit/` — pure-function tests

No Convex runtime, no `_generated/`. These run anywhere `vitest` runs.

| File | Covers |
|---|---|
| `parseNewsletterDraft.test.ts` | newsletter section parser — subject/preview/body extraction, fallbacks, ordering |
| `zernioFormat.test.ts` | `formatForPlatform` per format + `extractPostIds` shape variants |
| `instructionsResolver.test.ts` | `getDefaultInstruction(stage, format?)` returns the right constant per slot |
| `contentSafety.test.ts` | `sanitizeDraft`, `validateDraftForPublication`, prompt-injection redaction, date-token substitution |
| `slugify.test.ts` | URL slug edge cases |
| `timingSafeEqual.test.ts` | constant-time comparison |
| `buildMetaPrompt.test.ts` | niche-generator meta-prompt assembly — niche injection, conditional website extract, defaults embedded, hard-rule preservation |

### `tests/convex/` — convex-test integration tests

Use the official `convex-test` harness. Need `convex/_generated/` to exist before they'll load — first `pnpx convex dev` once.

| File | Covers |
|---|---|
| `editorialRules.test.ts` | CRUD, `listActive` filtering, `reorder` swap |
| `agentInstructions.test.ts` | resolver fallback, `useDefault` precedence, `(stage, format)` row scoping |
| `nicheApply.test.ts` | lock-aware apply — write-on-empty, overwrite-on-default, skip-on-custom, force-overwrites-custom, slot scoping |

### Adding tests

Pure functions: drop a `.test.ts` in `tests/unit/`, follow the existing patterns. Vitest globals are off (`globals: false` in config) — import `describe`, `it`, `expect` from `vitest`.

Convex functions: pattern in `tests/convex/*`:

```ts
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";

const t = convexTest(schema);

// Public function:
const result = await t.query(api.foo.bar, { arg: "x" });

// Internal function:
const result = await t.mutation(internal.admin.foo._internalThing, { ... });

// Admin-auth functions need an identity:
await t
  .withIdentity({ subject: "user-id" })
  .mutation(api.admin.foo.protected, { ... });

// Direct DB poking:
await t.run(async (ctx) => {
  await ctx.db.insert("table", { ... });
});
```

## CI — GitHub Actions

`.github/workflows/ci.yml` runs on push to `main` and pull requests:

```
checkout → pnpm install → convex codegen → lint → typecheck → test → build
```

Required repo secrets:

| Secret | Purpose |
|---|---|
| `CONVEX_DEPLOY_KEY` | Lets `convex codegen` authenticate. Generate from Convex dashboard → Settings → Deploy Keys. Without this, codegen is skipped and the typecheck step fails on `convex/*` imports. |
| `PUBLIC_CONVEX_URL` (optional) | Used by the `pnpm build` step. Falls back to a placeholder if unset. |
| `SITE_URL` (optional) | Used by `astro.config.mjs`. Falls back to a placeholder if unset. |

Deploy steps are deliberately **not** wired — add them when you're ready (`pnpx convex deploy`, `wrangler deploy`).

## Claude Code on the web — SessionStart hook

`.claude/hooks/session-start.sh` runs at session start in web sessions (`CLAUDE_CODE_REMOTE=true`):

1. `pnpm install --prefer-offline` — installs deps. Idempotent across sessions; pnpm reuses its store.
2. If `CONVEX_DEPLOY_KEY` or `CONVEX_DEPLOYMENT` is set, `pnpm exec convex codegen --typecheck disable` — generates `convex/_generated/` so `pnpm typecheck` works.

Local sessions (no `CLAUDE_CODE_REMOTE`) exit early — installs are typically handled by the developer.

Registered in `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh"
          }
        ]
      }
    ]
  }
}
```

Synchronous mode: session boots wait for the hook to finish. Trade-off is slower start; benefit is no race between agent edits and missing deps. To switch to async (faster boots; the hook runs in background), edit the script's first non-comment line to:

```bash
echo '{"async": true, "asyncTimeout": 300000}'
```

## Convex codegen

`pnpx convex dev` (long-running) generates types incrementally as you edit. For one-shot generation:

```bash
pnpm exec convex codegen --typecheck disable
```

Required env: `CONVEX_DEPLOY_KEY` or a logged-in `~/.convex` config.

## Common pitfalls

- **Strict schema validation** — Convex defaults to strict. If you write a field that isn't in the schema, the mutation throws at runtime. The audit found a few pre-existing cases of this in `siteSettings` and `articleWorkflows` (extracted from a wider production schema). See [multi-tenant.md](multi-tenant.md#pre-existing-schema-strict-mode-mismatches).
- **`internal.notifications` is referenced but the module doesn't exist** — the workflow's review-notification calls are wrapped in try/catch so they don't crash, but typecheck will fail. Stub the module if you want the green check.
- **`@convex-dev/agent` is pinned to a `pkg.pr.new` URL** — not a regular npm package. Make sure your install environment can fetch from `pkg.pr.new`.
- **Tests in `tests/convex/` fail to load with module errors** — `convex/_generated/` doesn't exist yet. Run `pnpx convex dev` once.

## Repo layout

```
.claude/
├── hooks/session-start.sh       # SessionStart hook
└── settings.json                 # Hook registration

.github/workflows/ci.yml          # CI: typecheck/lint/test/build

biome.json                        # Biome lint + format config
vitest.config.ts                  # Vitest config

src/
├── pages/                        # Astro pages
├── layouts/                      # Astro layouts
├── components/
│   ├── astro/                    # Astro-only components
│   └── react/                    # React islands (admin UI lives here)
├── lib/                          # Client-side utilities
├── styles/
└── index.css                     # Tailwind + @fontsource imports

convex/
├── schema/                       # Table definitions, split by area
├── agents/                       # Agent runtime: runner, instructions, resolver, format adapters
├── admin/                        # Admin functions: pipeline, prompts, niche, publishing, etc.
├── workflows/                    # Durable workflow definitions
├── catalog/                      # Model registry + cost tracking
├── lib/                          # Server-side utilities (auth, AI gateway, slugify, ...)
├── migrations/                   # Idempotent run-once migrations
├── _generated/                   # Generated by `convex dev` (gitignored)
├── auth.ts / auth.config.ts      # Convex Auth config
├── http.ts                       # HTTP routes (auth callbacks, internal endpoints)
└── crons.ts                      # Scheduled jobs

docs/                             # This directory
tests/
├── unit/                         # Pure-function tests
└── convex/                       # convex-test integration tests
```
