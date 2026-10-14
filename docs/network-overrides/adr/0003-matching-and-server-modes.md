# ADR 0003: Website scope, query matching, and complete response replacement

Status: accepted from the user's Round 2 answers on 2026-10-14.

## Decision

- An enabled override applies to all tabs on its configured website domains.
- Its request target compares query parameters without regard to their order, while requiring the same parameters and values.
- New overrides default to bypass-server mode. Each override can still select call-server mode.
- Call-server mode replaces the whole response with the configured body, status, and headers. It does not preserve unspecified response fields from the server.
- A request failure before a response exists remains a network failure in call-server mode. It does not fall back to the mock.
- The first version supports API calls made with fetch or XMLHttpRequest.
- The response body is supplied by the user through the editor. A fixed example response is not required.

## Consequences

Website scope and request targeting need separate fields. Website domain matching should reuse the existing shared matcher so Rules and Switchers remain consistent. The example API host must not be inferred to be the website's host.

Changing query values or adding a query parameter prevents an otherwise matching target from matching. Normalization details for duplicate parameters and encoding need implementation checks.

Call-server mode needs a complete configured response even though it makes a real server call. An HTTP error with a response and a transport failure without a response are distinct cases.

Editor defaults, validation, worker coverage, activation, and the browser mechanism remain open.
