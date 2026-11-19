# Variables

Status: implemented; see [Implementation notes](#implementation-notes) for the details the design left open. The [interview](interview.md) records the user's answers and the design decisions made on the user's behalf. [ADR 0001](adr/0001-selected-variable-references.md) explains why references are stored as selected tokens rather than parsed from text. Terms are defined in the [glossary](../../GLOSSARY.md).

## Purpose

Let users enter a value such as an auth token once and use it in many rules. Changing the value in one place updates every rule that references it.

Version one supports manually entered text values in one shared set per Overidify installation. Variables are stored locally and never synchronized, exported, or imported. Automatic token capture, generated values, environments, collections, and per-website values are outside this version.

## Summary of decisions

| Topic | Decision |
| --- | --- |
| Where references work | Every editable text field in a rule (see [Template fields](#template-fields)). |
| How a reference is created | Only by confirming a suggestion opened by typing `{{`. |
| Typed or pasted plain text `{{NAME}}` | Always literal. There is no escape syntax and no malformed-reference error. |
| Storage | Fields holding references use a structured template value. Plain strings stay literal. |
| Names | Case-sensitive, `[A-Za-z_][A-Za-z0-9_]*`, 1–64 characters, unique. |
| Substitution | Literal, single pass. No recursion, URL encoding, or JSON escaping. |
| Values | Exact text, including whitespace, line breaks, and the empty string. |
| Problems | Rules save; a variable problem makes the rule inactive without changing its enabled toggle. |
| Switch Rules | Only the selected option's problems affect activation. |
| Mock JSON | Invalid JSON after substitution is a warning only. |
| Variables page | Staged draft with Save and Cancel, values hidden until revealed. |
| Rename | Rewrites references in all saved rules and open editor drafts. |
| Delete | Allowed after confirmation; references remain and turn missing. Recreating the name repairs them. |
| Export/import | References are exported; values never are. Import reuses local variables by exact name. |
| Execution history | Templates only. Values Overidify inserted are kept out of captured observations. |

## Variables

### Data

Store variables in `chrome.storage.local` under the key `variables`:

```json
[
  { "id": "6f1c0d0e-7c55-4a8f-9a53-2c1f7f9b7a10", "name": "AUTH_TOKEN", "value": "abc123" },
  { "id": "0b6a2f43-3d9e-4c1e-8f43-51c0f2d7e8aa", "name": "TENANT", "value": "acme" }
]
```

- `id` is a UUID. Rules never store it; it lets open pages tell a rename from a delete plus a create.
- `name` follows the name rules below. Names are case-sensitive, so `AUTH` and `auth` are different variables.
- `value` is any string, including `""`, whitespace, and line breaks. It is never trimmed or normalized.
- Order in storage has no meaning. The Variables page sorts by name: case-insensitive first, then by code point to break ties.
- Normalizing persisted data drops entries that are not objects or that lack a string `name`/`value`. An entry with a missing or invalid `id` gets a new UUID. If two entries share a name, the first one is kept. Invalid names are kept so the user can fix them on the Variables page, but they never resolve references.

### Name rules

- Pattern `^[A-Za-z_][A-Za-z0-9_]*$`, length 1–64.
- Unique by exact, case-sensitive comparison.
- Error messages: `Use letters, digits, and underscores, starting with a letter or underscore.`, `Use 64 characters or fewer.`, `Another variable already uses this name.`

### Storage and locks

Variables are local only. They survive browser restarts. They are not placed in `chrome.storage.sync` or included in exports or backups.

Every Variables page Save takes the existing locks in a fixed order: `requestHeaderRules`, then `networkRules`, then `variables`. This is the order import already uses. Inside the locks, Save reads the latest stored variables and rules, applies the draft as a diff, and writes all changed keys in one `chrome.storage.local.set` call. Rule saves keep taking only their own lock. They do not read variables to decide whether a save is allowed.

## Template fields

A **template field** can hold variable references. In version one these are:

| Rule type | Template fields |
| --- | --- |
| All rules | Rule name; each website domain |
| Header Rule | Each header name and value |
| Switch Rule | Each option name; each option's header names and values |
| Network Rule | API request URL; response body; each response header name and value |

Method, status, server mode, the enabled toggle, Switch option selection, rule and option IDs, and order keep their typed controls and cannot hold references. Variable names and values on the Variables page are not template fields, so a value never contains a reference.

### Stored representation

A template field stores either a plain string, which is always literal, or a template object:

```ts
type VariableReference = { variable: string }
type TemplatePart = string | VariableReference
type TemplateText = string | { template: TemplatePart[] }
```

Example: a header value of `Bearer ` followed by the AUTH_TOKEN reference is stored as:

```json
{ "key": "Authorization", "value": { "template": ["Bearer ", { "variable": "AUTH_TOKEN" }] } }
```

Canonical form, applied whenever a value is saved, compared, or exported:

- Merge adjacent strings and drop empty strings.
- A template with no references becomes a plain string.
- A reference name must match the name pattern. Otherwise the template is invalid: the rule is rejected on import, and normalization of persisted data turns that part into literal text `{{name}}` so the rule stays editable.
- Two templates are equal when their canonical forms are deeply equal. Dirty checks, duplicate-domain checks, and import overlap displays use this equality.

Website scopes keep their existing shape: one `TemplateText` or an array of `TemplateText`. A template object is never an array, so `["a.com", "b.com"]` remains a two-domain list.

**Display text** renders a template as literal text with each reference written `{{NAME}}`. Display text is used for search, duplicate-name generation, option-name uniqueness, tooltips, accessible labels, and the clipboard's `text/plain` flavor. It never contains values.

### Normalization of template fields

The current trimming rules apply to the outer literal edges of a template: leading whitespace in the first part when that part is a string, and trailing whitespace in the last part when that part is a string. This applies to names, header names and values, response header names and values, the request URL, and website domains. Response bodies are not trimmed, as today. Text inside a template and values substituted into it are never trimmed.

A literal-only website domain is normalized with `getDomainPattern` as it is today: scheme, path, query, and fragment are removed and the host is lowercased. A domain containing a reference is stored as entered, with only edge trimming. At resolution time the resolved string goes through `getDomainPattern` and `isValidDomainPattern`. This keeps variable names case-sensitive while hosts stay case-insensitive.

A header pair is empty only when both its name and value are empty strings. A reference counts as content.

## Editing references

All template fields use one shared single-line `TemplateInput` component built on CodeMirror 6, which is already a dependency. The response body keeps its multi-line CodeMirror editor and adds the same template extension. The editor document holds the display text. Reference ranges are kept in a `StateField` and mapped through every change. Undo and redo restore references through `invertedEffects`. References are atomic ranges (`EditorView.atomicRanges`), so the caret cannot enter them and a single Backspace or Delete removes a whole reference. A change that partly overlaps a reference, including a search-and-replace match inside one, is widened to replace the whole reference.

The single-line component rejects line breaks. Typed Enter keeps each field's current behavior, such as adding a website domain. Pasted line breaks are removed, matching a native `<input>`.

### Suggestions

- Typing a second consecutive `{` opens a suggestion list anchored at the caret. Only typed input triggers it; paste, drop, undo, and IME composition do not. With `{{{`, the list anchors to the last two braces.
- The query is the text between `{{` and the caret. Leading spaces are ignored.
- Saved variables with valid names are listed by name only. Values never appear. Draft rows on an unsaved Variables page are not listed.
- Matching is case-insensitive. Ranking: exact case-sensitive match, then prefix matches, then substring matches, with ties sorted by name. The first item is highlighted.
- Up and Down move the highlight. Enter or a click confirms. Escape closes the list and leaves the typed text.
- The list closes without inserting anything when the caret leaves the range from `{{` to the query end, the field loses focus, a selection becomes non-empty, the user types any character other than a letter, digit, underscore, or leading space (including `}`), or the query exceeds 64 characters.
- Confirming replaces `{{`, the query, and any `}}` directly after the caret with a reference. That `}}` may come from the body editor's bracket auto-closing.
- With no matches, the list shows `No matching variable` and an **Open Variables** link. With no variables at all, it shows `No variables yet` and the same link. The link opens `options.html#/variables` in a new tab so the current draft is kept. While nothing is highlighted, Enter closes the list and then performs the field's normal Enter action.
- While the list is open, its Enter, Escape, and arrow keys call `preventDefault` and stop propagation. Escape therefore does not close the rule editor (`useEditorShortcuts`), cancel a domain edit, or leave Select mode. Ctrl+Enter still saves the form.
- Accessibility: the field exposes `aria-expanded`, `aria-controls`, and `aria-activedescendant`, and the list is a `listbox`.

### Presentation

- A reference appears as a chip with the text `{{NAME}}`, in monospace on a violet tint. It looks the same in every editor, rule card, popup row, Switch option list, website domain pill, and DevTools execution view.
- A reference to a missing variable uses the destructive color with a warning icon. Its tooltip and accessible name read `Missing variable NAME`. A resolved reference's accessible name is `Variable NAME`.
- Literal text that happens to read `{{NAME}}` is plain text with no chip. The chip is the only marker of a reference.
- Resolved values are never shown outside the Variables page: no previews, no hover values, and no values in error messages.

### Clipboard and drag-and-drop

- Copy and cut from a template field write two flavors through `DataTransfer`. `text/plain` holds the display text. `application/x-overidify-template+json` holds `{"format":"overidify-template","version":1,"parts":[...]}`.
- Pasting or dropping into a template field uses the custom flavor when it is present and valid, which recreates the references. A reference to a name that does not exist pastes as a missing reference. In every other case the `text/plain` flavor is inserted as literal text, even when it reads `{{NAME}}`.
- Pasting into other applications produces readable `{{NAME}}` text. Values are never placed on the clipboard from a rule field.

Creating a Network Rule from a captured DevTools request fills literal values. Captured text never becomes a reference.

## Resolution and activation

### Resolving

`resolveTemplate(template, variables)` concatenates literal parts and variable values in one pass. A value containing `{{OTHER}}` is inserted as those characters and is not resolved again. Missing names are collected and the function returns no value.

`resolveRules({ requestHeaderRules, networkRules }, variables)` is the only path from saved templates to concrete rules. It returns:

- Resolved Header, Switch, and Network rules for active rules, in today's concrete string shapes. The existing DNR compiler, `matchesPageDomain`, `networkRulesForPage`, `selectNetworkRule`, and request matching therefore run unchanged.
- Resolved website eligibility per rule even when another field blocks activation, and a list of issues per rule, with Switch option issues keyed by option ID. The popup can therefore match and explain a rule whose website is valid but whose token is missing.

The background header sync, background Network sync, the `get-network-rules` reply, the popup, Settings cards, and editors all call this function. This keeps one matching path, as `AGENTS.md` requires. A rule with an unresolved or invalid website domain is ineligible on every page in every surface.

### Fields that decide activation

A rule is **active** when it is enabled and its applicable fields resolve and pass validation:

- Every rule: the name and every website domain.
- Header Rule: all header pairs.
- Switch Rule: the selected option's name and header pairs. Other options are checked and marked but do not affect activation.
- Network Rule: the request URL, the body, and every response header pair.

A variable problem never changes the stored `enabled` value. The toggle stays on, and the rule activates by itself once the problem is fixed, for example after the variable is recreated.

### Validation of resolved fields

Resolved values are validated for each field. These checks apply only to fields that contain references. Literal-only fields keep today's validation exactly.

| Field | Resolved value must | Issue message |
| --- | --- | --- |
| Rule or option name | be non-empty after trimming | `Name is empty after variables are filled in.` |
| Website domain | pass `isValidDomainPattern` | `Website domain is not valid after variables are filled in.` |
| Request header name | be an HTTP token, using the character set today's response header name check uses | `Header name is not valid after variables are filled in.` |
| Request header value | be non-empty and contain no CR, LF, or NUL | `Header value is empty or contains a line break after variables are filled in.` |
| Request URL | give a non-null `requestUrlKey` | `Request URL is not a complete HTTP or HTTPS URL after variables are filled in.` |
| Response header pair | pass today's `ResponseHeadersSchema` checks, including the Set-Cookie ban | today's messages, followed by ` after variables are filled in` |
| Response body | nothing; any string is accepted | none; see JSON warning below |

A missing variable reports `Missing variable NAME` (or `Missing variables A, B`). Messages name variables and fields, never values. Invalid resolved request headers must be stopped before reaching DNR, so one bad value can never fail `updateSessionRules` for every other rule.

Resolved values are not trimmed. A value of `" abc"` produces `Bearer  abc`.

The JSON warning applies only to a body containing references when all of its variables exist. It checks the resolved body against current saved values and shows `With current variable values, the body is not valid JSON. You can still save and return this text.` The warning does not mark a position, does not affect activation, and does not reveal the value. Live position-based JSON markers and **Format** are unavailable while the body contains references. Format explains `Format is unavailable while the body contains variables.`, as the JSON editor spec allows.

### Saving rules

Two categories of validation apply:

1. **Save-blocking checks** are structural and never depend on values. Literal-only fields keep every current check. Fields containing references are checked only for presence: required names and request URLs must be non-empty templates, and a header pair needs both parts. A domain containing a reference is accepted when added. `saveNetworkRules` and `normalizeNetworkRules` use these template-aware checks, so a variable problem never blocks saving and never sets `enabled` to false.
2. **Activation issues** come from variables: missing names and invalid resolved fields. They never block Save. The editor shows them inline on each field and in a status line above the footer: `Saved rules with variable problems stay inactive.` After saving, the success message adds `Inactive until the variable problems are fixed.`

Editors re-evaluate issues live as variables change in storage.

### Activation after changes

- Background header and Network modules also listen for changes to the `variables` storage key and resync, just as they do for rule keys.
- The Network module's previously active patterns must come from the resolved domains of the previous activation, not from `oldValue` templates. Resolved domains can contain values, so the module keeps that set in memory only. After a worker restart it relies on the persisted possibly-active tab IDs, which contain no values.
- In-flight Network requests keep the settings captured when they started. Header changes apply to later requests. This matches existing behavior.

## Variables page

### Route and layout

Settings gets page-level navigation with two entries: **Rules**, the existing workspace at `#/all` and the rule-type routes, and **Variables** at `#/variables`. Rule editors are unchanged.

The page shows:

- The title **Variables** with the description `Type {{ in any rule field to insert a variable. Values stay in this browser and are never exported.`
- **Add variable** beside the title. It appends a draft row with an empty name and value, with the value revealed and the name focused.
- A table with Name, Value, Used by, and row actions (reveal/hide, delete).
- A **Referenced but missing** section when saved rules reference undefined names. Each name shows its rule count and a **Create** button that adds a draft row with that name.
- Cancel and Save below the table, as in rule editors. Ctrl+Enter saves. Escape does nothing on this page.
- An empty state using the shadcn Empty pattern: icon, the title `No variables`, and **Add variable**, with no description.

### Values

- Values are hidden by default as a fixed eight dots, which does not reveal their length. An empty value shows a muted `Empty`.
- Reveal turns the cell into an auto-growing monospace textarea. Hide masks it again. Reveal state belongs to the row, survives Save, and resets when the page reloads or the user leaves the route. It is never persisted.
- New rows start revealed.
- Hiding is a display choice only. Storage is not encrypted, and the user is not promised masking anywhere else.

### Used by

**Used by** shows how many saved rules reference the name. It counts disabled rules and every Switch option. A popover lists each rule, its type, and the fields concerned, such as `Header value` or `Option "Staging" · Header value`. Each rule links to its editor. A single function, `collectVariableReferences(rules)`, supplies this list, the delete confirmation, the missing section, and import review.

### Save semantics

The page keeps a draft. Saved variables stay in use until Save. Example: the user changes AUTH_TOKEN from `abc` to `xyz` and has not saved yet. Requests keep sending `Bearer abc`. Save stores `xyz`, and later requests send `Bearer xyz`. Cancel discards the draft and shows the saved values again. Leaving the page also discards the draft without confirmation, as rule editors do today. A `Unsaved changes` marker shows while the draft differs.

Save validates names. Invalid or duplicate names block Save, and their rows show the errors inline. Save then applies the draft as a diff keyed by variable ID onto the latest stored set:

- New rows are added. Edited rows update their name and value. A row edited here but deleted in another window is recreated with the same ID. Rows deleted here are removed.
- Rows no one edited keep any changes another window saved.
- If the result would duplicate a name created in another window, Save fails with `Another variable already uses this name.` on the row and changes nothing.
- While the draft is clean, rows follow storage changes live. While it is dirty, the draft is kept, and changes to rows the draft does not touch are still merged on Save.

**Rename.** Renaming a saved variable rewrites every reference to the old name in all saved Header, Switch, and Network rules, including disabled rules and unselected options. The rewrite happens in the same storage write. Renames apply as one simultaneous mapping, so swapping two names in one Save works. Literal `{{OLD}}` text, variable values, and execution history are never changed. A row being renamed shows `Updates N references on Save.`

**Delete.** On Save, if any name would become missing after the rename mapping while saved rules still reference it, a confirmation lists each such name with its affected rules and fields. **Cancel** is focused by default and returns to the draft. **Delete and save** continues. References are kept, the affected rules become inactive (Switch Rules only when the selected option is affected), and creating a variable with the same name later repairs them without editing the rules. Deleting an unreferenced variable needs no confirmation.

**Outcomes.** Results follow the existing rule-save patterns:

- Storage failure: `Variables were not saved. Your previous variables are still in use.` The draft is kept, and neither variables nor rules change.
- Saved but activation not confirmed: `Variables were saved, but the browser has not applied them yet.` with **Retry activation**, which resends `sync-request-header-rules` and `sync-network-rules` without saving again.
- Any reload notice reported by the Network sync is shown as it is for rule saves.
- Success shows the toast `Variables saved`.

### Effect on open pages

All extension pages subscribe to the `variables` key.

- Rule editors compare old and new variables by ID. When an ID's name changes, references in both the unsaved draft and the editor's saved baseline are remapped, so the dirty state does not change. Deleted names show as missing chips. Created names resolve immediately. Suggestions update live.
- If a rule save races with a rename and writes the old name, the result is a visible missing reference that can be fixed by reselecting. No other harm follows.
- The popup and Settings cards re-resolve and update their issue markers.

## Problem visibility

- **Settings rule cards.** An enabled rule with problems shows an `Inactive` badge next to the toggle. A disabled rule with problems shows `Variable problem`. The badge tooltip lists the issues by field. Card text uses template chips.
- **Switch option lists** in cards, the popup, and editors mark each broken option with a warning icon and the accessible suffix `(variable problem)`. Broken options can still be selected. Selecting one makes the rule inactive until it is fixed.
- **Popup.** Rules whose resolved website matches the current page are listed as today, with a warning icon and a short reason such as `Inactive: missing AUTH_TOKEN`. When an enabled rule's website domain cannot be resolved, so it cannot be listed for any page, a footer notice reads `N rules can't run because of variable problems.` with **Open Settings**, which opens `options.html#/all`.
- **Editors** show inline issues and a status line. See [Saving rules](#saving-rules).
- **Variables page** shows **Used by** and **Referenced but missing**.

## Search and display in Settings

Settings search matches the display text of the fields it searches today, so searching `AUTH_TOKEN` finds rules that contain the reference or the literal text. Search never matches variable values. Rule names, domains, request URLs, and option names appear as templates with chips. Duplicate naming works on display text: `{{ENV}} admin` becomes `{{ENV}} admin (copy)`, and the reference stays a reference. A duplicated rule copies templates exactly.

## Export and import

- Exports contain templates exactly as stored. Values are never exported, including in a full backup and including unused variables.
- The format version is 3 when any exported rule contains a template object. Otherwise the existing version 1/2 rule applies, so exports without references stay importable by older builds. Version 3 allows domain lists as well.
- Import accepts versions 1, 2, and 3. A template object with an invalid reference name or an invalid part makes that rule invalid, which offers partial import. Plain strings import as literal text in every version, so an old export's `{{X}}` text stays literal.
- Import ignores any top-level key other than the envelope fields. Variable values are never read from a file.
- References resolve against local variables with the exact case-sensitive name. The review adds two lines when relevant: `Uses variables: API_HOST, AUTH_TOKEN`, and `Missing variables: TENANT. Rules using them stay inactive until you add them in Variables.` The second line links to `#/variables`. Missing references do not make a rule invalid.

Example version 3 export excerpt:

```json
{
  "format": "overidify",
  "version": 3,
  "requestHeaderRules": [{
    "id": "8d1f5a0e-2b7c-4f7e-9a1d-3c2b1a0f9e8d", "kind": "header-rule", "name": "API auth",
    "url": { "template": [{ "variable": "TENANT" }, ".example.com"] },
    "enabled": true, "order": 0,
    "headers": [{ "key": "Authorization", "value": { "template": ["Bearer ", { "variable": "AUTH_TOKEN" }] } }]
  }],
  "networkRules": []
}
```

## Execution history

Execution history records templates only. No resolved value enters execution records, the header installation ledger, or request observations. Chrome's own Network panel and the DevTools Requests tab are views of Chrome's network log and are not changed.

### Rule snapshots and Changes

- `ExecutionRule` fields `name`, `url`, `headers[].key/value`, `option`, `requestUrl`, and `body` become `TemplateText`. The Rule, Changes, and Headers views render chips.
- **Header/Switch.** The installation ledger snapshot stores the template rule and selected option. The ledger `signature` is built from the template snapshot, condition, priority, and the template header list. It must not use the resolved DNR `action`. A change to a value alone can then reuse an installation ID, which is correct because the snapshot is identical. The resolved `action` exists only in the installed session rule.
- **Network.** For each entry it sends to a page, the background attaches `execution`, the template snapshot, and `templated: { requestUrl, responseHeaders, body }` flags. The interceptor builds its record from `execution` rather than from resolved fields:
  - `request.url` is omitted when `templated.requestUrl` is set, with `request.urlOmitted: "Hidden because the rule's request URL contains a variable."`. The Request tab shows the rule's request URL template instead. Method, type, frame, and timing are kept.
  - `response.headers` holds the template header list when `templated.responseHeaders` is set; otherwise it holds the actual list.
  - `response.body` holds the template body when `templated.body` is set. Status, mode, outcome, errors, and timing are kept.
- Existing records are never rewritten.

### Request observations

Native `webRequest` header observations are filtered in the background before they are posted to DevTools, so nothing is retained:

- For each inspected tab, the background keeps a redaction set from the latest resolution. It contains the lowercased resolved header names from active Header Rules and selected Switch options matching that tab whose name or value contains a reference.
- An observed header whose name is in the set and whose rule's value contains a reference keeps its name. Its value is replaced with `{ "hidden": "variable" }`, displayed as `Hidden: set from a variable`. Both the before and after stages are filtered, because the page's own value cannot be reliably told apart from Overidify's.
- When the name itself contains a reference, matching entries are dropped and the observation records `hiddenHeaders: n`, displayed as `n headers hidden: set from a variable`.
- Observations whose URL matches an active Network Rule with a templated request URL for that tab have `url` replaced by `urlOmitted`. This occurs only in call-server mode, because bypassed calls make no native request.
- Headers, URLs, and tabs unrelated to a variable-bearing rule are recorded unchanged.
- **Fail closed during activation and recovery.** The latest saved values may differ from the configuration that started a request. Before installing new rules, protect observations under both the previous and next configurations. Keep that protection for outstanding send legs and requests that may still use the previous configuration. When the applicable configuration cannot be established, including after a worker restart or an unacknowledged Network update, omit the affected raw header names and values or request URL entirely. Preserve method, timing, and observation identity, and show `Request details hidden while variable rules were loading.` Resume recording unrelated raw details once it is safe to do so. Keep any resolved redaction keys in memory only.
- Values that the page or server sends back elsewhere, such as a token echoed in a response, are not scanned for or redacted. Overidify redacts only what it inserted.

## Exposure boundaries

Resolved values exist only in:

- `chrome.storage.local` (`variables`).
- In-memory resolution results in extension pages and the worker.
- Installed DNR session rules.
- The Network Rule configurations sent to matching website frames. A page receives only its resolved active rules, never the variable set.

Resolved values must never appear in exports, execution history, the installation ledger, `chrome.storage.session`, console logs, error or issue messages, suggestions, search, or rule displays. Browser errors after applying resolved settings can include input text. Use application-owned error messages when reporting such failures, including activation failures and Network execution errors, rather than forwarding the raw exception text.

The page receives values its own rules use, because mocking them is the point. This is inherent and unchanged from today's literal values.

## Compatibility

- Existing saved rules contain only plain strings, so they keep their exact behavior with no migration. Literal `{{...}}` text in existing headers and mock bodies, such as Mustache templates, stays literal.
- Downgrading to a build without variables after saving references is unsupported. Older builds discard or blank template fields and cannot import version 3 files.
- Rules without references still export as version 1 or 2.

## Concrete examples

1. **Basic header.** AUTH_TOKEN = `abc123`. A Header Rule for `localhost:4200` has `Authorization` with value `Bearer ` + chip `{{AUTH_TOKEN}}`. Requests from that site send `Authorization: Bearer abc123`.
2. **Typed text stays literal.** The user types `{{AUTH_TOKEN}}` in full and the list closes at `}`. No chip appears, and the header sends the literal text `{{AUTH_TOKEN}}`. Pasting `{{AUTH_TOKEN}}` from a text editor gives the same result.
3. **Copy within Overidify.** Copying the value from example 1 and pasting it into another rule's header value recreates the chip. Pasting it into a terminal gives `Bearer {{AUTH_TOKEN}}`.
4. **One pass.** GREETING = `Hi {{NAME}}`. A body `{"msg":"` + `{{GREETING}}` + `"}` returns `{"msg":"Hi {{NAME}}"}`.
5. **Delete and recreate.** Deleting AUTH_TOKEN confirms with `API auth · Header value`. The rule's toggle stays on, and its card shows `Inactive` with `Missing variable AUTH_TOKEN`. No header is sent. Recreating AUTH_TOKEN reactivates the rule without editing it.
6. **Rename.** Renaming AUTH_TOKEN to API_TOKEN rewrites the reference in every saved rule, including a disabled rule and an unselected Switch option. An open editor's unsaved draft updates its chip, and old executions still show `{{AUTH_TOKEN}}`.
7. **Switch option.** Switch Rule `Env` has Production (literal) and Staging (`{{STAGING_TOKEN}}`, missing). With Production selected the rule is active, and Staging is marked broken. Selecting Staging in the popup makes the rule inactive with `Inactive: missing STAGING_TOKEN`.
8. **Domain.** TENANT = `Acme`. The domain `{{TENANT}}.example.com` resolves to `acme.example.com`. Headers, Network Rules, and the popup all match `https://acme.example.com/app`. With TENANT = `bad host`, the rule is inactive and the popup footer counts it.
9. **Empty value.** EMPTY = `""`. A header value of only `{{EMPTY}}` makes the rule inactive (`Header value is empty…`). A mock body of only `{{EMPTY}}` returns an empty body and stays active.
10. **Invalid JSON.** TOKEN = `abc`. The body `{"token": ` + `{{TOKEN}}` + `}` returns `{"token": abc}` with the JSON warning. The rule stays active.
11. **History.** For example 1, the execution's Headers tab shows `Authorization: Bearer {{AUTH_TOKEN}}`. A request observation shows `authorization: Hidden: set from a variable`, and other headers such as `accept` stay visible.
12. **Import.** A teammate's version 3 file references AUTH_TOKEN and TENANT, and only AUTH_TOKEN exists locally. The review shows `Uses variables: AUTH_TOKEN` and `Missing variables: TENANT…`. The imported rules save, and those using TENANT stay inactive.

## Implementation outline

1. `src/lib/templates.ts`: types, canonicalization, display text, equality, edge trimming, `resolveTemplate`, the clipboard payload parser and serializer, and suggestion ranking. All pure functions.
2. `src/lib/variables.ts` and `variables-storage.ts`: schema, normalization, `collectVariableReferences`, the rename rewrite, the diff-apply Save under the three locks, and the subscription.
3. Schemas: make template fields `TemplateText` in rule, draft, persisted, transfer, and execution schemas, with template-aware save-blocking checks. Update `normalizeRequestHeaderRules`, `normalizeNetworkRules`, `normalizeWebsiteScope`, and `updateWebsiteScope`.
4. `src/lib/resolve-rules.ts`: `resolveRules` with issues. Switch the DNR compile, Network sync, the `get-network-rules` reply, the popup, cards, and editors to it.
5. Background: listeners on the `variables` key, the resolved previous-pattern set, ledger template snapshots and signatures, Network `execution`/`templated` payloads, and observation redaction with fail-closed handling.
6. UI: `TemplateInput`, the body editor extension, chips, suggestions, clipboard handling, the Variables route and page, problem markers in cards, the popup, and option lists, plus import review lines.
7. Transfer: version 3 selection and template validation on import.
8. Documentation: update `docs/rule-behavior.md` and README with user-facing behavior, and note that variables are not included in exports or backups.

## Validation

### Retained regression tests

Tests run through the public library and background interfaces below the UI, in the existing `tests/*.test.ts` style.

- **Templates:** canonical form; equality; display text; edge trimming that leaves values and inner text alone; one-pass resolution (example 4); empty and whitespace values kept exactly; plain strings are literal even when they read `{{NAME}}`; clipboard payload round-trip and rejection of invalid payloads; suggestion ranking order.
- **Variables storage:** normalization (bad entries, missing IDs, duplicate names); name validation; diff-apply keeping another window's unrelated changes; duplicate-name conflict changing nothing; rename rewriting header, Switch (all options), and Network rules, including disabled ones, while literal text stays; swap rename; delete keeping references and recreate repairing them; storage failure leaving variables and rules unchanged.
- **Resolution and activation:** a missing variable makes a rule inactive with `enabled` unchanged; an unselected broken option does not deactivate the rule, and a selected one does; each resolved-field validation row in the table, including a resolved Set-Cookie name and CR/LF in a header value; an empty header value is inactive while an empty body is active; the JSON warning does not deactivate; a name resolving to empty is inactive; resolved domains go through the shared matcher with case-insensitive hosts; a rule with an unresolved domain matches no page.
- **Saving:** template fields pass save-blocking checks with missing variables; literal-only fields keep their current errors; `normalizeNetworkRules` does not disable a rule because of a variable problem.
- **DNR and ledger:** compiled session rules carry resolved values; invalid resolved headers are excluded without failing other rules; the serialized ledger and session storage do not contain any variable value (assert with a sentinel value).
- **Network background:** page payloads contain only resolved active rules for that page, include the `execution` template snapshot and `templated` flags, and never contain the variable set or other rules' values; previous patterns use resolved domains.
- **Execution records and observations:** interceptor records omit resolved URL, response header, and body fields according to the flags; observation redaction hides values set by templated headers, drops headers whose names come from variables, replaces matching call-server URLs, and leaves unrelated headers visible. Cover observations between activation revisions and after restart when the previous rules may still apply. No retained record, observation, or surfaced activation error contains the sentinel value.
- **Transfer:** version 3 is used only when references exist; values are never exported (sentinel assertion); a version 3 import rejects invalid reference names as invalid rules; uses/missing lists are computed; version 1/2 `{{X}}` text imports as literal.
- **Duplication:** templates are copied exactly; display-text naming.

### One-time verification

Run these during implementation, keep the scripts, screenshots, and logs in `.scratch/verification/variables/`, report the results, and then remove the files.

- Every template field: `{{` opens the list, filtering works, Enter and click confirm, and Escape closes the list without closing the editor. Enter in the domain field confirms a suggestion instead of adding the domain. Typed `}` closes the list. Body bracket auto-close is consumed. IME composition does not trigger the list.
- Chips render in editors, cards, the popup, option lists, and DevTools. Missing styling and accessible names are correct. Literal look-alike text renders plain.
- Caret movement, Backspace, and Delete treat a chip atomically. Undo and redo restore chips. A search-and-replace match inside a chip replaces the whole chip. Format is disabled with its explanation.
- Copy, cut, paste, and drag within and between fields keep chips. Pasting from outside stays literal. Pasting into another app gives display text.
- Variables page: masking and reveal, the empty state, Add, inline name errors, the rename notice, the delete confirmation, Save/Cancel, Retry activation, a merge with a second window, and Create from the missing section.
- Open editor during rename and delete in another window: the draft and baseline are remapped and the dirty state is unchanged.
- In a packed build on Chrome (`pnpm build:dev` in worktrees), check headers on the wire, Network mocks in bypass and call-server modes, the popup listing and footer notice, and the DevTools Executions views with no values visible except in Chrome's own Network panel.

## Acceptance criteria

- Only confirmed suggestions create new references in an editor. Overidify can also move or import existing structured references. Typed or pasted plain text, including exact `{{NAME}}` look-alikes, never resolves.
- Saved variables drive every surface through `resolveRules` and the shared matcher. No surface matches or sends an unresolved or invalid template.
- A variable problem never blocks Save and never changes `enabled`. Fixing the variable reactivates the rule.
- Rename and delete behave as described, including disabled rules and unselected options. History stays unchanged.
- No variable value appears in exports, execution history, ledger or session storage, logs, messages, or displays outside the Variables page reveal.
- Existing data and version 1/2 files behave exactly as before.

## Implementation notes

These choices fill details the design left open. None changes a product decision above.

- **Modules.** `src/lib/templates.ts`, `variables.ts`, `variables-storage.ts`, `resolve-rules.ts`, `template-editor-state.ts`, and `observation-redaction.ts` hold the logic. `src/components/TemplateInput.tsx` and `template-editor-view.ts` implement the editor; `src/options/VariablesPage.tsx` is the page.
- **Activation errors.** Header and Network activation failures always report application text, for literal rules too, because the browser's text can quote installed settings. Console logs use the same text.
- **Network execution errors.** For a rule whose request URL, response headers, or body contain references, a non-application error is recorded as `Request failed` or `Request aborted`. Literal rules keep the browser's message.
- **Observation protection.** Chrome request IDs keep their starting protection through redirects and authentication retries, until completion or error. A send whose start was not observed records metadata only. Each document retains its previous and newly sent URL protection until it acknowledges replacement. A pull adds protection and registers its document before settings are sent. Acknowledgments accumulate across visits, so unrelated URLs remain visible once every recipient acknowledges known settings. After a worker restart, header protection is reconstructed from installed session rules and their ledger snapshots. A rule without a snapshot has unknown provenance. A tab that may still have Network Rules hides request URLs until its documents acknowledge new settings. The worker tracks recipients by document ID through navigation and restart. Cached documents count until their settings are replaced. A recipient missing from the frame list may still resume, so its protection stays until the document acknowledges a replacement or the tab closes.
- **Observation text.** A hidden call-server URL reads `Hidden because a Network Rule's request URL contains a variable.` Hidden header counts are kept per observation stage.
- **Import of older formats.** A version 1 or 2 file that contains a template object is treated as an invalid rule (`Variable references need export format version 3.`), since those formats predate references.
- **Saving with problems.** Rule editors return to the list after Save, so the `Inactive until the variable problems are fixed.` message also appears as a toast.
- **Undo after a rename.** A field updated by an external rename retains its draft text and clears that field’s undo history. Later edits and formatting can still be undone.
- **Clipboard and drag.** Copy or cut with an empty selection takes the whole line, matching CodeMirror's default, and keeps references. Dragging within a field moves the text; dropping into another field copies it, as CodeMirror does for plain text.
- **Body bracket auto-closing.** The response body editor has no bracket auto-closing, so confirming a suggestion consumes a `}}` typed directly after the caret.
- **Variables page.** The rename notice appears when the rename updates at least one reference. Activation failures show an inline alert with **Retry activation**. A row created from **Referenced but missing** removes that name from the section until Save or Cancel.
- **Popup footer.** The count uses singular wording for one rule: `1 rule can't run because of variable problems.`
