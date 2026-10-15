# ADR 0004: Editor defaults, shared scope matching, and popup controls

Status: accepted from the user's Round 3 answers on 2026-10-14.

## Decision

- Network Rules uses the same page-domain matching logic as Header Rules and Switch Rules.
- Invalid JSON produces a warning, but users can save and return the entered body unchanged.
- The response status starts at 200 and remains editable.
- Response headers start with Content-Type: application/json and remain editable.
- A network rule starts enabled. The user can change its enabled state in the editor before saving.
- When multiple enabled Network Rules match, the later list entry wins.
- The popup shows network rule names matching the current website, with enable toggles.
- Version 1 covers page and iframe fetch/XHR calls. Worker-originated calls are deferred.

## Consequences

Reuse the shared page-domain matcher rather than maintaining a second interpretation of website scope. Keep request URL targeting separate, with the query comparison from ADR 0003.

The response editor must preserve user-entered text even when validation warns. Default JSON headers do not restrict the body to valid JSON.

Popup matching uses the current website domain, independent of whether the page has made the target API request. Popup editing of the body or server mode is outside the accepted scope.

The request interception approach must cover frames and must document any activation or DevTools limitations before implementation.
