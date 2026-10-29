# Network Rule response editor

Status: product requirements confirmed through the [design interview](interview.md). Implemented; see [validation](validation.md) for checks and limits.

## Scope

Replace the Network Rule response-body textarea with Code and Tree editing modes. Keep the other rule fields in their existing forms. Both modes edit the same response body, which remains stored and returned as text.

## Text preservation and transformations

- Opening a body, switching modes, and changing between inline and expanded views preserve the exact response text.
- Mode switches and view changes do not create body undo steps.
- Code edits update the body as text. An actual tree edit or explicit Format action may rewrite its representation.
- Tree edits and Format must preserve JSON data faithfully. If that cannot be guaranteed for a body, disable Tree and Format and explain why. Keep Code and exact-text saving available.
- Evaluate large numbers, duplicate object keys, and other representations that an editor may normalize or discard. Parsing successfully does not by itself establish that a transformation is safe.
- Do not repair invalid JSON automatically.

## Code mode

Provide syntax highlighting, line numbers, bracket matching, auto-indentation, folding, search/replace, undo/redo, and an explicit Format action.

For JSON responses, show live syntax error markers and a concise message with line and column. Errors do not block saving. For non-JSON responses, explain why Tree is unavailable without labeling the response text erroneous.

Invalid JSON, an empty body, HTML, and plain text remain editable and saveable. Invalid JSON disables Tree. Format must not replace invalid input with repaired or partial output.

## Tree mode

Support:

- Editing values and renaming object keys.
- Adding and deleting properties and array items.
- Reordering array items.
- Changing JSON value types, including the root value.

Support JSON objects, arrays, strings, numbers, booleans, and null. Tree availability depends on valid JSON and safe representation, rather than requiring an object or array root.

An unavailable tree must explain the restriction. It must not display a stale tree from an earlier valid body as if it represents the current response.

## History and state

Use one undo/redo history for Code edits, Tree edits, and Format. Undo restores the exact previous response text, including the representation from before a tree edit or formatting action. Switching modes must not reset history.

Remember the last selected mode locally across rules and sessions. Fall back to Code whenever Tree is unavailable. This preference is editor state, separate from the response body.

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
- Verify transformation safety before enabling Tree or Format. Account for duplicate keys and numeric precision rather than relying on plain parse-and-serialize behavior.
- Reuse the application's response content-type interpretation for diagnostics. Determine valid body capabilities independently from whether the content type labels the response JSON.
- Define formatting defaults, diagnostic update scheduling, history grouping, and measurable performance checks. Verify behavior with representative nested responses up to the agreed size target.
- Check editor keyboard handling against the existing form shortcuts. Enter in the editor must remain usable, and editor controls must not accidentally submit or navigate away from the rule.
- Verify expanded-view focus, scrolling, and keyboard behavior, and integration with pending saves and form dirty state.

## Validation

Retain regression coverage at public application boundaries for meaningful behavior:

- Exact text survives mode changes and saving, including invalid and non-JSON bodies.
- Availability decisions reject invalid or unsafe transformations while keeping saving available.
- Tree operations preserve unaffected data, including root values and array order.
- Code, Tree, and Format share undo/redo with exact-text restoration.
- Mode preference persistence and fallback handle unavailable Tree mode.
- Larger bodies remain preserved and saveable when features are restricted.
- Transformation failures retain the body rather than replacing it with partial output.

Verify editor controls, diagnostics display, mode switching, expanded layout, focus, and keyboard integration during implementation. Keep one-time scripts, screenshots, and logs under `.scratch/verification/<task>/`, report the results, and remove them afterward. Do not retain regression tests that merely reconfirm framework controls or routine rendering.
