# ADR 0007: Use extension-only page interception

Status: accepted after the Requestly comparison and the user's "ok i am convinced" response on 2026-10-14. Supersedes ADR 0006.

## Decision

Use page-level fetch/XHR interception in the existing extension and normal Chrome profile. Deliver configured mocks to the page while DevTools remains open and usable. No companion program, separate browser profile, proxy, or certificate setup is required.

The native Network panel can display the original response in call-server mode. In bypass-server mode there is no actual target network call to display. Native mocked-response visibility from ADR 0006 is no longer required.

## Consequences

Install interceptors in the page's main execution world and use an isolated extension bridge for settings. Preserve the accepted body, status, complete-header replacement, failure, priority, matching, and in-flight snapshot behavior. Requestly's implementation is a reference for the mechanism, not a source of product defaults.

Verify page and iframe behavior in the installed extension, including DevTools coexistence. Explain Network panel behavior briefly in the Network Rules editor.
