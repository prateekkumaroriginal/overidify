# Variables

Variables let a value such as `STAGE_AUTH_TOKEN` be stored once and used in any rule field. See [rule behavior](../rule-behavior.md#variables) for the user-facing summary.

## Decisions

| Topic | Decision |
| --- | --- |
| Where variables live | One global list on a **Variables** page, opened from the side panel behind the sliders icon in the Settings header. No environments. |
| Columns | Name, Value, Usage (count of rule fields, with a `?` tooltip), Secret (switch), Delete. |
| Fields that accept variables | Every rule text field except rule and option names. |
| Creating a reference | Only by picking from the `{{` suggestions, or by **Create** in them. |
| Typed or pasted `{{NAME}}` | Always plain text. Copying gives `{{NAME}}` text; pasting never creates a variable. |
| Display | `{{NAME}}` in color, braces dimmed. A missing variable is red with a wavy underline. |
| Missing or invalid variable | The rule is turned off and its switch is locked until fixed. It never turns itself back on. |
| Exports | References by name, `{ "variable": "NAME" }`, in format version 3. No values and no option to include them. |
| Popup | Uses filled-in domains for matching and shows why a rule is off. It does not manage variables. |

## Storage

Variables are stored in `chrome.storage.local` under `variables` as `{ id, name, value, secret }`. Names are unique ignoring case.

A field that holds a variable stores `{ "segments": ["Bearer ", { "variableId": "…", "name": "STAGE_AUTH_TOKEN" }] }`. A plain string is always literal, so existing rules need no migration. A reference resolves by `variableId`; when that variable is gone, a variable with the same name takes its place. Every rule write refreshes each reference's ID and name to its current variable.

## Resolution

`resolveRules` in `src/lib/rule-resolution.ts` is the only path from saved rules to the rules that run. The header worker, the Network worker, the popup, Settings cards, and editors all use it, so every surface matches websites with the same filled-in domains. Values are inserted in one pass without trimming or escaping. Fields with variables are validated after filling in: domains, header names and values (no empty value or line break), request URLs, and response headers. Problems name fields and variables, never values.

## Turning rules off

`prepareRulesForSave` runs on every rule write: editor saves, toggles, Switch option changes, imports, duplicates, and Variables page saves. An enabled rule with problems is saved with `enabled: false`. Toggles stay locked while a turned-off rule has problems. The Variables page asks before a save that would turn rules off and writes the variables and those rules in one storage write, under the header, Network, and variables locks in that order.

## Editing

Template fields use CodeMirror. Each variable is one private-use character (U+E000) in the document, with its reference kept in a state field and mapped through every change, so edits cannot split it. Typed, pasted, and dropped text has that character removed. Undo restores removed variables. The response body treats each variable as one JSON value character, so JSON checks and Format keep exact positions and leave variables in place.

## History and runtime

Header and Network execution snapshots record `{{NAME}}` display text, never values. Pages receive only enabled Network Rules that can run, with values filled in, plus display text for history.
