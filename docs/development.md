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

`pnpm test:e2e` builds the production extension, typechecks the browser tests, and runs Playwright against bundled Chromium with the unpacked extension installed. Each test owns a temporary browser profile and local HTTP server. The retained browser suite covers extension integration, activation, early requests under CSP, fetch/XHR behavior, live updates, iframe scope, and native DevTools. Import/export format, validation, overlap handling, order, and save/activation failures are tested through the public functions in the Node suite.

On Linux, install browser system dependencies with `pnpm exec playwright install --with-deps chromium` if needed. CI runs the same checks.

## One-time verification

Use `.scratch/verification/<task>/` for temporary verification scripts, screenshots, and logs. Create the task directory when needed. Git and ESLint ignore this location, and the normal unit and browser test commands discover tests only under `tests/`.

Run temporary checks explicitly during implementation or relevant UI changes. Report their results with the change, then remove that task's temporary files. Keep lasting application-behavior tests in `tests/`; the [testing policy](../AGENTS.md#testing) defines which checks belong there.

## Reviewing tests

For each added test, identify the failure mode or integration boundary it protects and compare it with existing coverage. Use the [testing policy](../AGENTS.md#testing) to choose permanent regression coverage or one-time verification. Browser tests should protect behavior that requires Chrome or extension/page integration.

## UI and dependencies

The extension uses React, TypeScript, Vite, and Manifest V3 with `@crxjs/vite-plugin`. Zod schemas and React Hook Form with Zod resolvers handle forms and validation.

Styling uses Tailwind CSS v4 utilities and local shadcn components with Radix primitives in `src/components/ui`. Theme tokens and shared base styles live in `src/styles.css`.

Primary, secondary, and solid destructive buttons share the Clerk-style gradient highlight, shadow, rounded corners, and hover/focus treatment. The destructive variant uses `--destructive-action` for its red fill with white text; `--destructive` remains the lighter red for error text and outlined actions. Dialog and alert-dialog footer buttons share a 35px height.

Shadcn's fade and zoom animations use `tw-animate-css`, imported by `src/styles.css`.

Rule storage locks cover reading and saving, and release before background activation. Home-page Select, Import, and Export stay usable during rule saves. Export and import review read saved rules under those locks, so they wait for unfinished writes without waiting for activation. Keep import submission state local to its modal dialog; selection does not change saved rules. Use `disabled` for unavailable actions, such as exporting an empty selection.

All UI text uses locally bundled Manrope, including buttons, domain and header fields, and response editors. The unlayered `html body` font rule overrides Chrome's injected extension-page font. Keep it outside Tailwind's layers so the packaged extension renders the same font as development previews.

Icons use named component imports from `lucide-react`. The shared `Icon` wrapper sets the default size, stroke width, and decorative accessibility attributes. Pass the imported component through its `icon` prop.

Add components with:

```bash
pnpm dlx shadcn@latest add <component>
```
