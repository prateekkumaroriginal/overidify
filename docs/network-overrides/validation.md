# Network Overrides validation

Verified on 2026-10-14 against the production build in `dist/`.

## Automated checks

`pnpm test` passes all 28 tests. Six Network Overrides tests cover exact request matching, reordered and duplicate query parameters, URL encoding, shared Rules/Switchers website matching, enabled-entry priority, independent request snapshots, defaults, normalization, raw body preservation, JSON warnings, and invalid status/header rejection. Existing header rule, switcher, migration, and background tests also pass.

`pnpm lint`, `pnpm build`, and `git diff --check` pass. The build includes a standalone MAIN-world interceptor installed synchronously at `document_start`; it does not depend on an asynchronous module loader for page interception.

## Installed Chrome checks

Chrome for Testing 151.0.7922.34 loaded the unpacked production extension in a temporary profile. A local HTTP server recorded requests and supplied real responses, delayed responses, and socket failures. The browser profile and server were removed after the run. No user browser settings were changed.

All 22 browser checks passed:

- The first inline fetch waited for configuration and returned the bypass mock without a target server request.
- Fetch received the configured status, raw body, headers, and URL. Empty configured headers stayed empty, and cloned responses retained their body and URL.
- XHR handled text, JSON, blob, and arraybuffer responses, plus synchronous requests after initialization.
- XHR aborts from loadstart and headers events prevented success. Sending the same XHR twice failed. Capture listeners received only the mocked completion events.
- Call-server fetch/XHR replaced the entire response while the real request received a matching header Rule.
- Real transport failures stayed failures. Native XHR timeout and fetch abort behavior remained active in call-server mode.
- HEAD and status 204 returned no body. Any method matched a POST request and returned its configured error status.
- Relative fetch/XHR targets resolved against the document's base URL.
- In-flight fetch and XHR retained their starting settings. Subsequent calls used live edits and enabled-state changes.
- An ineligible website received the real response. A cross-origin iframe inside an eligible website received the mock using top-level website scope.
- Bypass fetch and XHR aborts did not deliver success.
- Native DevTools stayed connected while overrides worked. Its own NetworkLog showed the real status 200 and server body while the page received mock status 201 and the configured body.
- The options editor saved invalid JSON with a warning, reopened the exact text, and deleted the entry after confirmation.
- The popup listed eligible overrides and its toggles affected the website's next request.
- Screenshots confirmed editor layout at 1280 and 360 pixels and list/popup layout at 360 pixels, with no horizontal overflow.

## Limits of these checks

The browser checks used local HTTP endpoints. They do not establish coverage for every website's CSP, service worker, streaming request body, or instrumentation library. Worker-originated calls remain outside version 1.

A synchronous XHR made before settings initialization passes through. The editor and popup report reload requirements through the bridge. Reloading cannot guarantee interception of a synchronous call that always runs before settings arrive. Asynchronous startup calls wait up to three seconds before falling back to the original browser APIs.

Mock responses are visible to page fetch/XHR callers. Native DevTools Network records actual network traffic, as accepted in ADR 0007.
