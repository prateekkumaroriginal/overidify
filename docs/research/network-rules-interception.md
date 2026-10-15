# Network Rules interception feasibility

Researched 2026-10-14. The research agent reviewed sources; the parent agent subsequently ran isolated Chrome probes described below. Requirements are in [the interview](../network-rules/interview.md). This investigation originally evaluated Round 5's native Network visibility requirement. The user later accepted extension-only page interception in [ADR 0007](../network-rules/adr/0007-extension-only-page-interception.md), superseding that requirement.

## Conclusion under the original native Network requirement

No complete, supported extension-only solution was established for the original native Network requirement on arbitrary websites. This is a research result, not proof that every conceivable extension technique is impossible. MAIN-world fetch/XHR interception is now selected for the revised specification.

MAIN-world fetch/XHR wrappers fail the native Network requirement. Ordinary chrome.debugger attachment conflicts with DevTools. Public DevTools extension APIs do not offer network fulfillment. Local Overrides changes native responses but its current implementation cannot supply arbitrary configured statuses or bypass-server behavior.

The strongest general-purpose candidate is a local companion using remote Chrome DevTools Protocol in a dedicated debugging profile. A bounded local HTTP smoke test passed with native DevTools connected. A local HTTPS proxy is another credible route; a site-owned service worker is credible when the website can integrate it. Each needs setup or integration beyond installing Overidify. None is selected for implementation.

The user's wording does not explicitly settle whether a redirected endpoint row is acceptable. Do not equate a mock under an extension or localhost endpoint with replacement of the original API request row.

## Extension-only candidates

### Page wrappers and debugger attachment

Chrome supports main-world execution, early document_start injection, all-frame matching, and related-origin fallback. Main-world scripts share the page environment and CSP. These can install API wrappers. [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)

Architectural consequence: bypassing the native request creates no original HTTP request row; returning a new JavaScript result after a real call leaves the real response recorded. A custom extension panel displaying mocks also fails the accepted native-panel requirement.

Chrome documents terminating an extension debugging session when DevTools opens for its tab. This rules out reliance on ordinary chrome.debugger attachment; it does not prove that other CDP transports conflict with DevTools. [Chrome debugger, onDetach](https://developer.chrome.com/docs/extensions/reference/api/debugger#event-onDetach)

### DevTools extension APIs

The network API exposes HAR, request-completion events, and response retrieval, with no fulfillment setter. inspectedWindow exposes evaluation, reload, resource retrieval, and text resource editing. Its setContent method does not document HTTP interception or configurable status/headers. A DevTools extension page is not a supported bridge to Chrome's internal Fetch agent. [DevTools network](https://developer.chrome.com/docs/extensions/reference/api/devtools/network), [inspectedWindow](https://developer.chrome.com/docs/extensions/reference/api/devtools/inspectedWindow)

### Native Local Overrides

Setup requires opening DevTools, choosing an Overrides folder, and granting access. Chrome supports overridden content and headers in Network and disables cache during Local Overrides. Its public docs expose no extension configuration API. [Local Overrides](https://developer.chrome.com/docs/devtools/overrides/)

Current main-branch source intercepts at the response stage. Its fulfillment code chooses status 200 when the body is overridden; otherwise it preserves the response status or uses 200. Header-file configuration has applyTo and headers, with no status field. This is source evidence, not a guarantee for every installed Chrome release. [NetworkPersistenceManager](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/persistence/NetworkPersistenceManager.ts), [NetworkManager](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/core/sdk/NetworkManager.ts)

Exporting files can support a manually configured 200 mock with headers, but does not meet arbitrary status, bypass-server, or complete-header-replacement requirements. A native helper writing files cannot add those missing semantics. A modified DevTools frontend could expose protocol fulfillment, but distributing and connecting that frontend is a separate product with internal compatibility dependencies.

### DNR redirects and dynamic extension responses

DNR provides redirect and header-change actions, without arbitrary response status/body fulfillment. Redirects can run before a request or after response headers using a response condition. The latter makes a new request to the redirected URL after the server has received the original request. [DNR evaluation and actions](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)

Bundled web-accessible resources serve extension URLs. use_dynamic_url changes the session identifier, not the packaged file's contents. It is not a runtime mock server. A data URL supplies body and MIME type, but Fetch's data-scheme response uses status 200, without an arbitrary HTTP header/status envelope. Redirect safety, CORS, non-GET behavior, and Network identity still need browser checks. [Web-accessible resources](https://developer.chrome.com/docs/extensions/reference/manifest/web-accessible-resources), [Fetch scheme handling](https://fetch.spec.whatwg.org/#scheme-fetch)

Extension service-worker docs describe fetch events for extension-package retrieval and extension/popup requests, excluding content-script calls. They do not establish that DNR redirecting a webpage subresource will invoke a dynamic worker handler. Treat that proposed endpoint as unproven; a successful redirected endpoint would still require acceptance of its Network identity and tests of both server modes. [Extension worker events](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/events)

## Credible routes with additional setup

### Local companion using remote CDP

Official CDP docs describe multiple clients since Chrome 63. This differs from chrome.debugger's attachment policy. Remote-client concurrency should be tested independently. [CDP documentation](https://chromedevtools.github.io/devtools-protocol/index.html)

Fetch.enable pauses matched requests; fulfillRequest supplies responseCode, headers, and body. Request-stage fulfillment supports bypass. Response-stage fulfillment supports calling the server first; requestPaused distinguishes response errors from status. Proposed mapping: snapshot at request start, continue the native call-server request unchanged, fulfill only when a real response exists, preserve errors. [Official Fetch schema](https://github.com/ChromeDevTools/devtools-protocol/blob/master/json/browser_protocol.json)

Expected result: native fulfillment for the original request with DevTools open, without proxy certificate setup. Prove original-row status/body/headers and attachment before/after DevTools opens. Local Overrides demonstrates internal native fulfillment, but does not prove every external-client observation or simultaneous interception interaction.

Setup: install/run a helper and launch Chrome with remote debugging. Chrome 136+ requires a nondefault user-data-dir; the normal default profile cannot simply acquire those switches. The dedicated profile needs Overidify and its own website sign-ins. Native messaging is a supported settings bridge, requiring a registered host binary and nativeMessaging permission. [Debugging profile requirement](https://developer.chrome.com/blog/remote-debugging-port), [Native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)

### Local HTTPS interception proxy

A proxy can synthesize before forwarding, or replace an upstream response. Mitmproxy examples show bypass with configurable status/body/headers and response modification. HTTPS requires browser proxy configuration and trust in the helper's CA. Chrome's proxy API configures fixed-server/PAC routing; it does not create an HTTP server. [Mitmproxy examples](https://docs.mitmproxy.org/stable/addons/examples/), [CA setup](https://docs.mitmproxy.org/stable/concepts/certificates/), [Chrome proxy API](https://developer.chrome.com/docs/extensions/reference/api/proxy)

Expected result: original API URL with the mock as its network response while DevTools stays open. Setup includes a running helper, proxy configuration, certificate trust, and restoration/removal paths. Test upstream failures, CORS/preflight, cookies, and existing header Rules/Switchers.

A proxy does not automatically know Chrome tab IDs or the top-level website behind a cross-origin iframe. It needs an extension-to-helper scoping/correlation design using the existing shared matcher; Origin/Referer alone does not prove equivalent scope. Snapshot behavior and live changes also need tests.

### Website-integrated service worker

A controlling website worker can supply a Response with respondWith, or fetch first then replace it. Registration requires same-origin script/scope, trustworthy origin, installation, and activation. An extension-origin or blob worker registered from an arbitrary site does not bypass those checks. [Service Worker specification](https://w3c.github.io/ServiceWorker/#register-algorithm)

Expected result: native Network records the original request's worker response; call-server may also expose an upstream worker request. Validate its exact displayed metadata. Setup requires serving/integrating a worker on every relevant website origin, coordinating with existing workers, establishing control before target calls, and connecting settings. Cross-origin iframe documents require their own origin integration.

This is viable for owned development sites, not a general extension-only solution. Worker-originated API calls remain outside accepted version 1 scope; using a worker internally is a separate architectural choice.

## Engineering gates and product follow-up

Choose acceptable setup before selecting an architecture. Recommend a bounded remote-CDP spike if a dedicated debugging browser profile is acceptable; test a proxy if the normal profile matters more and proxy/certificate setup is acceptable. Site integration requires control of relevant origins.

Verify both modes, native original-row metadata, DevTools coexistence, page/iframe fetch/XHR, shared page-domain matcher, query normalization, priority, live activation acknowledgements, reload notices, and captured in-flight settings. Test abort/CORS/network errors separately from HTTP error statuses; replacing a response does not automatically undo real server side effects.

Retain invalid entered JSON. Native XHR JSON parsing can yield null. Browser-native response semantics should remain intact; validate impossible status/header/body configurations with an editor explanation. HEAD must return no content. [XHR semantics](https://xhr.spec.whatwg.org/#the-response-attribute), [Response construction](https://fetch.spec.whatwg.org/#response-class), [HEAD](https://www.rfc-editor.org/rfc/rfc9110.html#name-head)

Capabilities described in the source review are not all tested. At this stage of the investigation, setup and deployment remained unresolved. The later Requestly comparison and ADR 0007 resolved that choice in favor of extension-only page interception.

## Isolated browser probes

The parent ran Chrome for Testing 151.0.7922.34 on Linux in temporary profiles against a local HTTP server. Tests did not touch the user's Chrome profile, certificate store, or proxy settings. The native DevTools frontend was loaded in the same headless browser and connected through a second debugging client. Assertions inspected its own NetworkLog request objects and response content, rather than an extension-specific viewer.

Direct CDP probe passed:

- Request-stage fulfillment returned status 218, X-Probe: mock, and the configured JSON body under the original API URL in native DevTools. The target server received no bypass call.
- Response-stage fulfillment made the real call, then native DevTools recorded the same mocked status, headers, and body under the original API URL.
- A socket failure remained a failed native request and rejected fetch; it did not return the mock.
- The external interceptor remained active while the native DevTools frontend was connected. Unknown status 218 required an explicit response phrase.

This establishes a bounded transport/coexistence result, not production readiness. HTTPS, XHR, frames, extension integration, startup ordering, opening DevTools before attaching the helper, reconnects, and platform packaging remain untested.

Separate DNR/WAR probe: redirecting a webpage GET to a packaged extension response served the static file at status 200. Both direct page retrieval and DNR redirection produced zero events in the extension worker's fetch handler. This tested path did not provide a dynamic body or status from that handler.

Probe source is outside the repository in `/home/prateekkumar/.local/share/codex-visualizations/overidify-network-overrides-20261014/extension-response-probe/`, with `run.cjs` for DNR/WAR and `cdp-coexistence.cjs` for native DevTools coexistence. Temporary browser profiles were removed after each completed probe.
