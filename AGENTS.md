# Project instructions

## URL matching

- Rules and Switchers must always use the same URL matching logic. Network Overrides must share their website-domain matching behavior.
- Reuse `src/lib/pattern.ts` for website matching. Network Overrides' API request URL matching is a separate concern.

## Dependencies and complexity

- Before writing custom infrastructure, evaluate maintained packages that could reduce the code we own. Prefer a package when it simplifies the implementation and preserves required behavior.
- Verify behavior before replacing an existing implementation with a library. Account for supported cases such as synchronous XHR, rather than comparing only the common path.
- Keep browser testing dependencies in development dependencies.

## Network interception

- When changing Network Overrides, read `docs/network-overrides/spec.md` for the accepted behavior and `docs/network-overrides/validation.md` for verification coverage and limits.
- Give each request an explicit lifecycle and ownership of its timers. Transfer or clear timers when handing control to native APIs, and complete each request once.
- Prepare request metadata before dispatching events whose handlers can call `send()`. Keep native and synthetic state consistent for legal operations such as changing `responseType` after headers arrive.

## Verification and review

- Keep installed-extension regression tests in the repository and runnable through project test scripts. Model and validation tests alone do not verify browser interception.
- For interception changes, test both unmatched passthrough and mocked requests, including startup, reentrant event handlers, response types, aborts, and timeouts.
- Reproduce confirmed review bugs, add regression coverage, and fix them before declaring the change merge-ready. Report unresolved findings and distinguish verified behavior from assumptions.
