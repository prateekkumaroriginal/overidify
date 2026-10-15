# Network Overrides validation

Feature names are now Header Rule, Switch Rule, and Network Rule. This historical record uses their former names, Rule, Switcher, and Network Override.

Verified on 2026-10-15 against the production build in `dist/`.

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

All 37 browser tests pass, covering:

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
- XHR subclasses retain identity, custom methods, and open/send overrides calling super, both with no overrides and with mocks.
- Internal XHR event registration and dispatch use captured native EventTarget methods, preserving public subclass overrides without invoking them during construction or native-style completion.
- XHR open preserves native boolean conversion for false, null, zero, and empty strings. Omitted async is asynchronous; explicitly supplied undefined is synchronous, matching Chromium's overload behavior.
- Fetch accepts Requests from another frame, preserves their URL and signal, rejects inherited cancellation when options contain signal: undefined, and allows explicit signal: null detachment.
- Abort handlers can reopen and complete the same XHR in either server mode. Header edits after a bypass send are rejected with InvalidStateError.
- Disabling and deleting the last override report reload requirements when configuration delivery fails and the old mock stays active. These warnings survive an actual extension-worker restart, verified by loss of its global marker, then disappear after page reload and acknowledged removal. Activation IDs are validated and retained in session storage, with serialized writes and cleanup after committed navigation, tab closure, or replacement.
- Synchronous call-server transport and truncated-body failures match native Chromium exceptions and response state; successful native completion still receives the configured mock.
- Failed XHR open calls preserve pending and completed responses, timers, and the original override snapshot. Method and URL arguments convert once, including pass-through requests.
- Immediate fetch cancellation rejects bypass calls. Aborting unread mocked bodies and clones preserves the request's abort reason in both modes, including a direct reader of a buffered clone after the original branch was consumed.
- HEAD XHR skips LOADING, malformed response-header names return null, and MIME overrides persist across open and instance reuse.
- Script-disabled sandbox frames do not cause permanent reload warnings. Same-origin parent calls to their fetch/XHR APIs receive mocks and live changes in both modes. Frame activation follows the MAIN handshake and browser document ID, with state retained across worker restarts.
- Sandbox discovery covers frames inside open and closed shadow roots, plus frames inserted into an already-installed script-disabled document. Watched roots use weak references; frame discovery does not poll.
- Parser-created open shadow roots are discovered on first parent access, before a sandbox iframe API call can bypass the configured mock.

The stale startup timeout, OPENED callback, responseType timing, and truncated-body regression checks failed against the original interceptor before its fixes and passed afterward. Reentrant abort coverage now runs in both modes.

## Package integration and size

Zod 4.6.7 supplies schemas and inferred types for header entries, override entries, drafts, migration inputs, and settings messages. Runtime consumers use `zod/mini`. React Hook Form 7.90.0 and `@hookform/resolvers` 5.9.1 share form submission, validation, and field-array handling across all three editors. Playwright is a development dependency. Effect is deferred.

The package integration in commit 6df817f, compared with 9d7939b, shrank the three editor files from 524 to 395 lines, with a new 51-line shared form helper. Including schemas, migration parsing, protocol checks, and its interceptor fixes, application TypeScript grew from 2,596 to 2,629 lines. These historical counts include blank lines and exclude tests and configuration; they do not imply a net application LOC reduction.

At package integration, standalone `network-page.js` grew from 8,219 to 35,648 bytes (3,575 to 11,854 bytes gzipped). After the compatibility fixes it is 39,240 bytes, or 13,023 bytes gzipped. React Hook Form and its resolver run in the settings UI, and Playwright is excluded from extension runtime bundles. Header migration schemas stay outside the page entry point.

## Limits of these checks

The browser checks used local HTTP endpoints. They do not establish coverage for every website's CSP, service worker, streaming request body, or instrumentation library. Worker-originated calls remain outside version 1.

A synchronous XHR made before settings initialization passes through. The editor and popup report reload requirements through the bridge. Reloading cannot guarantee interception of a synchronous call that always runs before settings arrive. Asynchronous startup calls wait up to three seconds before falling back to the original browser APIs.

Synchronous call-server XHR exposes a response only after native body consumption. It preserves native failures, including a truncated real body after headers. The asynchronous headers boundary is unavailable through native synchronous XHR, so the editor and specification now state this limitation. Failure getters delegate to native XHR instead of retaining the wrapper's OPENED state.

Mock responses are visible to page fetch/XHR callers. Native DevTools Network records actual network traffic, as accepted in ADR 0007.
