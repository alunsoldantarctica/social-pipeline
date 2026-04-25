import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// TODO: Update site URL to your production domain
export default defineConfig({
  site: 'https://your-domain.com',
  output: 'static',
  trailingSlash: 'never',
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
