#!/bin/bash
# SessionStart hook — primes Claude Code on the web sessions with deps and
# Convex generated types so `pnpm typecheck` works.
#
# Local sessions are exempt — installs are typically handled by the developer.
# The hook is idempotent: pnpm reuses its store between sessions, and convex
# codegen rewrites _generated/* deterministically.

set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

echo "[session-start] installing dependencies..."
pnpm install --prefer-offline

# Generate Convex types so tsc can resolve convex/_generated/api etc.
# Requires CONVEX_DEPLOY_KEY (preferred) or CONVEX_DEPLOYMENT in the web
# session environment. Failure is non-fatal — typecheck will fail loudly
# enough on its own if the types are missing.
if [ -n "${CONVEX_DEPLOY_KEY:-}${CONVEX_DEPLOYMENT:-}" ]; then
  echo "[session-start] generating Convex types..."
  pnpm exec convex codegen --typecheck disable || \
    echo "[session-start] convex codegen failed — typecheck of convex/* will fail until this is fixed"
else
  echo "[session-start] CONVEX_DEPLOY_KEY/CONVEX_DEPLOYMENT not set — skipping Convex codegen"
fi

echo "[session-start] done"
