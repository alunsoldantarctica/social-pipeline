import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";

/**
 * Convex Auth — Google OAuth only.
 *
 * Required env vars (set in Convex dashboard):
 * - AUTH_GOOGLE_ID: Google OAuth Client ID
 * - AUTH_GOOGLE_SECRET: Google OAuth Client Secret
 *
 * Google OAuth callback URL (configure in Google Cloud Console):
 * https://<your-convex-deployment>.convex.site/api/auth/callback/google
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google],
  callbacks: {
    async createOrUpdateUser(ctx, { existingUserId, profile }) {
      const profileObj = profile && typeof profile === "object" ? profile as Record<string, unknown> : undefined;
      const profileName = profileObj?.name as string | undefined;
      const profileImage = profileObj?.image as string | undefined;
      const profileEmail = profileObj?.email as string | undefined;

      if (existingUserId) {
        if (profileName || profileImage) {
          await ctx.db.patch(existingUserId, {
            ...(profileName ? { name: profileName } : {}),
            ...(profileImage ? { image: profileImage } : {}),
          });
        }
        return existingUserId;
      }

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

      return await ctx.db.insert("users", {
        email: profileEmail,
        name: profileName,
        image: profileImage,
      });
    },
  },
});
