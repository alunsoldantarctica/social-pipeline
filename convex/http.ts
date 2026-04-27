import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { auth } from "./auth";
import { timingSafeEqual } from "./lib/timingSafeEqual";

/**
 * Convex HTTP router with authentication routes.
 *
 * This adds the following endpoints:
 * - /.well-known/openid-configuration (JWT verification)
 * - /.well-known/jwks.json (JSON Web Key Set)
 * - /api/auth/* (OAuth callbacks and sign-in/out)
 */
const http = httpRouter();

// Add all Convex Auth HTTP routes (OAuth callbacks, etc.)
auth.addHttpRoutes(http);

// Internal endpoint for logging OTP/security code emails sent by the auth provider.
// Secured with the AUTH_RESEND_KEY bearer token.
http.route({
  path: "/api/internal/log-otp-email",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authHeader = request.headers.get("Authorization");
    const expectedToken = process.env.AUTH_RESEND_KEY;
    if (!expectedToken || !authHeader?.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401 });
    }
    const token = authHeader.slice(7);
    if (!timingSafeEqual(token, expectedToken)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await request.json();
    await ctx.runMutation(internal.lib.emailLogger.logSentEmail, {
      recipientEmail: body.recipientEmail,
      to: body.to,
      from: body.from,
      subject: body.subject,
      category: "security_code" as const,
      resendId: body.resendId,
      htmlBody: body.htmlBody,
      textBody: body.textBody,
    });

    return new Response("OK", { status: 200 });
  }),
});

// Public newsletter subscribe endpoint — adds email to the configured Resend audience.
// Returns 503 if Resend isn't configured, 400 on invalid input, 200 on success.
http.route({
  path: "/api/subscribe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const origin = request.headers.get("Origin") ?? "*";
    const corsHeaders = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
    };

    let email: string;
    try {
      const body = await request.json();
      email = (body?.email ?? "").trim().toLowerCase();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "Invalid email" }), { status: 400, headers: corsHeaders });
    }

    const audienceId = await ctx.runQuery(api.siteSettings.getNewsletterAudienceId, {});
    if (!audienceId) {
      return new Response(JSON.stringify({ error: "Newsletter not configured" }), { status: 503, headers: corsHeaders });
    }

    const apiKey = process.env.AUTH_RESEND_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Newsletter not configured" }), { status: 503, headers: corsHeaders });
    }

    const res = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!res.ok) {
      console.error("Resend subscribe error", res.status, await res.text());
      return new Response(JSON.stringify({ error: "Subscription failed" }), { status: 502, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
  }),
});

http.route({
  path: "/api/subscribe",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => {
    const origin = request.headers.get("Origin") ?? "*";
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

export default http;
