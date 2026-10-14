# Overidify

Chrome extension for overriding request headers with rules and named switchers, and mocking API responses with Network Overrides.

## Install

[Download Overidify v0.1.0](https://github.com/prateekkumaroriginal/overidify/releases/download/v0.1.0/overidify-v0.1.0.zip) or view the [release notes](https://github.com/prateekkumaroriginal/overidify/releases/tag/v0.1.0). No Node.js or pnpm is required.

1. Extract the ZIP into a permanent folder.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the extracted folder containing `manifest.json`.

Keep the extracted folder in place. Chrome loads the extension from it.

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
- Popup showing matching rules, switchers, and network overrides for the current tab, with toggles, switcher dropdowns, and a Settings link
- Rules, Switchers, and Network Overrides tabs on the home page, with separate editors
- Rules apply one header set; switchers provide named options with separate header sets
- Switcher entries open their edit page directly
- Rule, switcher, and option deletion
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
```

Matching, migration, priority, and validation tests run with Node's TypeScript stripping support.

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

## Network overrides

Open **Network Overrides** and click **New Override**. Set the website domain using the same patterns as Rules and Switchers, then enter the complete API request URL. The website domain determines which tabs are eligible. Requests from their iframes use the top-level website's scope.

Choose a method or **Any**, enter the response body, and adjust its status and headers. New overrides use GET, status 200, `Content-Type: application/json`, bypass-server mode, and an enabled state. Invalid JSON shows a warning but can still be saved exactly as entered.

- Request URL matching ignores query parameter order but requires identical parameters and values, including duplicates. Paths and query values remain case-sensitive.
- The later enabled entry wins when multiple network overrides match.
- **Bypass server** returns the mock without making the API request.
- **Call server, then replace response** makes the original request with matching Rules and Switchers headers. It replaces the entire response delivered to the page. A network failure before receiving a response remains a failure.
- Saved edits and toggles apply to subsequent requests. In-flight requests keep the settings captured when they started. Reload a website when the settings page or popup asks you to.
- HEAD and statuses 204, 205, and 304 return no body. The editor retains your entered text. Mock response headers cannot set browser cookies.

Chrome DevTools can stay open. Its native Network panel shows the actual server response in call-server mode; bypassed calls have no target network request to display. The page receives the configured mock through its fetch/XHR APIs. No companion app, proxy, or certificate setup is required.

Version 1 covers page and iframe fetch/XHR calls. Worker calls, page navigations, and asset requests are outside its scope. A synchronous XHR made before the extension's settings arrive passes through to the server; later synchronous calls can use mocks. See the [feature specification](docs/network-overrides/spec.md) for the accepted behavior and decisions.

## Rule Behavior

- Rules apply their original header set
- Switchers apply only the selected option’s header set
- Rules, switchers, and the popup match the website's page domain with the same logic: exact hosts and optional ports on every path
- Headers apply to HTTP, HTTPS, WS, and WSS requests made in matching website tabs, including requests to other API hosts and requests from embedded frames
- For example, `localhost:4200` matches a page at `http://localhost:4200/messages` and overrides its requests to `https://backendapi-qa.topfan.dev/`
- The API's domain does not determine whether a rule or switcher matches
- Top-level page navigations are excluded; rules are refreshed when tabs open, navigate, or close
- Both accept `localhost:4200`, `api.example.com`, `*.example.com`, or `*`
- Existing rule and switcher URLs such as `http://localhost:4200/messages` become `localhost:4200`
- Existing rules retain their headers and enabled state
- Switchers with a single option have no dropdown

- `*` matches all HTTP and HTTPS website tabs
- Legacy wildcard URL patterns like `*://api.example.com/*` become host patterns such as `api.example.com`
- Later entries have higher priority, across both rules and switchers
- Header pairs use set semantics, so existing values are replaced and missing headers are added
