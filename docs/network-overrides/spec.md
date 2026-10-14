# Network Overrides

Status: accepted after the interview and Requestly comparison. Implementation uses extension-only page-level interception, as recorded in ADR 0007.

## Purpose

Add a Network Overrides tab beside Rules and Switchers. Users configure responses received by page and iframe fetch/XHR callers, with either a full mock or replacement after a real server call.

## Editor

Each override has a name, website domain pattern, target request URL, method, enabled state, server mode, response body, response status, and response headers.

- Method starts at GET; another method or Any can be selected.
- Enabled starts true; the user can toggle it before saving.
- Server mode starts at bypass server.
- Status starts at 200.
- Headers start with Content-Type: application/json.
- Users type or paste the body into an editor. Preserve their text.
- Invalid JSON produces a warning when the response declares JSON; saving remains available.
- Body, status, and headers are editable.

Use existing list, naming, storage, editor navigation, and deletion conventions for routine behavior. Save configuration locally, including enabled state. These are engineering defaults based on the existing product, rather than additional interview decisions.

## Matching

Select eligible tabs using the same page-domain matcher as Rules and Switchers. Its host, optional port, wildcard, and path behavior must stay consistent across all three features. Iframe calls use the eligible top-level tab's website scope, consistent with existing header rules.

Within an eligible tab, match the outgoing request URL and the selected method. Any accepts all methods. Query parameter order does not matter; the same query parameters and values are required. Preserve case-sensitive paths and query values. The later enabled Network Override in list order wins if multiple entries match.

The example target is GET `https://backendapi-qa.topfan.dev/api/get-chatGroups-and-users?tab=featured&counts=true`. A URL with the two query parameters reversed matches. Changing tab to another value or adding a parameter does not match.

## Server behavior

Bypass server returns the configured mock without making the target network call.

Call server makes the original request, preserving normal matching header Rules and Switchers. Fetch and asynchronous XHR deliver the entire configured mock once real response headers arrive. Do not inherit fields from the real response. A transport failure before headers remains a failure, with no mock fallback. A failure while downloading the real body after headers does not undo the delivered mock. An HTTP error that supplies a response is distinct from a transport failure.

Capture the selected override configuration when the request starts. Subsequent edits or toggles affect later requests, while the in-progress request retains its starting configuration.

## Activation and popup

Apply saved changes to subsequent requests in eligible open tabs live where possible. Clearly indicate when a page reload is needed. Do not imply that changing a mock reruns a request or updates already-rendered content.

The popup lists Network Overrides whose website pattern matches the current tab, with names and enable toggles. Popup eligibility does not depend on observing an API call. Response editing remains in settings.

Overrides must work while Chrome DevTools is open.

The page receives the configured response. Native DevTools Network can display the original server response in call-server mode; bypassed requests do not make a target network call. The user accepted this Requestly-style behavior after clarification, superseding native mock visibility from Round 5.

Use the existing extension installation and normal browser profile, with no local helper, proxy, certificate setup, or separate browser profile.

## Scope

Version 1 covers page and iframe fetch/XHR. Worker-originated calls, request redirects, response capture, uploaded response files, artificial delay, and replacement of navigation or asset requests are outside the accepted first-version scope.

Chrome omits MAIN scripts from sandbox frames without allow-scripts. An accessible same-origin parent installs those frames' APIs as they are inserted or loaded and supplies live settings. Opaque script-disabled frames cannot execute page calls or expose their APIs to a parent and do not require an activation acknowledgement. Frames running a MAIN interceptor are tracked by browser document ID to keep live updates and reload notices tied to the current document.

Frame discovery watches accessible sandbox documents and open or closed shadow roots created through attachShadow, including nested frame insertions. Each cloned fetch body retains independent cancellation until its own consumer finishes, even after another branch has consumed the response.

The installed extension supports synchronous XHR after settings initialization. A synchronous call made before settings arrive cannot wait for asynchronous extension messaging and passes through to the server. The bridge reports this condition as requiring reload. Asynchronous startup calls wait for settings, with a three-second fallback to native requests if initialization fails.

Initialized synchronous bypass calls return the configured mock. Synchronous call-server XHR waits for native completion, then replaces a successful native response. Any native failure preserves its exception and native response state, including a truncated body after server headers. Chrome does not expose intermediate headers during synchronous send; the page interceptor cannot apply the asynchronous headers boundary to these calls. This is a limitation of the chosen mechanism, clarified during compatibility review. The [XHR synchronous send algorithm](https://xhr.spec.whatwg.org/#the-send()-method) consumes the native response body before exposing a response.

Response statuses must be integers from 200 to 599. HEAD and statuses 204, 205, and 304 have no returned body, while the saved body remains editable. Headers must satisfy browser header validation. Mock Set-Cookie headers are rejected because page-level interception does not set browser cookies.

## Verification

Verify early page requests, existing-tab activation, nested and cross-origin frames, configuration delivery, abort and timeout behavior, XHR events and response types, rejected real fetches, valid HTTP error responses, and DevTools coexistence.

Define URL normalization for duplicate query keys and encoding consistently, and validate statuses and headers against the selected browser mechanism. Verify that page-visible mocks keep working while native DevTools is open.

Verify JSON warnings preserve the original body. Confirm Rules and Switchers still share the same matcher and the real call receives their headers. Confirm bypass mode makes no target server call and an in-flight mock does not change after edits.

The [implementation validation record](validation.md) records the automated and installed-browser checks.

## Decision records

- [Tab](adr/0001-network-overrides-tab.md)
- [Mock scope and server modes](adr/0002-mock-response-scope.md)
- [Website scope and query matching](adr/0003-matching-and-server-modes.md)
- [Editor, priority, and popup](adr/0004-editor-and-activation.md)
- [Live updates and compatibility](adr/0005-live-updates-and-compatibility.md)
- [Native Network response visibility](adr/0006-native-network-response-visibility.md)
- [Extension-only page interception](adr/0007-extension-only-page-interception.md)
