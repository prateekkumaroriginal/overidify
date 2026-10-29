# Response editor glossary

| Term | Meaning |
| --- | --- |
| Response body | The exact text saved on a Network Rule and used as its mock response content. |
| Code mode | Direct text editing with code tools; available for JSON and non-JSON bodies. |
| Tree mode | Structured JSON editing of values, properties, array items, and types. Available only for valid JSON that can be represented faithfully. |
| Format | An explicit action that changes JSON formatting while preserving its data. |
| Exact-text preservation | Keeping the same response string, including whitespace and numeric spellings, until an editing or formatting action changes it. |
| Safe transformation | A tree edit or formatting action that preserves the intended data without silently losing or changing unrelated values. |
| Shared history | One undo/redo sequence spanning Code, Tree, and Format, with exact previous response text recoverable. |
| Mode preference | The locally remembered selection of Code or Tree, with fallback to Code when Tree is unavailable. |
| Expanded view | A larger editing view sharing the inline editor's current body and history. |
