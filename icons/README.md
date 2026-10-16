The source artwork is `src/assets/logo.png`. It is the input to the icon generator.

The PNGs in this directory are used by the options and popup pages, Chrome's toolbar, extension management, page favicons, and the root README. Every surface uses the same artwork without CSS recoloring. The icons add a light inner keyline to the mark so its charcoal portion remains visible on dark backgrounds. The keyline stays inside the existing silhouette; the surrounding pixels and gap between the pieces remain transparent.

To regenerate all four sizes from the project root, run `pnpm icons:generate`. The generator uses the project's Playwright dependency and requires its Chromium browser to be installed with `pnpm exec playwright install chromium`.
