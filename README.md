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
- Popup rule list with enable switches and links to each rule editor
- Home page listing rules, with a separate page for creating or editing each rule
- Rule deletion
- `chrome.storage.local` persistence
- Automatic sync into `declarativeNetRequest` dynamic rules
- Dark-mode UI

## Development

```bash
npm install
npm run dev
```

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
