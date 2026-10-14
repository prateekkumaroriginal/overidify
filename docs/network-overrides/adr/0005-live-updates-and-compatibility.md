# ADR 0005: Live updates and DevTools compatibility

Status: accepted from the user's Round 4 answers on 2026-10-14.

## Decision

- New overrides start with method GET. The user can choose another method or Any.
- Saved edits and enabled-state changes apply to subsequent requests live where possible. Show a clear reload requirement when live activation cannot work.
- A call-server request retains a snapshot of the selected override taken when the request starts. Later edits, deletion, or disablement do not change that request's selected mock.
- Existing matching header Rules and Switchers continue to apply normally to real requests in call-server mode.
- Overrides must remain active while Chrome DevTools is open.

## Consequences

Represent Any explicitly rather than assuming a blank method is GET. Settings updates should refresh eligible open tabs without pretending the already-rendered page has fetched new data.

Keep request selection and the response snapshot together for the request lifetime. Cancellation by the page remains a separate behavior to preserve.

Continue using the existing header engine for real network calls. A bypassed call has no network request for that engine to modify.

The interception approach must satisfy DevTools coexistence. Chrome documents debugger session termination when DevTools opens, making reliance on that session unsuitable for this requirement. See [Chrome debugger onDetach](https://developer.chrome.com/docs/extensions/reference/api/debugger#event-onDetach). Page-level interception remains a candidate pending feasibility checks.
