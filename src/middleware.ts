import { defineMiddleware } from 'astro:middleware';

// Security headers applied to every response
const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.cloudflareinsights.com",
    "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
    "worker-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.workers.dev https://imagedelivery.net https://images.unsplash.com",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
};

// Paths that need server-side session (read/write).
// Static pages skip session writes so no Set-Cookie is emitted
// and the response can be edge-cached.
const SESSION_PATH_PREFIXES = [
  '/admin',
  '/api',
];

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Apply session only for paths that need it
  const needsSession = SESSION_PATH_PREFIXES.some((p) => pathname.startsWith(p));

  // Admin auth is handled client-side by AdminShell via Convex auth.
  // No server-side session check needed here.
  void needsSession;

  const response = await next();

  // Apply security headers to all responses
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  return response;
});
