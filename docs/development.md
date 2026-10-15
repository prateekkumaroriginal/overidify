# Local development

For the packaged extension, follow the [installation instructions](../README.md#install). This page covers running and checking the source locally.

## Setup

Use Node.js 24 and pnpm 11.20.0, pinned in `package.json`. With Corepack installed, enable it once:

```bash
corepack enable
```

Install dependencies and start the development server:

```bash
pnpm install
pnpm dev
```

Open `/options.html` or `/popup.html` on the development server to preview the UI. Development previews store rules in browser local storage; the installed extension uses `chrome.storage.local`.

Commit dependency changes with `pnpm-lock.yaml`. For CI or a reproducible install, use `pnpm install --frozen-lockfile`.

## Build and load

```bash
pnpm build
```

The production extension is generated in `dist/`. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select `dist/`.

Chrome 119 or newer is required. Reload already-open website tabs after updating or reloading the extension to install its response interceptors.

## Checks

```bash
pnpm test
pnpm lint
pnpm exec playwright install chromium
pnpm test:e2e
```

Matching, normalization, priority, and validation tests use Node's TypeScript stripping support. ESLint checks project code and excludes bundled agent skills under `.agents/`.

`pnpm test:e2e` builds the production extension, typechecks the browser tests, and runs Playwright against bundled Chromium with the unpacked extension installed. Each test owns a temporary browser profile and local HTTP server. The suite covers the three editors, popup controls, early requests under CSP, fetch/XHR behavior, live updates, iframe scope, and native DevTools.

On Linux, install browser system dependencies with `pnpm exec playwright install --with-deps chromium` if needed. CI runs the same checks.

## UI and dependencies

The extension uses React, TypeScript, Vite, and Manifest V3 with `@crxjs/vite-plugin`. Zod schemas and React Hook Form with Zod resolvers handle forms and validation.

Styling uses Tailwind CSS v4 utilities and local shadcn components with Radix primitives in `src/components/ui`. Theme tokens and shared base styles live in `src/styles.css`.

Add components with:

```bash
pnpm dlx shadcn@latest add <component>
```
