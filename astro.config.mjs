import { defineConfig } from 'astro/config';
import alpinejs from '@astrojs/alpinejs';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // Set this to your production domain — required for sitemap + canonical URLs
  site: 'https://gpllm.pages.dev',

  output: 'static',

  integrations: [
    alpinejs({ entrypoint: '/src/entrypoint' }),
    sitemap(),
  ],

  // Security headers for the development server
  server: {
    port: 14480,
  },

  vite: {
    server: {
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      },
    },
  },
});
