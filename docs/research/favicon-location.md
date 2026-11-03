# Favicon location

Checked 2026-11-03 against primary documentation and this checkout. This is documentation and source inspection; no build or browser verification was run. The project declares Vite 8 and CRXJS 2.4 in [package.json](../../package.json).

## Finding

There is no required favicon source directory. HTML declares a page icon with `<link rel="icon" href="/path/to/icon.png">`. When that link is absent on an HTTP(S) document, browsers may request `/favicon.ico` at the origin root. This is an optional browser URL fallback, not a rule about repository layout. The specified fallback is limited to HTTP(S), so it does not establish automatic `/favicon.ico` lookup for `chrome-extension:` pages. [WHATWG HTML, icon link type](https://html.spec.whatwg.org/multipage/links.html#rel-icon).

`public/favicon.ico` is a convenient Vite source location if a site needs the exact URL `/favicon.ico`; it is not required. Vite serves files in its default `<root>/public` directory at `/` and copies them unchanged to the build output root. Thus `public/favicon.ico` maps to `/favicon.ico`, not `/public/favicon.ico`. Vite also supports imported assets, which can receive hashed output names, and generally recommends imports unless public-directory guarantees are needed. [Vite static assets](https://vite.dev/guide/assets.html#the-public-directory), [asset imports](https://vite.dev/guide/assets.html#importing-asset-as-url).

## Current repository

- [options.html](../../options.html) and [popup.html](../../popup.html) explicitly declare `/icons/icon-32.png`, plus light and dark variants under `/icons/light/` and `/icons/dark/` with `prefers-color-scheme` media queries. These are valid explicit icon locations; HTML selects among declared icons using `type`, `media`, and `sizes`. A basename of `favicon.ico` is unnecessary. [WHATWG HTML](https://html.spec.whatwg.org/multipage/links.html#rel-icon).
- [manifest.config.ts](../../manifest.config.ts) separately declares `icons/icon-16.png`, `icon-32.png`, `icon-48.png`, and `icon-128.png` under both `icons` and `action.default_icon`. Chrome documents manifest icons for extension identity and a 16px page favicon, while `action.default_icon` controls the toolbar icon. Its action example uses an `images/` subdirectory, so icons need not live at the package root. [Chrome manifest icons](https://developer.chrome.com/docs/extensions/reference/manifest/icons), [Chrome action icons](https://developer.chrome.com/docs/extensions/reference/api/action#icon).
- [vite.config.ts](../../vite.config.ts) registers `crx({ manifest })`. CRXJS discovers extension entries from the manifest and resolves manifest resource paths relative to the Vite project root, with nested directories supported. The existing root-level `icons/` source paths fit that documented layout. [CRXJS manifest paths](https://crxjs.dev/concepts/manifest/#path-resolution-rules).
- [icons/README.md](../../icons/README.md) identifies [src/assets/logo.svg](../../src/assets/logo.svg) as editable artwork and documents `pnpm icons:generate` for all 12 PNGs. It also documents the static manifest fallback and theme variants.

## Recommendation

Keep this repo's `icons/` directory and explicit HTML icon links. They already express the intended locations and share generated artwork with the extension icons. Follow [icons/README.md](../../icons/README.md) when changing the artwork. Add `public/favicon.ico` only if a separate HTTP(S) deployment needs the conventional fallback URL; Vite's unchanged-copy behavior makes that optional layout convenient. [Vite public directory](https://vite.dev/guide/assets.html#the-public-directory), [WHATWG fallback](https://html.spec.whatwg.org/multipage/links.html#rel-icon).
