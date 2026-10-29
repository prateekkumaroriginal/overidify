# ADR 0001: Code and Tree editing for response bodies

Status: accepted through design interview answers 1–12.

## Context

The Network Rule response body is currently a plain textarea. Users need code editing tools and structured editing for mock responses. The existing application also allows incomplete JSON, intentionally invalid JSON, and non-JSON responses, preserving them as text.

## Decision

Provide Code and Tree modes for the response body. Keep the saved body as text and preserve it exactly when switching modes. Only actual edits and explicit formatting change it.

Provide full tree editing, including structural changes and root type changes. Disable Tree for invalid JSON. Disable Tree and Format whenever the editor cannot preserve a body's data faithfully, with an explanation and continued access to Code and saving.

Use a shared undo/redo history across Code, Tree, and Format. Undo restores the previous exact text. Remember the selected mode locally, with Code as the fallback when Tree is unavailable.

Provide inline and expanded views sharing the same body and history. Target comfortable editing up to 1 MB without imposing a new saving limit on larger bodies.

The [specification](../spec.md) records the complete accepted toolset and diagnostics behavior.

## Consequences

Editor dependencies must support the application's text preservation and history requirements. A parsed JavaScript object alone is insufficient as the authoritative body because it can discard duplicate keys or change numeric values.

Code must remain available for every body. Tree availability and formatting safety are application decisions that require regression coverage. JSON diagnostics guide editing without making valid JSON a prerequisite for saving a rule.

Mode persistence is a local editor preference, separate from the exported rule data. Expanded editing must reuse the current draft and history rather than create an independent copy.

Dependency choice, formatting defaults, and concrete performance restrictions require verification during implementation.
