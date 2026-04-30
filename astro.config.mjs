import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// Set SITE_URL in your environment (.env.local for dev, wrangler.toml [vars]
// for production) to your production domain. Falls back to a placeholder so
// `astro build` does not fail when the variable isn't set yet.
const siteUrl = process.env.SITE_URL ?? 'https://your-domain.com';

export default defineConfig({
  site: siteUrl,
  output: 'static',
  trailingSlash: 'never',
  redirects: {
    '/admin': '/admin/content',
  },
  build: {
    inlineStylesheets: 'auto',
  },
  adapter: cloudflare({
    sessionKVBindingName: 'SESSION',
    imageService: 'compile',
  }),
  integrations: [
    react(),
    sitemap({
      filter: (page) => {
        const url = new URL(page);
        const path = url.pathname.replace(/\/$/, '') || '/';
        return (
          !path.startsWith('/admin') &&
          !path.startsWith('/api')
        );
      },
    }),
  ],
  vite: {
    plugins: [
      tailwindcss(),
    ],
    ssr: {
      external: ['node:async_hooks'],
    },
  },
});
