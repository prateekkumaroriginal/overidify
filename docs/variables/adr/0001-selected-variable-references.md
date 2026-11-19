# 0001: Variable references are selected tokens, not parsed text

Status: accepted, 2026-11-19. Decided by the design sub-agent under the user's delegation.

## Context

The user asked for a suggestion list opened by typing `{{`, filtered while typing, and confirmed with Enter, and said a variable would "only be selected from an activated dropdown." Earlier proposals treated any `{{NAME}}` text as a reference, which needed a backslash escape and a malformed-syntax error state. The user then asked whether the dropdown answer also settles malformed syntax.

Template fields include mock response bodies and header values, where literal `{{...}}` text is legitimate. Mustache and Handlebars responses are common examples. Existing saved rules and exports may already contain that text.

## Decision

A reference exists only when the user confirms a suggestion. It is stored as a structured part, `{ "variable": "NAME" }`, inside a `{ "template": [...] }` field value. Everything typed or pasted as text is literal, including an exact `{{NAME}}`. Overidify editors move references through a private clipboard flavor. Other clipboard sources insert plain text.

## Consequences

- No escape syntax, malformed-reference errors, or whitespace rules inside braces are needed. Rounds 2.2 (spacing tolerance) and 3.2 (preserving reference spacing) apply only to the filter query.
- Existing data and version 1/2 exports keep their exact meaning without migration.
- A literal `{{NAME}}` and a reference can look alike, so every surface renders references as chips. The chip is the only marker, and this is the main usability cost.
- Rule schemas, exports (version 3), and execution snapshots carry `TemplateText` instead of strings. Every text field needs the shared CodeMirror `TemplateInput` rather than a native `<input>`.
- Users cannot write references by hand in an external editor except by hand-writing version 3 JSON, which import validates.

## Alternatives rejected

- **Text templates** where any valid `{{NAME}}` resolves. This is simpler to store, but it contradicts the user's "only selected" requirement, silently changes existing literal text, and needs escaping rules.
- **Sentinel characters inside strings.** This keeps string fields, but collides with arbitrary literal text, produces opaque exports, and needs escaping of its own.
