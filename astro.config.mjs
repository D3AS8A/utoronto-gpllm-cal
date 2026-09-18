import { defineConfig } from 'astro/config';
import alpinejs from '@astrojs/alpinejs';
import sitemap from '@astrojs/sitemap';
import AstroPWA from '@vite-pwa/astro';

export default defineConfig({
  // Set to production domain, required for sitemap + canonical URLs
  site: 'https://gpllm.pages.dev',

  output: 'static',

  // Match how Cloudflare Pages serves directory routes, so canonical URLs
  // and cache keys agree
  trailingSlash: 'always',

  // The calendar is the site's landing page, `/` bounces to it
  redirects: {
    '/': '/calendar/',
  },

  devToolbar: {
    enabled: false,
  },

  integrations: [
    alpinejs({ entrypoint: '/src/entrypoint' }),
    sitemap(),
    AstroPWA({
      // autoUpdate: the worker calls skipWaiting itself
      registerType: 'autoUpdate',
      strategies: 'generateSW',
      injectRegister: null,
      // No worker in dev; PWAUpdatePrompt scrubs any old dev registrations
      devOptions: {
        enabled: false,
      },
      manifest: {
        name: 'UofT GPLLM Calendar',
        short_name: 'GPLLM Cal',
        description: 'An interactive academic calendar for the GPLLM program at the UofT Jackman faculty of law.',
        start_url: '/calendar/',
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
        // Precache immutable assets only; pages are handled network-first
        // below (see README, PWA and caching)
        globPatterns: ['**/*.{css,js,svg,png,ico,webmanifest,woff2}'],

        globIgnores: [
          // On-demand font cuts (unicode-range/font-style gated) and licences
          'fonts/*-latin-ext.woff2',
          'fonts/archivo-italic-*.woff2',
          'fonts/OFL-*.txt',
        ],

        // Warms the pages cache at install, clears Google Fonts era caches
        importScripts: ['sw-warm.js'],
        // Explicitly undefined: the plugin checks `'navigateFallback' in
        // workbox` and would otherwise default it to `/`, which is not
        // precached and throws non-precached-url
        navigateFallback: undefined,
        cleanupOutdatedCaches: true,

        runtimeCaching: [
          {
            // Pages: fresh when online, cached copy offline. The pathname arm
            // catches ClientRouter fetches, which are not mode 'navigate'
            urlPattern: ({ url, sameOrigin, request }) =>
              sameOrigin && (request.mode === 'navigate' || url.pathname.endsWith('/')),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 4,
              // Offline /courses/?c=… still finds the cached /courses/
              matchOptions: { ignoreSearch: true },
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // The font cuts held out of the precache above
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/fonts/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 365, maxEntries: 20 },
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
