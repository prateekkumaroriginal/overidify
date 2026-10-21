# Import/export

Status: implemented in source. The [interview](interview.md) records the decisions and superseded proposals. [CONTEXT.md](../../CONTEXT.md) defines the domain terms.

## Purpose

Transfer saved Header Rules, Switch Rules, and Network Rules for backups and sharing. Version one uses downloadable Overidify JSON files and a file picker.

Export exact saved values, including credentials and response bodies. Preserve enabled states, Switch Rule selections, and relative rule priority. A Switch Rule is always transferred with every option.

## Home-page controls

On the options page, place Select, Import, and Export to the right of the existing rule-type tabs. On narrow layouts, allow the controls to wrap. The extension popup has no import/export controls.

With selection mode off, hide selection checkboxes. Export downloads every saved rule belonging to the active rule-type tab, including enabled and disabled rules. The All tab exports every saved rule across the three types as a full backup.

Clicking Select enters selection mode and reveals checkboxes in the existing rule lists. The toolbar shows Cancel and Export (n). Delete sits at the right of the row containing the visible-rules select-all checkbox and its All label. Only Export includes the selected count in its label; Delete shows the count in its confirmation dialog. Export downloads the selected rules. Delete confirms the selected count before permanently removing those rules across all rule-type tabs, including selections hidden by a search. Both actions are disabled when nothing is selected. Delete is also disabled while a rule saves or activates. Canceling the confirmation keeps the rules and selection. Successful deletion clears the selection and keeps selection mode active. Storage failures keep the saved rules and allow retrying; activation failures report the saved deletion and offer Retry activation without deleting again. Show a website reload notice when required. Label the visible-rules select-all checkbox All. Checked and mixed checkboxes use the violet action color. All shows a minus when some visible rules are selected and a checkmark when all are selected.

When Delete is blocked only by an in-progress save or activation, keep its opacity steady and use a wait cursor. An empty selection retains the normal disabled appearance.

Select, Import, and Export stay usable while a rule saves or activates. Selection only changes local UI state. Export waits for unfinished saves and reads saved rules, without waiting for activation. Import opens the native file picker directly, with no introductory dialog. Canceling the picker opens no dialog. Selecting a file opens the existing review dialog; file review and applying an import wait for unfinished saves. Keep the import dialog's own busy and repeated-submission protection, and allow choosing another file from the review dialog.

Retain selections when switching between the rule-type tabs within this options page. This supports a file containing selected rules of different types. Selecting all saved rules across the three types produces a full backup. Ordinary Export follows the active tab, so Export on All is also a full backup.

## Export inside a rule

Each saved rule editor has an Export action that downloads that one complete rule.

Require saving first. A new rule or an editor with unsaved changes cannot export. Keep Export disabled without displaying helper text. Exporting does not save or activate changes.

## Identity

Validate rule IDs, Switch Rule option IDs, and selected-option references as UUIDs. Generate new identities with UUIDs. There is no migration, old-ID conversion, or compatibility requirement for previous plain-string IDs because there is no existing user data.

An overlap means the imported rule has the same UUID as an existing rule. Identical names, website scopes, or contents with different UUIDs do not count as overlaps. An unchanged rule with the same UUID still counts.

Preserve rule and option UUIDs in normal exports, new non-overlapping imports, and replacements. When Add creates a separate copy of an overlapping rule, assign fresh UUIDs. For a copied Switch Rule, also give its options fresh UUIDs and remap the selected-option reference to the corresponding copied option.

## Import review

Selecting a file parses and validates it before changing saved rules. Always show a review summary followed by an explicit import action, including when the entire file is valid and has no overlaps.

Show each nonzero valid, invalid, and overlap count on its own line. Omit zero counts and the explanatory paragraph about saved enabled states and rule priority. Identify invalid rules and their errors. Keep the dialog's footer action buttons the same height.

When there are no overlaps, Import adds the valid imported rules. When overlaps exist, offer Replace or Add, with one choice applying to all overlaps. The user can cancel without changing saved rules.

| Action | Overlapping rules | Non-overlapping imported rules | Unrelated existing rules |
| --- | --- | --- | --- |
| Replace | Replace existing rule contents | Add | Keep |
| Add | Keep existing rules and create separate copies | Add | Keep |

Replace does not replace the whole setup. For example, with ten existing rules and four incoming rules of which two overlap, Replace leaves twelve rules; Add leaves fourteen.

## Priority and activation

Replacements keep their existing positions. Append new rules and added copies in their exported relative order. Header Rules and Switch Rules share one priority sequence; Network Rules have their own sequence. In an empty setup, restore the exported relative order in each sequence.

Preserve saved enabled states rather than disabling imported rules by default. Preserve the selected Switch Rule option. Apply imports through the existing activation mechanisms and use the existing website matcher. Import/export introduces no alternative matching rules for Settings, headers, Switch Rules, Network Rules, or the popup.

## Invalid files and partial imports

Reject unreadable JSON, an invalid export envelope, and unsupported format versions with a clear error. Import nothing from such files.

For a supported file containing individually invalid rules, ask whether to import its valid rules or cancel. The unit of validation is a whole rule. An invalid option or broken selected-option reference makes the entire Switch Rule invalid; do not silently drop or repair pieces of it.

If a rule UUID appears more than once inside the file, mark every rule with that UUID invalid. Unaffected valid rules remain eligible for a user-approved partial import. Do not choose the first or last occurrence silently.

An intentionally non-JSON mock response body remains valid under existing editor behavior. Distinguish it from broken JSON in the export file itself.

If no valid rules remain, show the errors and disable the import action. No partial import occurs without the user's choice.

## Saving and activation failures

After successful activation, close the import dialog and show a shadcn Sonner success toast with the existing circled tick, a close button on the right, and the text "3 Rules imported" using the actual saved count. Use the card background with a one-pixel border using the app's shared border color and the ghost button's accent background and foreground text on close-button hover. Ordinary success toasts dismiss automatically after four seconds, with a shrinking violet line along the bottom and no numeric countdown. Compose the line with shadcn Progress using its countdown variant; hide this decorative indicator from assistive technology. The line pauses with the dismissal timer during hover, interaction, and page hiding. Use discrete progress steps for reduced motion. Include a website reload notice when required, keep that toast visible until dismissed, and omit its countdown line.

Keep saving and activation results distinct. If saving fails, report failure and keep the previous saved setup.

If saving succeeds but activation is not confirmed, report that the rules were saved and activation needs attention. Offer Retry activation. Retrying applies the saved configuration without importing the file again, regenerating IDs, or adding copies. Show a website reload notice when activation requires it.

## Implementation defaults

These defaults complete routine details that were not separate interview decisions:

- Use a format identifier and integer version in the JSON envelope. Start with version 1 and reject unsupported versions.
- Keep Header Rules and Switch Rules together in their existing shared order, and Network Rules in their own ordered collection.
- Give the download a descriptive `.json` filename. Export only saved rule data; browser tab IDs and transient activation state are not export contents.
- In selection mode, provide a select-all checkbox for the visible rules in the current type. Keep selections through searches. Clear selections when the user exits selection mode.
- Treat a UUID collision with an existing rule of a different type as invalid. Require option UUIDs to be unique within a Switch Rule and its selected-option reference to identify one of its options.
- Disable tab export when that type contains no rules. Disable mutation controls while an import is being applied to prevent repeated submissions in the same UI.

The envelope is `{ "format": "overidify", "version": 1, "requestHeaderRules": [], "networkRules": [] }`. Header Rules and Switch Rules share `requestHeaderRules`; Network Rules use `networkRules`. UUID validation canonicalizes letter casing so the same identity cannot evade overlap detection or break selected-option references.

## Scope exclusions

No migration for old IDs or existing data. No handling of multiple browser tabs changing settings during an import review, no stale-review detection, and no cross-tab import conflicts.

No third-party formats, clipboard JSON input/output, or drag-and-drop in version one. A separate export-selection dialog and an export that ignores the active tab were superseded by selection in the existing lists and ordinary tab export.

## Acceptance scenarios

1. With Select mode off on Header Rules, Export includes all saved Header Rules and no other rule type.
2. Checkboxes are absent until Select is clicked. With selection mode active and no selections, Export is disabled.
3. Selecting a Header Rule and a Network Rule through the rule-type tabs produces one file containing both. Selecting every rule across the types produces a full backup.
4. A saved, unchanged Switch Rule exports all options and its selected option. A new or edited unsaved rule cannot export.
5. Importing a valid file with no overlaps shows a summary and adds rules only after Import is clicked.
6. Overlaps are counted by UUID. Replace updates only those rules and preserves their positions. Add retains both versions with distinct IDs and valid Switch Rule references.
7. New and copied rules retain their exported relative order after existing rules. Imported enabled states and selected options survive the transfer.
8. A supported file with valid and invalid rules offers a partial import. All occurrences of repeated rule UUIDs are invalid; no invalid rule is partially salvaged.
9. An unreadable or unsupported file imports nothing. A non-JSON mock body remains allowed.
10. A save failure keeps the previous setup. An activation failure after saving offers an activation retry that creates no additional rules.
