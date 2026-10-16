The unmodified transparent logo is `src/assets/logo.png`. The options and popup pages use it with a light-ink CSS treatment for their dark UI.

The PNGs in this directory are used by Chrome's toolbar, extension management, page favicons, and the root README. They add a light inner keyline to the mark so its charcoal portion remains visible on dark backgrounds. The keyline stays inside the existing silhouette; the surrounding pixels and gap between the pieces remain transparent.

To regenerate all four sizes from the project root, run `pnpm icons:generate`. The generator uses the project's Playwright dependency and requires its Chromium browser to be installed with `pnpm exec playwright install chromium`.
