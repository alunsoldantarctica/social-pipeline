import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
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

export default http;
