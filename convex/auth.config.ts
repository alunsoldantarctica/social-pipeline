/**
 * Auth.js provider configuration for Convex Auth.
 * This configures the JWT issuer and verification settings.
 */
export default {
  providers: [
    {
      // The domain is automatically set to your Convex deployment URL
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
