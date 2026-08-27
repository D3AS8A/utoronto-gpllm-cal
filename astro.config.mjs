import { defineConfig } from 'astro/config';
import alpinejs from '@astrojs/alpinejs';
import sitemap from '@astrojs/sitemap';
import AstroPWA from '@vite-pwa/astro';

export default defineConfig({
  // Set this to your production domain — required for sitemap + canonical URLs
  site: 'https://gpllm.pages.dev',

  output: 'static',

  devToolbar: {
    enabled: false,
  },

  integrations: [
    alpinejs({ entrypoint: '/src/entrypoint' }),
    sitemap(),
    AstroPWA({
      registerType: 'prompt',
      strategies: 'generateSW',
      injectRegister: null,
      devOptions: {
        enabled: true,
      },
      manifest: {
        name: 'UofT GPLLM Calendar',
        short_name: 'GPLLM Cal',
        description: 'An interactive academic calendar for the GPLLM program at the UofT Jackman faculty of law.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f4f1ea',
        theme_color: '#002554',
        icons: [
          { src: '/favicon/android-icon-36x36.png',   sizes: '36x36',   type: 'image/png' },
          { src: '/favicon/android-icon-48x48.png',   sizes: '48x48',   type: 'image/png' },
          { src: '/favicon/android-icon-72x72.png',   sizes: '72x72',   type: 'image/png' },
          { src: '/favicon/android-icon-96x96.png',   sizes: '96x96',   type: 'image/png' },
          { src: '/favicon/android-icon-144x144.png', sizes: '144x144', type: 'image/png' },
          { src: '/favicon/android-icon-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/favicon/android-icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/favicon/apple-icon-180x180.png',   sizes: '180x180', type: 'image/png' },
          { src: '/favicon/apple-icon-152x152.png',   sizes: '152x152', type: 'image/png' },
          { src: '/favicon/apple-icon-120x120.png',   sizes: '120x120', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,css,js,svg,png,ico,webmanifest,ics,txt,xml}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/ics\//, /\.ics$/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
            },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              cacheableResponse: { statuses: [0, 200] },
              expiration: {
                maxAgeSeconds: 60 * 60 * 24 * 365,
                maxEntries: 30,
              },
            },
          },
        ],
      },
    }),
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
