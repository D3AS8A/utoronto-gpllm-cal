![Alpine.js](https://img.shields.io/badge/Alpine.js-8BC0D0?style=flat&logo=alpinedotjs&logoColor=black) ![Astro](https://img.shields.io/badge/Astro-FF5D01?style=flat&logo=astro&logoColor=white) ![Bun](https://img.shields.io/badge/Bun-000000?style=flat&logo=bun&logoColor=white)

# Astro Starter

A static site template repo built with [Astro](https://astro.build) and [Alpine.js](https://alpinejs.dev). Optimised for minimal Javascript footprint, performance, a11y, and SEO.

## Stack

- **Astro 6** — static output, client-side routing via `<ClientRouter />`
- **Alpine.js** — lightweight interactivity, no build step
- **Plain CSS** — custom properties, fluid type scale, no framework
- **Bun** — package manager and script runner


## Quickstart

```bash
bun install    # requires node 22+
bun dev        # local development
bun build      # outputs to ./dist
bun preview    # preview the ./dist build locally
```

## Directory structure

```
/
├── public/
│   ├── _headers          # Cloudflare Pages security headers + CSP
│   ├── favicon.ico
│   ├── fonts/            # Self-hosted webfonts
│   └── robots.txt
│
├── src/
│   ├── assets/
│   │   ├── fonts/        # Source fonts (processed by Vite)
│   │   └── images/       # Images processed by Astro's <Image /> component
│   │
│   ├── components/
│   │   ├── Footer.astro
│   │   ├── Header.astro
│   │   ├── Nav.astro
│   │   └── SEO.astro     # <title>, meta, canonical, OG, Twitter card
│   │
│   ├── content/
│   │   ├── global.toon   # Site-wide values (name, URL, description, title postfix)
│   │   ├── home.toon
│   │   ├── about.toon
│   │   ├── privacy.toon
│   │   └── 404.toon
│   │
│   ├── layouts/
│   │   └── BaseLayout.astro  # Root HTML shell, accepts SEO + JSON-LD props
│   │
│   ├── lib/
│   │   └── content.ts    # loadGlobal() and loadPage() helpers
│   │
│   ├── pages/
│   │   ├── index.astro
│   │   ├── about.astro
│   │   ├── privacy.astro
│   │   └── 404.astro
│   │
│   └── styles/
│       ├── reset.css
│       ├── variables.css
│       └── global.css
│
├── astro.config.mjs
├── tsconfig.json
└── package.json
```


## Content

All page content lives in `src/content/` as [TOON](https://toonformat.dev) files, a compact, human-readable format. Each page file follows a consistent three-section structure:

```
meta:
  title: Page Title
  description: Page-specific meta description.
  og_image: /og-page.png

options:
  noindex: true   # omit or set null to allow indexing

content:
  heading: Welcome
  tagline: A minimal starting point.
```

### Global content

`src/content/global.toon` holds site-wide values used across all pages — site name, default description, default OG image, and the title postfix appended to every page title:

```
name: Site Name
tagline: Short site tagline.
description: Default meta description.
url: https://example.com
title_postfix: " — Site Name"
og_image: /og-default.png
```

### Adding a content file for a new page

Create `src/content/my-page.toon`, then load it in the corresponding `.astro` file:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import { loadPage } from '../lib/content';

const { meta, options, content } = loadPage('my-page');
const c = content as { heading: string; body: string };
---

<BaseLayout
  title={meta.title ?? undefined}
  description={meta.description}
  noindex={options?.noindex ?? false}
>
  <h1>{c.heading}</h1>
  <p>{c.body}</p>
</BaseLayout>
```

`loadGlobal()` is available for components that need site-wide values (name, URL, etc.).

## Configuration

### Site metadata

Edit `src/content/global.toon` to set the site name, description, URL, and title postfix before deploying.

### Production domain

Set `site` in `astro.config.mjs` to your production URL. This is required for correct canonical URLs and sitemap generation:

```js
export default defineConfig({
  site: 'https://foo.com',
  // ...
});
```

Also update the `Sitemap:` entry in `public/robots.txt` to match.

### Local development server

Configured in `astro.config.mjs`:

```js
server: {
  port: 14220,
},
```

## Adding pages

Create a new `.astro` file in `src/pages/`. Pass `title` and `description` to `BaseLayout`:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---

<BaseLayout title="Page Title" description="Page description for search engines.">
  <section>
    <div class="container">
      <h1>Page Title</h1>
    </div>
  </section>
</BaseLayout>
```

The `title` prop renders as `Page Title - Site Name` in `<title>`. Omit it on the home page to render just the site name.

### Nav links

Add entries to the `navLinks` array in `src/components/Nav.astro`:

```ts
const navLinks = [
  { label: 'Home',    href: '/'       },
  { label: 'About',   href: '/about'  },
  { label: 'Blog',    href: '/blog'   },
];
```

### SEO

All props are optional and fall back to values in `src/content/global.toon`:

```astro
<BaseLayout
  title="Page Title"
  description="Page-specific description."
  ogImage="/og-custom.png"
  noindex={false}
>
```

Set `noindex={true}` on pages that should not be indexed (e.g. thank-you pages).

### JSON-LD

Pass a structured data object to `BaseLayout` via the `jsonLD` prop:

```astro
---
const jsonLD = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Page Title',
  url: 'https://foo.com/page',
};
---

<BaseLayout title="Page Title" jsonLD={jsonLD}>
```

Only pass developer-controlled data — never raw user input.

### Sitemap

Generated automatically at build time by `@astrojs/sitemap`. The output file is `dist/sitemap-index.xml`. It will 404 in dev, this is expected.

### Fonts

Self hosted fonts are recommended.

1. Move font files, ideally `.woff2` in `public/fonts/`
2. Add `@font-face` declarations in `src/styles/global.css`
3. Update `--font-sans` (and/or `--font-display`) in `src/styles/variables.css`

```css
@font-face {
  font-family: 'MyFont';
  src: url('/fonts/myfont-regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
```

## Utilities and Conventions

### Heading utility classes

Apply heading visual styles to any element without changing its semantic role:

```html
<p class="h2">Visually an h2, semantically a paragraph</p>
<span class="h4">Visually an h4</span>
```

`.h1` through `.h6` mirror the corresponding heading sizes and weights from the type scale.

#### `.markdown`

Apply to any wrapper containing rendered markdown or long-form content. Handles headings, paragraphs, lists (with custom bullet dots), blockquotes, tables, inline code, and code blocks — all styled with the site's design tokens.

```html
<div class="markdown">
  <h2>Section</h2>
  <p>Body copy with <code>inline code</code>.</p>
  <ul>
    <li>Custom bullet dot</li>
    <li>Nested list gets a hollow ring bullet</li>
  </ul>
  <blockquote>Callout text</blockquote>
</div>
```

Pair with a `max-width` constraint for comfortable line lengths:

```css
.markdown { max-width: 68ch; }
```

#### `[data-tooltip]`

Pure CSS tooltip. Add a `data-tooltip` attribute to any element:

```html
<button data-tooltip="Helpful hint">Hover me</button>
<abbr data-tooltip="HyperText Markup Language">HTML</abbr>
```

The tooltip appears below the element on hover. Styled with `--woodsmoke` and `--tuna`.

#### `.video-wrapper`

Responsive 16:9 container for `<iframe>` or `<video>` embeds:

```html
<div class="video-wrapper">
  <iframe src="https://www.youtube.com/embed/…" allowfullscreen></iframe>
</div>
```

#### `.magnify-onhover`

Subtle `scale(1.05)` on hover with directional easing (ease-in on enter, ease-out on leave):

```html
<a href="/page" class="btn btn-primary magnify-onhover">Get started</a>
```

### Body state classes

Toggle classes on `<body>` to control page-level state:

```js
document.body.classList.add('no-scroll')   // disable scroll (e.g. while a modal is open)
document.body.classList.add('no-cursor')   // hide cursor (e.g. custom cursor implementations)
```

### Breakpoints

Named breakpoint tokens are defined in `src/styles/variables.css` for reference:

| Token            | Value  |
|------------------|--------|
| `--bp-tiny`      | 320px  |
| `--bp-small`     | 480px  |
| `--bp-medium`    | 640px  |
| `--bp-large`     | 768px  |
| `--bp-xlarge`    | 1024px |
| `--bp-xxlarge`   | 1280px |
| `--bp-xxxlarge`  | 1536px |

CSS custom properties cannot be used directly inside `@media` queries, so these tokens serve as named documentation anchors. Use the raw pixel values in your media queries:

```css
@media (min-width: 768px) { /* --bp-large */
  .my-component { display: grid; }
}
```

### Cross-browser compatibility

`src/styles/x-browser.css` (imported automatically via `global.css`) handles browser-specific quirks:

- **Firefox** — removes inner button focus ring; fixes `select` focus ring rendering
- **WebKit/Blink** — styles file upload button; suppresses number input spinners; removes search field decorations
- **All browsers** — cross-browser `::placeholder` colour (each vendor prefix as its own rule)
- **iOS Safari** — prevents font-size inflation after orientation change (`text-size-adjust`)
- **Touch devices** — removes tap highlight flash on links and buttons (`-webkit-tap-highlight-color`)

Number input spinners are suppressed globally. Re-enable them on a per-element basis if needed:

```css
input[type='number']::-webkit-inner-spin-button,
input[type='number']::-webkit-outer-spin-button {
  -webkit-appearance: auto;
}
input[type='number'] {
  -moz-appearance: auto;
}
```

### Security headers

Production headers are configured in `public/_headers` (Cloudflare Pages format). The Content Security Policy includes `unsafe-eval` required by Alpine.js v3. Tighten `img-src` and `connect-src` as needed for your CDN or API domains.

Dev server headers are set in the `vite.server.headers` block in `astro.config.mjs`.


## Deployment

Assuming a static site host like Cloudflare Pages, Github Pages, Netlify, etc.

- Build command: `bun run build`
- Set output directory: `dist`
- Ensure Node version is set to **22** or higher in environment settings
- Add any environment variables (none by default)
