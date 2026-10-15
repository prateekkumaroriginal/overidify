# ADR 0006: Show mocked responses in native DevTools Network

Status: superseded by [ADR 0007](0007-extension-only-page-interception.md) after the Requestly comparison on 2026-10-14. The original decision below records interview history.

## Decision

The mocked status, headers, and body must appear in Chrome DevTools' native Network panel while network rules remain active.

## Consequences

Changing only the response received by page fetch/XHR cannot satisfy the accepted behavior. Do not implement that approach as the complete feature or replace the requirement with an extension-specific request viewer.

Keeping network rules active with DevTools open remains required by ADR 0005. Browser-level interception therefore needs further research and proof before implementation. Existing scope, matching, editor, server-mode, and header-engine decisions remain accepted.
