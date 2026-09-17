import { defineConfig } from 'astro/config';
import alpinejs from '@astrojs/alpinejs';
import sitemap from '@astrojs/sitemap';
import AstroPWA from '@vite-pwa/astro';

export default defineConfig({
  // Set to production domain, required for sitemap + canonical URLs
  site: 'https://gpllm.pages.dev',

  output: 'static',

  /*
   * Cloudflare Pages serves a directory route with trailing slash `/calendar/`, 
   * it 308s to the bare `/calendar`; always use trailing slash here to make the 
   * precache manifest agree
   */
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
      /*
       * autoUpdate so the worker calls skipWaiting itself
       */
      registerType: 'autoUpdate',
      strategies: 'generateSW',
      injectRegister: null,
      devOptions: {
        enabled: true,
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
        /*
         * woff2 is in the list, but globIgnores below keeps it to the cuts the
         * site actually draws with. Precaching the fonts is what lets a cold
         * offline load look like the site rather than like Helvetica.
         */
        globPatterns: ['**/*.{html,css,js,svg,png,ico,webmanifest,ics,txt,xml,woff2}'],

        /*
         * Cloudflare serves the not-found page at `/404`, the one route whose
         * canonical shape is the opposite of every other page's. Precaching it
         * meant asking for `/404/`, and a precache entry that 404s fails the
         * whole install, which takes the service worker down with it. Nothing
         * needs a cached not-found page.
         */
        globIgnores: [
          '404.html',
          /*
           * Latin-ext answers accented characters no page currently sets, and
           * the italic cuts are two `em`s and a handful of notes. Both stay on
           * the network, where unicode-range and font-style already gate them.
           */
          'fonts/*-latin-ext.woff2',
          'fonts/archivo-italic-*.woff2',
          // Licence text ships with the fonts, but nothing reads it offline
          'fonts/OFL-*.txt',
        ],
        /*
         * Explicitly undefined, not merely absent. @vite-pwa/astro tests with
         * `'navigateFallback' in workbox`, so leaving the key out lets it
         * default the fallback to the scope, and `/` here is the redirect stub
         * that bounces to the calendar. Every navigation missing the precache
         * then lands on the calendar, including the not-found page, which no
         * controlled visitor would ever get to see. Falling through to the
         * network is what lets a real 404 answer as one.
         *
         * The earlier value, `/index.html`, was a page the plugin never emits,
         * and binding the fallback to it threw non-precached-url. The worker
         * body runs inside the AMD factory's promise, so that throw was an
         * unhandled rejection rather than a fatal script error: the worker
         * still installed and precached, then stopped before registering
         * anything below it.
         */
        navigateFallback: undefined,
        cleanupOutdatedCaches: true,

        /*
         * The two Google Fonts routes that used to live here are gone with the
         * fonts themselves. Worth recording why they had to: the stylesheet ran
         * through StaleWhileRevalidate, which rejects outright on a cold cache
         * and a failed network, and a rejected respondWith reads to the browser
         * as a dead stylesheet. A flaky first visit lost the typeface for the
         * whole session. Same-origin fonts are precached instead, so there is
         * no handler left to fail.
         *
         * This leaves the worker with no cross-origin routes at all.
         */
        runtimeCaching: [
          {
            // The two cuts held back from the precache above
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
