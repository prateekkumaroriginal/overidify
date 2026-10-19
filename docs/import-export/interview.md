# Import/export design interview

Status: interview complete and implemented in source. The [feature specification](spec.md) consolidates the resulting design.

## Interview format

- Ask at most ten questions per round.
- Give every question an editable answer field, a Recommended button, and an Explain more button. Include options where useful.
- Copy Answers copies the round's questions and answers for the user to paste into chat.
- Recommendations become decisions only when the user submits or otherwise confirms them.

## Confirmed decisions from Round 1

1. Support both full backups and sharing selected rules.
2. Cover Header Rules, Switch Rules, and Network Rules. Export all rules or a selected set across these types.
3. Support Overidify JSON only in the first version. Round 3 confirms rejection of unsupported file-format versions.
4. Export exact saved values so backups restore correctly. Automatic redaction and an export warning have not been confirmed as requirements.
5. If there is no overlap, add the imported rules. If there are overlaps, report their count and offer Replace or Add.
6. The same overlap policy applies to rules already present. Round 2 resolves the overlap definition and Replace/Add behavior.
7. Preserve saved enabled states on import.
8. When a file contains invalid rules, ask whether the user wants to import its valid rules.

The user also requested UUID IDs rather than unconstrained strings. Round 2 confirms strict UUIDs with no migration.

## Confirmed decisions from Round 2

1. An overlap is an imported rule with the same UUID as an existing rule. Matching names, contents, or website scopes alone do not establish identity.
2. Replace affects overlapping rules only. Keep unrelated existing rules and add non-overlapping imported rules.
3. Add keeps both the existing rule and the imported rule as separate rules. Copies must receive fresh UUIDs to remain separate; copied Switch Rule references must remain valid.
4. One Replace or Add choice applies to all overlaps in the import.
5. Replaced rules keep their current positions. Append new rules and added copies in their exported relative order. The import summary explains that later enabled rules can take priority.
6. A complete rule is the validation unit. Exclude the whole invalid rule when the user accepts a partial import; do not salvage individual fields or Switch Rule options.
7. A valid file with no overlaps still gets a summary followed by an Import action.
8. There are no users or existing data to migrate. Enforce UUIDs directly and do not implement migration or compatibility with old plain-string IDs. This supersedes the migration proposal shown in Round 2.

## Confirmed decisions from Round 3

1. Place Import and Export to the right of the rule-type tabs row, only on the options page. This supersedes the proposed Settings header placement.
2. Export selection should happen "either on home page or inside a Rule." Round 4 resolves this as both entry points, using selection mode in the existing rule lists.
3. A Switch Rule export includes every option and its selected option.
4. Support file downloads and a file picker only.
5. Reject unreadable exports and unsupported format versions with a clear error.
6. If a rule UUID appears more than once in a file, mark all rules with that UUID invalid.
7. If saving succeeds but activation is not confirmed, report that distinction, offer Retry activation without importing again or creating copies, and show a website reload notice when required. If saving fails, keep the previous saved setup and report failure.
8. Multi-tab cases are out of scope. Do not add import-review refreshes, conflict detection, or other behavior for changes made through multiple browser tabs. This rejects the concurrency proposal from Round 3.

## Confirmed decisions from Round 4

1. Support home-page export and an Export action inside each rule.
2. On home, checkboxes appear in the existing rule lists only after clicking Select. Place Select beside Import and Export to the right of the rule-type tabs.
3. With selection mode off, Export exports the current tab's rule type. With selection mode on and no rules selected, disable Export. With selected rules, export the selection.
4. Require saving before exporting from a rule editor. Disable Export for a new rule or unsaved changes.

Selections carry across rule-type tabs within the same options page to fulfill the cross-type exports accepted in Round 1. Selecting every saved rule across those tabs provides a full backup. Round 4 supersedes the proposed default Export all behavior.

## Existing code relevant to the design

- New rule and Switch Rule option IDs use `crypto.randomUUID()`, but their schemas accept general strings.
- Existing recovery code can produce option IDs such as `<rule-id>-option-1`. Planned UUID enforcement must remove such non-UUID generation; no migration is needed under the confirmed Round 2 scope.
- Header Rules and Switch Rules share one priority sequence. Network Rules have a separate sequence. Later matching enabled entries have higher priority.
- Saved enabled states and selected Switch Rule options already affect subsequent requests.
- Existing local-storage recovery can normalize incomplete data. It does not define external import validation.
- Invalid JSON in a mock response body is allowed by the existing editor. It must not be confused with an unreadable export file.

## Resolved Round 2 topics

- What counts as an overlap, including unchanged rules and unrelated rules matching the same website.
- Whether Replace affects only overlaps and whether Add creates copies.
- One overlap choice for the whole import versus per-rule choices.
- Priority of new and replaced rules.
- Validation boundaries for partial imports.
- Confirmation before imports with no overlaps.
- Strict UUID validation without migration.

## Design outcome

The feature can proceed from the consolidated specification. Migration and multi-tab scenarios are excluded. Routine implementation defaults are identified separately in that specification rather than treated as additional interview answers.

## Round 2 proposals shown before the answers

This section preserves the original questions and recommendations as interview history. The confirmed decisions above take precedence. In particular, the migration proposal in question 8 was rejected.

### 1. What counts as an overlap with an existing rule?

Options: Same UUID; Same type, name, and website; Same UUID or identical contents.

Original recommendation: A rule overlaps when its UUID matches an existing rule's UUID, including when its contents are unchanged. Different UUIDs remain separate even if names, contents, or matching websites are the same. A UUID reused across different rule types is invalid.

### 2. Does Replace affect only overlapping rules, or the whole setup?

Options: Replace overlaps; keep everything else; Replace the whole setup.

Original recommendation: Replace only the overlapping existing rules, add non-overlapping imported rules, and keep all unrelated existing rules.

### 3. What does Add do when an imported rule overlaps?

Options: Keep both as separate rules; Keep existing; skip overlaps.

Original recommendation: Keep the existing rule and add a separate copy of each overlapping imported rule with a fresh UUID. Give copied Switch Rule options fresh UUIDs and update the selected-option reference. Preserve UUIDs for non-overlapping rules.

### 4. Should Replace or Add apply to all overlaps together?

Options: One choice for all overlaps; Choose separately for each rule.

Original recommendation: Show the overlap count and a list of affected rule names and types. Offer one Replace or Add choice for all overlaps in the first version, plus Cancel.

### 5. Where should imported rules go in the priority order?

Options: New rules last; replacements stay; New rules first; replacements stay; Move all imported rules to the end.

Original recommendation: Keep replaced rules in their existing positions. Append new rules and added copies in their exported relative order. Explain in the import summary that later enabled rules can take priority.

### 6. For partial imports, is each complete rule the unit of validation?

Options: Skip the whole invalid rule; Keep valid pieces within a rule.

Original recommendation: Validate complete rules. Show valid and invalid rule counts with specific errors, and ask to import the valid rules or cancel. If a Switch Rule has an invalid option or broken selected-option reference, exclude that entire Switch Rule. If the export file cannot be parsed or its format is unsupported, import nothing.

### 7. When a file is valid and has no overlaps, should importing need a final confirmation?

Options: Show summary, then Import; Import immediately after file selection.

Original recommendation: Show a summary with rule counts and preserved enabled states, then apply after one Import click. When overlaps or invalid rules exist, combine their choices into the same review step.

### 8. How should UUID validation handle older IDs that are plain strings?

Options: Migrate local IDs; validate imports strictly; Migrate local and imported IDs; Reject older IDs everywhere.

Original recommendation: Migrate existing local rule and Switch Rule option IDs to stable UUIDs once, updating selected-option references. Preserve valid UUIDs. Require UUIDs for IDs and selected-option references in new-format imports; treat rules with non-UUID IDs as invalid for partial-import review.

## Round 3 proposals shown before the answers

These are historical proposals. The confirmed Round 3 decisions above take precedence, including the tabs-row placement and exclusion of multi-tab behavior.

### 1. Where should users open Import and Export?

Options: Settings header buttons and dialogs; A separate Import/Export settings tab; Also add actions to the popup.

Original recommendation: Add shared Import and Export buttons in the Settings header, available across the three rule tabs. Open a dialog for each flow. Keep these actions in Settings for version one.

### 2. How should users select rules for an export?

Options: One selector across all rule types; Select rules in each existing tab.

Original recommendation: The Export dialog offers All rules or Choose rules. Choose rules shows one searchable list grouped by rule type, with checkboxes and a selection count. Start that selection empty and enable export after at least one rule is selected.

### 3. Should exporting a Switch Rule include all its options?

Options: All options and the selected option; Only its selected option.

Original recommendation: Export the complete Switch Rule with every named option, all option headers, its selected-option reference, and its enabled state. Import preserves that selection. Keep rule and option UUIDs unless Add needs a separate copy.

### 4. Should version one support only files, or also pasted JSON?

Options: File download and file picker only; Files plus copy/paste JSON.

Original recommendation: Export a downloadable JSON file and import through a file picker. Leave copy/paste JSON and drag-and-drop for later.

### 5. What should happen if the export file is unreadable or from an unsupported format version?

Options: Reject the file with a clear error; Try to recover recognized rules.

Original recommendation: Include an explicit Overidify format identifier and format version in exports. Reject unreadable JSON, an invalid file envelope, or an unsupported format version without changing saved rules. Offer partial import only when a supported file contains individually invalid rules.

### 6. What if the same rule UUID appears more than once inside one file?

Options: Mark all rules with that UUID invalid; Keep the first occurrence; Keep the last occurrence.

Original recommendation: Mark every rule with a repeated rule UUID in the file invalid and include them in partial-import review. Do not silently choose a winner. Also reject a rule whose UUID collides with an existing rule of a different type, and reject a Switch Rule with duplicate option UUIDs.

### 7. If rules save but activation fails, what should the import screen report?

Options: Report saved; offer activation retry; Try to undo the import.

Original recommendation: Clearly report that the rules were saved but activation was not confirmed. Offer Retry activation without re-importing or creating copies, and show a website reload notice when required. If saving itself fails, report failure and keep the previous saved setup.

### 8. What if saved rules change while an import review is open?

Options: Refresh the review before applying; Use the original review snapshot.

Original recommendation: Check the latest saved rules before applying. If rule contents or overlap results changed since review, refresh the summary and require the user to review and apply again. Preserve unrelated changes instead of overwriting them with the old snapshot.

## Round 4 proposals shown before the answers

The confirmed decisions above take precedence. In particular, checkboxes require Select mode and ordinary Export covers the active rule-type tab, rather than every rule type.

### 1. Do you want both home-page export and an Export action inside each rule?

Options: Both entry points; Home page only; Inside each rule only.

Original recommendation: Support both. The home page exports all rules or a selected set. Each saved rule editor also has an Export action for that single rule.

### 2. How should users select a set of rules on the home page?

Options: Checkboxes in the existing rule lists; A selector opened by Export.

Original recommendation: Add checkboxes to the existing rule lists. Keep selections when switching between Header Rules, Switch Rules, and Network Rules within the options page. Show the total selection count and an Export selected action. Keep selected rules selected when searching.

### 3. When nothing is selected, what should home-page export include?

Options: All three rule types; Only the current rule type; Ask which scope each time.

Original recommendation: Show Export all for a full backup containing all three rule types, including enabled and disabled rules. When rules are selected, show Export selected with the selection count. Keep a clearly labeled Export all action available as well.

### 4. What should a rule editor export when it has unsaved changes?

Options: Require saving first; Export the saved version; Export the current valid form.

Original recommendation: Export only saved rules. If a rule is new or has unsaved changes, disable Export and show 'Save changes to export'. Once saved and unchanged, Export downloads that rule directly.
