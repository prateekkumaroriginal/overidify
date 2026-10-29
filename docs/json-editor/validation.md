# Response editor validation

## Implementation

CodeMirror provides Code editing and the document history shared by Code, Tree, and Format. The JSON parser checks strict JSON syntax and transformation safety before structured operations. Tree edits handle object properties, array items and order, scalar values, and root types.

Tree and Format reject duplicate keys and numbers whose decimal value cannot survive the editor's numeric representation. Bodies over 1,000,000 UTF-8 bytes or nesting beyond 100 levels stay in Code with an explanation. Tree branches render at most 100 children initially, with controls to show more.

The saved body remains a string. Mode preference uses local browser storage independently from rule storage and export. The editor bundle loads when the Network Rule body editor is opened.

## Completed checks

- Focused regression tests cover invalid and unsafe JSON, tree edits, exact-text history restoration, failed transformations, size and depth restrictions, formatting, and mode preference persistence and failure handling.
- Typechecking and lint pass.
- Production build passes.
- One-time Playwright checks on the production extension pass for mode switching without text changes, exact-text saving, Tree edits, cross-mode undo, expanded editing, JSON diagnostics, nonblocking invalid-body saving, unsafe-number restrictions, mode persistence and fallback, Enter and Escape, and mobile page overflow.
- Desktop and 390-pixel mobile screenshots were inspected. Syntax colors use semantic theme variables for contrast on the extension's dark background.
- A 967,791-byte nested fixture took approximately 308 ms to fill and validate in Code and 355 ms to open its array in Tree on this machine. Only the visible batch of children was mounted.
- A response over 1 MB saved intact with Tree and Format unavailable.
- No page errors occurred during the one-time checks.

## Review and regression results

The two-axis review found no hard repository-standard violations. Its correctness and spec reviews identified three distinct problems, all corrected and verified with one-time production-extension checks:

- Decoded strings and property names could lose CR/LF in single-line inputs. Tree fields now edit quoted JSON strings and escapes, preserving those characters. Regression coverage also checks control characters through the tree transformation boundary.
- Enter could submit the form, and Ctrl+Enter could save before a focused tree edit was committed. Enter now commits without saving. Ctrl+Enter commits before the existing save shortcut, including in expanded view; invalid pending changes prevent shortcut submission and show an error.
- Deferred analysis could unmount and collapse Tree during edits. Tree actions now refresh analysis synchronously; Code diagnostics retain deferred analysis. Expanded branches stay mounted during edits.

Returning inline also retains the active mode instead of focusing and selecting the first mode tab.

All 85 unit tests pass. The full extension suite initially passed 46 of 47 tests. Its Chrome appearance test timed out twice because Chromium exposes `#colorSchemeModeSelect` but keeps it hidden on `chrome://settings/appearance`. The failing selector is in the existing browser-appearance test; it is unrelated to the response editor. This is an outstanding suite/environment limitation.

After the review fixes, all 46 other extension tests passed again. Final application and E2E typechecks, lint, the production build, and the focused production-extension checks also passed.

One-time scripts, screenshots, logs, and isolated profiles were kept under `.scratch/verification/json-editor/` and removed after results were recorded.
