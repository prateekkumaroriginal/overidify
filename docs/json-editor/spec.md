# Network Rule response editor

Status: implemented. Tree editing was removed at the user's request. The [design interview](interview.md) records the original requirements; this specification describes the current editor. See [validation](validation.md) for checks and limits.

## Scope

Provide a code editor for the Network Rule response body. Keep the other rule fields in their existing forms. The response body remains stored and returned as text.

## Text preservation and transformations

- Opening a body and changing between inline and expanded views preserve the exact response text.
- View changes do not create body undo steps.
- Text edits update the body directly. An explicit Format action may rewrite its formatting.
- Format must preserve JSON data faithfully. If that cannot be guaranteed for a body, disable Format and explain why. Keep editing and exact-text saving available.
- Format changes whitespace around source tokens, preserving numeric spellings, duplicate object keys, and their order.
- Do not repair invalid JSON automatically.

## Code editor

Provide syntax highlighting, line numbers, bracket matching, auto-indentation, folding, search/replace, undo/redo, and an explicit Format action.

For JSON responses, show live syntax error markers and a concise message with line and column. Errors do not block saving. For non-JSON responses, explain why Format is unavailable without labeling the response text erroneous.

Invalid JSON, an empty body, HTML, and plain text remain editable and saveable. Format must not replace invalid input with repaired or partial output.

## History and state

Use one undo/redo history for text edits and Format. Undo restores the exact previous response text, including the representation from before formatting.

Keep the editor inline in the response panel and provide an expanded editing view. Both views share the current body and undo history. Returning inline preserves unsaved edits.

## Response size

Target comfortable editing for bodies up to 1 MB. Preserve larger bodies and allow saving them. Explain any restrictions on expensive features for larger bodies. The target is not a new maximum body size for saving.

## Existing behavior to preserve

- Saving the body remains part of saving a Network Rule through its existing form.
- Invalid JSON warnings do not become form validation failures.
- HEAD requests and statuses 204, 205, and 304 return no body but retain the entered text.
- Status, response headers, request matching, and server behavior retain their existing controls and semantics.

## Implementation constraints

These are engineering constraints, not additional user decisions. See the validation notes for the implementation and measured results:

- Select editor dependencies that work in the extension environment and expose the required editing, diagnostics, and shared-history capabilities.
- Apply formatting edits to the source text without parsing and reserializing values, so duplicate keys and numeric spellings survive.
- Reuse the application's response content-type interpretation for diagnostics. Determine valid body capabilities independently from whether the content type labels the response JSON.
- Define formatting defaults, diagnostic update scheduling, history grouping, and measurable performance checks. Verify behavior with representative nested responses up to the agreed size target.
- Check editor keyboard handling against the existing form shortcuts. Enter in the editor must remain usable, and editor controls must not accidentally submit or navigate away from the rule.
- Verify expanded-view focus, scrolling, and keyboard behavior, and integration with pending saves and form dirty state.

## Validation

Retain regression coverage at public application boundaries for meaningful behavior:

- Exact text survives view changes and saving, including invalid and non-JSON bodies.
- Availability decisions reject invalid JSON and resource-limited formatting while keeping saving available.
- Text edits and Format share undo/redo with exact-text restoration.
- Larger bodies remain preserved and saveable when features are restricted.
- Transformation failures retain the body rather than replacing it with partial output.

Verify editor controls, diagnostics display, expanded layout, focus, and keyboard integration during implementation. Keep one-time scripts, screenshots, and logs under `.scratch/verification/<task>/`, report the results, and remove them afterward. Do not retain regression tests that merely reconfirm framework controls or routine rendering.
