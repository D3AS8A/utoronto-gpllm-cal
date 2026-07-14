![Alpine.js](https://img.shields.io/badge/Alpine.js-8BC0D0?style=flat&logo=alpinedotjs&logoColor=black) ![Astro](https://img.shields.io/badge/Astro-FF5D01?style=flat&logo=astro&logoColor=white) ![Bun](https://img.shields.io/badge/Bun-000000?style=flat&logo=bun&logoColor=white)

# UofT GPLLM Calendar

<img src="/public/images/og-image.png" alt="graph image" width="500">

A simple static website for the University of Toronto GPLLM program calendar. 

Built with [Astro](https://astro.build) and [Alpine.js](https://alpinejs.dev). Optimised for minimal Javascript footprint, performance, a11y, and SEO.

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

## Deployment

Assuming a static site host like Cloudflare Pages, Github Pages, Netlify, etc.

- Build command: `bun run build`
- Set output directory: `dist`
- Ensure Node version is set to **22** or higher in environment settings
- Add any environment variables (none by default)
