# Overidify

Chrome extension for overriding request headers with Header Rules and Switch Rules, and mocking API responses with Network Rules.

## Install

- [Stable ZIP, v0.2.1](https://github.com/prateekkumaroriginal/overidify/releases/download/v0.2.1/overidify-v0.2.1.zip) follows the versioned [release](https://github.com/prateekkumaroriginal/overidify/releases/tag/v0.2.1).
- [Nightly ZIP](https://github.com/prateekkumaroriginal/overidify/releases/download/nightly/overidify-nightly.zip) includes the latest features from `main` that pass CI.

Main can move ahead of the stable release. The nightly ZIP refreshes after successful main builds; the stable ZIP stays fixed to its release tag. No Node.js or pnpm is required for either download.

1. Extract the ZIP into a permanent folder.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the extracted folder containing `manifest.json`.

Keep the extracted folder in place. Chrome loads the extension from it.

## Stack

- React
- TypeScript
- Zod schemas and React Hook Form with Zod resolvers
- Vite
- Tailwind CSS v4
- shadcn/ui with Radix primitives
- `@crxjs/vite-plugin`
- Manifest V3

## Features

- Browser-wide request header override rules
- Popup showing matching Header Rules, Switch Rules, and Network Rules for the current tab, with toggles, option dropdowns, and a Settings link
- Header Rules, Switch Rules, and Network Rules tabs on the home page, with separate editors
- Header Rules apply one header set; Switch Rules provide named options with separate header sets
- Switch Rule entries open their edit page directly
- Rule and option deletion
- `chrome.storage.local` persistence
- Automatic sync into `declarativeNetRequest` session rules for matching website tabs
- Configurable fetch/XHR response bodies, statuses, and headers, with bypass-server and call-server modes
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
pnpm exec playwright install chromium
pnpm test:e2e
```

Matching, migration, priority, and validation tests run with Node's TypeScript stripping support. Use Node.js 24 for development and CI.

`pnpm test:e2e` builds the production extension, typechecks the browser tests, and runs Playwright against bundled Chromium with the unpacked extension installed. Each test owns a temporary profile and local HTTP server. The suite covers all three editors, popup toggles, early requests under CSP, fetch/XHR behavior, live updates, iframe scope, and native DevTools. On Linux, install browser system dependencies with `pnpm exec playwright install --with-deps chromium` if needed. CI runs the same checks.

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

The current source requires Chrome 119 or newer. After updating or reloading the extension, reload already-open website tabs to install its response interceptors.

## Network rules

Open **Network Rules** and click **New Network Rule**. Set the website domain using the same patterns as Header Rules and Switch Rules, then enter the complete API request URL. The website domain determines which tabs are eligible. Requests from their iframes use the top-level website's scope.

Choose a method or **Any**, enter the response body, and adjust its status and headers. New Network Rules use GET, status 200, `Content-Type: application/json`, bypass-server mode, and an enabled state. Invalid JSON shows a warning but can still be saved exactly as entered.

- Request URL matching ignores query parameter order but requires identical parameters and values, including duplicates. Paths and query values remain case-sensitive.
- The later enabled entry wins when multiple Network Rules match.
- **Bypass server** returns the mock without making the API request.
- **Call server, then replace response** makes the original request with matching Header Rules and Switch Rules headers. Fetch and asynchronous XHR receive the entire configured mock once response headers arrive. A network failure before headers remains a failure; a later failure while downloading the real body does not replace the delivered mock. Synchronous XHR waits for native completion and preserves native failures, including a truncated real body.
- Saved edits and toggles apply to subsequent requests. In-flight requests keep the settings captured when they started. Reload a website when the settings page or popup asks you to.
- HEAD and statuses 204, 205, and 304 return no body. The editor retains your entered text. Mock response headers cannot set browser cookies.

Chrome DevTools can stay open. Its native Network panel shows the actual server response in call-server mode; bypassed calls have no target network request to display. The page receives the configured mock through its fetch/XHR APIs. No companion app, proxy, or certificate setup is required.

Version 1 covers page and iframe fetch/XHR calls. Worker calls, page navigations, and asset requests are outside its scope. A synchronous XHR made before the extension's settings arrive passes through to the server; later synchronous calls can use mocks. See the [feature specification](docs/network-rules/spec.md) for the accepted behavior and decisions.

## Rule Behavior

- Header Rules apply their original header set
- Switch Rules apply only the selected option's header set
- Header Rules, Switch Rules, Network Rules, and the popup match the website's page domain with the same logic: exact hosts and optional ports on every path
- Headers apply to HTTP, HTTPS, WS, and WSS requests made in matching website tabs, including requests to other API hosts and requests from embedded frames
- For example, `localhost:4200` matches a page at `http://localhost:4200/messages` and overrides its requests to `https://backendapi-qa.topfan.dev/`
- The API's domain does not determine whether a Header Rule or Switch Rule matches
- Top-level page navigations are excluded; rules are refreshed when tabs open, navigate, or close
- Both accept `localhost:4200`, `api.example.com`, `*.example.com`, or `*`
- Existing Header Rule and Switch Rule URLs such as `http://localhost:4200/messages` become `localhost:4200`
- Existing Header Rules retain their headers and enabled state
- Switch Rules with a single option have no dropdown

- `*` matches all HTTP and HTTPS website tabs
- Legacy wildcard URL patterns like `*://api.example.com/*` become host patterns such as `api.example.com`
- Later entries have higher priority, across both Header Rules and Switch Rules
- Header pairs use set semantics, so existing values are replaced and missing headers are added
