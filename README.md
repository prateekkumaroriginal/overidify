# Overidify

Chrome extension for overriding request headers with rules and named switchers.

## Stack

- React
- TypeScript
- Vite
- Tailwind CSS v4
- shadcn/ui with Radix primitives
- `@crxjs/vite-plugin`
- Manifest V3

## Features

- Browser-wide request header override rules
- Popup showing matching rules and switchers for the current tab, with toggles, switcher dropdowns, and a Settings link
- Rules and Switchers tabs on the home page, with separate editors
- Rules apply one header set; switchers provide named options with separate header sets
- Expandable switcher entries showing the selected option’s headers
- Rule, switcher, and option deletion
- `chrome.storage.local` persistence
- Automatic sync into `declarativeNetRequest` dynamic rules
- Dark-only, responsive UI with rule search and reduced-motion support

## Development

Use pnpm 11.20.0, pinned in `package.json`. With Corepack installed, enable it once:

```bash
corepack enable
```

```bash
pnpm install
pnpm dev
```

Commit dependency changes with `pnpm-lock.yaml`. For CI or a reproducible install, use `pnpm install --frozen-lockfile`.

Open `/options.html` or `/popup.html` to preview the UI in a regular browser. Development previews store rules in browser local storage; the installed extension uses `chrome.storage.local`.

Styling uses Tailwind utilities and local shadcn components in `src/components/ui`. Theme tokens and shared base styles live in `src/styles.css`. Add components with `pnpm dlx shadcn@latest add <component>`.

## Tests

```bash
pnpm test
pnpm lint
```

The migration and option-selection tests run with Node’s TypeScript stripping support.

## Build

```bash
pnpm build
```

The production extension bundle is generated in `dist/`.

## Load In Chrome

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click `Load unpacked`
4. Select the `dist/` folder

## Rule Behavior

- Rules apply their original header set
- Switchers apply only the selected option’s header set
- Existing rules retain their headers and enabled state
- Switchers with a single option have no dropdown

- `*` matches all URLs
- Wildcard patterns like `*://api.example.com/*` are supported
- Later entries have higher priority, across both rules and switchers
- Header pairs use set semantics, so existing values are replaced and missing headers are added
