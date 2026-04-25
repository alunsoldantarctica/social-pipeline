# Migrating from Astro to Next.js

This scaffold uses Astro 6 with the Cloudflare Workers adapter. If you prefer Next.js, here's what changes.

## What changes

### 1. Adapter swap

**Astro (current)**:
```js
// astro.config.mjs
import cloudflare from '@astrojs/cloudflare';
adapter: cloudflare({ sessionKVBindingName: 'SESSION' })
```

**Next.js on Vercel**:
```js
// next.config.mjs
// No adapter needed for Vercel — deploy with `vercel`
```

**Next.js on Cloudflare Workers** (via `@cloudflare/next-on-pages`):
```bash
pnpm add @cloudflare/next-on-pages
# Add to next.config.mjs:
import { setupDevPlatform } from '@cloudflare/next-on-pages/next-dev';
```

### 2. Page files

| Astro | Next.js |
|---|---|
| `src/pages/admin/content.astro` | `app/admin/content/page.tsx` |
| `src/pages/blog/[slug].astro` | `app/blog/[slug]/page.tsx` |
| `src/layouts/MainLayout.astro` | `app/layout.tsx` |

### 3. Component hydration

| Astro directive | Next.js equivalent |
|---|---|
| `client:load` | `"use client"` (React Client Component) |
| `client:visible` | `"use client"` + manual Intersection Observer |
| `client:idle` | `"use client"` + `requestIdleCallback` |
| Static (no directive) | React Server Component (default in App Router) |

### 4. Convex wiring

Convex is framework-agnostic. The client setup is identical:

```tsx
// app/providers.tsx
"use client";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConvexAuthNextjsProvider client={convex}>
      {children}
    </ConvexAuthNextjsProvider>
  );
}
```

See: https://labs.convex.dev/auth/framework/nextjs

### 5. Session storage

The current scaffold uses Astro's session KV binding (`SESSION` in wrangler.toml). In Next.js:

- **Vercel**: Use `iron-session` or `next-auth` for session storage
- **Cloudflare Workers via next-on-pages**: KV is still available via Cloudflare bindings

### 6. Middleware

Replace `src/middleware.ts` (Astro middleware) with `middleware.ts` at the Next.js root:

```ts
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Admin auth guard
  if (request.nextUrl.pathname.startsWith('/admin')) {
    // Check session cookie...
  }
  return NextResponse.next();
}
```

### 7. Environment variables

Change `PUBLIC_*` prefix to `NEXT_PUBLIC_*`:

```
# Current (Astro)
PUBLIC_CONVEX_URL=https://...

# Next.js
NEXT_PUBLIC_CONVEX_URL=https://...
```

Update `convex/_generated/` references in your components — they're framework-agnostic.

## What doesn't change

- **All Convex backend code** — `convex/` directory is identical
- **React components** — all `.tsx` files in `src/components/react/` work unchanged
- **Agent runner, schema, migrations, editorial rules** — all Convex-side, zero changes
- **Cloudflare AI Gateway** — server-side in Convex actions, no frontend dependency

## Recommended path

If you're new to this stack, stay with Astro — the Cloudflare adapter integration is pre-configured and the Islands architecture keeps bundle sizes small. Switch to Next.js if you need:
- App Router server components with data fetching
- Next.js-specific features (Image optimization, incremental static regeneration)
- Your team has strong Next.js expertise
