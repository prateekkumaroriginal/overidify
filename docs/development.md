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

## Reviewing tests

For each added test, reviewers should identify the failure mode or integration boundary it protects and compare it with existing coverage. Extend an existing test when it already exercises the same scenario. Keep overlapping tests only when they provide distinct protection that the reviewer can explain.

Use browser tests for behavior that depends on Chrome, extension loading, or page integration. Use unit tests for isolated logic, validation, and controlled races or failures. Check that each regression test would fail for the bug it is intended to catch.

## UI and dependencies

The extension uses React, TypeScript, Vite, and Manifest V3 with `@crxjs/vite-plugin`. Zod schemas and React Hook Form with Zod resolvers handle forms and validation.

Styling uses Tailwind CSS v4 utilities and local shadcn components with Radix primitives in `src/components/ui`. Theme tokens and shared base styles live in `src/styles.css`.

All UI text uses locally bundled Manrope, including buttons, domain and header fields, and response editors. The unlayered `html body` font rule overrides Chrome's injected extension-page font. Keep it outside Tailwind's layers so the packaged extension renders the same font as development previews.

Icons use named component imports from `lucide-react`. The shared `Icon` wrapper sets the default size, stroke width, and decorative accessibility attributes. Pass the imported component through its `icon` prop.

Add components with:

```bash
pnpm dlx shadcn@latest add <component>
```
