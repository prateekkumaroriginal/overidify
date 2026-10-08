# Overidify

Chrome extension for overriding request headers with ordered rules.

## Stack

- React
- TypeScript
- Vite
- `@crxjs/vite-plugin`
- Manifest V3

## Features

- Browser-wide request header override rules
- Popup showing matching rules for the current tab, with enable switches and a Settings link
- Home page listing rules, with a separate page for creating or editing each rule
- Rule deletion
- `chrome.storage.local` persistence
- Automatic sync into `declarativeNetRequest` dynamic rules
- Dark-only, responsive UI with rule search and reduced-motion support

## Development

```bash
npm install
npm run dev
```

Open `/options.html` or `/popup.html` to preview the UI in a regular browser. Development previews store rules in browser local storage; the installed extension uses `chrome.storage.local`.

## Build

```bash
npm run build
```

The production extension bundle is generated in `dist/`.

## Load In Chrome

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click `Load unpacked`
4. Select the `dist/` folder

## Rule Behavior

- `*` matches all URLs
- Wildcard patterns like `*://api.example.com/*` are supported
- Later rules have higher priority than earlier rules
- Header pairs use set semantics, so existing values are replaced and missing headers are added
