import GitHub from "@auth/core/providers/github";
import { convexAuth } from "@convex-dev/auth/server";

/**
 * Convex Auth — GitHub OAuth.
 *
 * Required env vars (set in Convex dashboard):
 * - AUTH_GITHUB_ID: GitHub OAuth App Client ID
 * - AUTH_GITHUB_SECRET: GitHub OAuth App Client Secret
 *
 * GitHub OAuth App callback URL:
 * https://<your-convex-deployment>.convex.site/api/auth/callback/github
 *
 * Create at: GitHub → Settings → Developer Settings → OAuth Apps → New OAuth App
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [GitHub],
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
