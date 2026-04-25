import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { ResendOTP } from "./ResendOTP";

/**
 * Convex Auth configuration with Google OAuth and Email OTP providers.
 *
 * Required environment variables (set in Convex dashboard):
 * - AUTH_GOOGLE_ID: Google OAuth Client ID
 * - AUTH_GOOGLE_SECRET: Google OAuth Client Secret
 * - AUTH_RESEND_KEY: Resend API key for email OTP
 *
 * Google OAuth callback URL (configure in Google Cloud Console):
 * https://<your-convex-deployment>.convex.site/api/auth/callback/google
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    // Primary: Google OAuth (branded, one-click sign-in)
    Google,

    // Fallback: Email OTP via Resend (passwordless)
    ResendOTP,
  ],
  callbacks: {
    /**
     * Called when creating or updating a user after authentication.
     * Extracts name and image from OAuth profile data.
     */
    async createOrUpdateUser(ctx, { existingUserId, profile }) {
      const profileObj = profile && typeof profile === "object" ? profile as Record<string, unknown> : undefined;
      const profileName = profileObj?.name as string | undefined;
      const profileImage = profileObj?.image as string | undefined;
      const profileEmail = profileObj?.email as string | undefined;

      // If user exists, update their profile if we have new data
      if (existingUserId) {
        if (profileName || profileImage) {
          await ctx.db.patch(existingUserId, {
            ...(profileName ? { name: profileName } : {}),
            ...(profileImage ? { image: profileImage } : {}),
          });
        }
        return existingUserId;
      }

      // Prevent duplicates: check for existing user by email before creating
      // The auth library only matches users with emailVerificationTime set,
      // so pre-existing or unverified users would be missed without this check.
      if (profileEmail) {
        const existing = await ctx.db
          .query("users")
          // @ts-ignore - auth email lookup
          .withIndex("email", (q) => q.eq("email", profileEmail))
          .unique();
        if (existing) {
          await ctx.db.patch(existing._id, {
            ...(profileName ? { name: profileName } : {}),
            ...(profileImage ? { image: profileImage } : {}),
          });
          return existing._id;
        }
      }

      // Create new user with profile data
      return await ctx.db.insert("users", {
        email: profileEmail,
        name: profileName,
        image: profileImage,
      });
    },
  },
});
