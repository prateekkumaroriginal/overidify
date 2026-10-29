# JSON editor design interview

Status: interview complete. Product requirements are confirmed; implementation is recorded in the [validation notes](validation.md).

The requested `grill-with-ui` skill is available. Its `grill-with-docs` dependency references unavailable `grilling` and `domain-modeling` skills. Questions use the available `grill-me` guidance and the requested interactive answer UI.

## Confirmed decisions

1. Improve the Network Rule response-body field. Keep other rule fields in their existing forms.
2. Provide both code and tree editors, with a switch between them.
3. Preserve the exact response text when switching modes. Rewrite it only after an actual tree edit or an explicit Format action.
4. Keep Code mode available and disable Tree mode while the body is not valid JSON. Explain why Tree is unavailable, and continue allowing saving the exact text.
5. If the editor cannot preserve a JSON body faithfully, keep it in Code mode and disable Tree and Format with an explanation. Continue allowing exact-text saving.
6. Include syntax highlighting, line numbers, bracket matching, auto-indentation, folding, search/replace, undo/redo, and an explicit Format action.
7. Allow Tree mode to edit values, rename object keys, add and delete properties and array items, reorder array items, and change JSON value types, including the root value.
8. Use one undo/redo history across Code, Tree, and Format. Switching modes does not create an undo step. Undo restores the exact previous response text.
9. For JSON responses, show live syntax error markers in Code and a concise message with line and column. Do not block saving. For non-JSON responses, explain Tree unavailability without marking the text as erroneous.
10. Remember the last selected mode locally across rules and sessions. Fall back to Code whenever Tree is unavailable.
11. Keep the editor inside the response panel and add an expanded editing view with the same body and history. Returning inline preserves unsaved edits.
12. Target comfortable editing for response bodies up to 1 MB. Preserve and allow saving larger bodies; explain and restrict expensive editor features if necessary.

## Interview format

Questions 1–6 were answered individually. After the user requested related questions in rounds, the unanswered question 7 was grouped with questions 8–12. Future follow-up questions should be grouped where they can be answered independently, with at most ten questions in a round.

## Existing behavior

- The response body is currently a plain textarea.
- Invalid JSON produces a warning when the response content type indicates JSON. Saving and returning the text is allowed.
- HEAD requests and statuses 204, 205, and 304 return no body, but preserve the entered text.

## Result

See the [specification](spec.md), [accepted architecture decision](adr/0001-dual-mode-response-editor.md), and [glossary](glossary.md).

Editor dependency choices, capability verification, and performance measurements are recorded in the validation notes. Recommendations or implementation assumptions beyond these twelve answers are not additional user decisions.
