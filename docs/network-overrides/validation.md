# Network Overrides validation

Verified on 2026-10-14 against the production build in `dist/`.

## Automated checks

`pnpm test` passes all 32 tests. Coverage includes exact request matching, reordered and duplicate query parameters, URL encoding, shared Rules/Switchers website matching, enabled-entry priority, independent request snapshots, defaults, normalization, raw body preservation, JSON warnings, and invalid status/header rejection. Existing header rule, switcher, migration, and background tests also pass. The four new schema tests cover raw text, request versus response headers, duplicate option error paths, malformed messages, and disabled invalid persisted entries without blocking valid siblings.

`pnpm lint`, `pnpm build`, and `git diff --check` pass. The build includes a standalone MAIN-world interceptor installed synchronously at `document_start`; it does not depend on an asynchronous module loader for page interception.

## Reproducible installed-extension checks

The committed Playwright suite runs with Chromium 156.0.8078.4 supplied by Playwright 1.64.0. Each test loads the unpacked production extension in a temporary profile. A local HTTP server records requests and supplies real responses, delayed responses, socket failures, and truncated bodies. Test pages use a nonce-only script CSP. Profiles and servers are removed after each test; user browser settings are unchanged.

Run it with:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm test:e2e` builds the extension and typechecks the test files before launching Chromium. GitHub Actions installs browser system dependencies and runs unit tests, lint, and the same browser command. Failures retain traces and error context in `test-results/`.

All 16 browser tests pass, covering:

- The first inline fetch waited for configuration and returned the bypass mock without a target server request.
- An unmatched startup XHR completed once without a stale configuration timeout. Sending inside an OPENED callback matched the new URL.
- Fetch received the configured status, raw body, headers, and URL. Empty configured headers stayed empty, and cloned responses retained their body and URL.
- XHR handled text, JSON, blob, and arraybuffer responses, plus synchronous requests after initialization.
- In both server modes, responseType could change at HEADERS_RECEIVED and was rejected at LOADING. Response decoding used the type selected by the headers callback.
- XHR aborts from loadstart and headers events prevented success. Sending the same XHR twice failed. Capture listeners received only the mocked completion events.
- Call-server fetch/XHR replaced the entire response while the real request received a matching header Rule.
- Real transport failures stayed failures. Native XHR timeout and fetch abort behavior remained active in call-server mode.
- Both fetch and XHR delivered the mock after real headers arrived, including when the real body later failed.
- HEAD and status 204 returned no body. Any method matched a POST request and returned its configured error status.
- Relative fetch/XHR targets resolved against the document's base URL.
- In-flight fetch and XHR retained their starting settings. Subsequent calls used live edits and enabled-state changes.
- An ineligible website received the real response. A cross-origin iframe inside an eligible website received the mock using top-level website scope.
- Bypass fetch and XHR aborts did not deliver success.
- Native DevTools stayed connected while overrides worked. Its own NetworkLog showed the real status 200 and server body while the page received mock status 201 and the configured body.
- The Network Override editor saved invalid JSON and whitespace with a warning, retained empty response header values and enabled state, reopened the exact body, rejected Set-Cookie, and deleted after confirmation.
- The Rule editor preserved dynamic header values and its one-empty-row behavior. Switcher editing preserved inactive fields, option IDs, selected option, deletion undo, duplicate-name validation, and added options. Enter, Ctrl+Enter, and Escape retained their intended behavior.
- The popup listed eligible overrides and its toggles affected the website's next request.
- Screenshots confirmed Network Override editor and list layout at 1280 and 360 pixels, with no horizontal overflow. Popup controls affected eligible page requests live.

The stale startup timeout, OPENED callback, responseType timing, and truncated-body regression checks failed against the original interceptor before its fixes and passed afterward. Reentrant abort coverage now runs in both modes.

## Package integration and size

Zod 4.6.7 supplies schemas and inferred types for header entries, override entries, drafts, migration inputs, and settings messages. Runtime consumers use `zod/mini`. React Hook Form 7.90.0 and `@hookform/resolvers` 5.9.1 share form submission, validation, and field-array handling across all three editors. Playwright is a development dependency. Effect is deferred.

Compared with commit 9d7939b, the three editor files shrink from 524 to 395 lines, with a new 51-line shared form helper. Including schemas, migration parsing, protocol checks, and interceptor fixes, application TypeScript grows from 2,596 to 2,629 lines. These counts include blank lines and exclude tests and configuration; they do not imply a net application LOC reduction.

The standalone `network-page.js` grows from 8,219 to 35,648 bytes (3,575 to 11,854 bytes gzipped). This adds validation to code installed in website pages. React Hook Form and its resolver run in the settings UI, and Playwright is excluded from extension runtime bundles. Header migration schemas stay outside the page entry point.

## Limits of these checks

The browser checks used local HTTP endpoints. They do not establish coverage for every website's CSP, service worker, streaming request body, or instrumentation library. Worker-originated calls remain outside version 1.

A synchronous XHR made before settings initialization passes through. The editor and popup report reload requirements through the bridge. Reloading cannot guarantee interception of a synchronous call that always runs before settings arrive. Asynchronous startup calls wait up to three seconds before falling back to the original browser APIs.

Mock responses are visible to page fetch/XHR callers. Native DevTools Network records actual network traffic, as accepted in ADR 0007.
