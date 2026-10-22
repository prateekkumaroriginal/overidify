# Rule actions

## Scope and interaction

All saved rule types in Settings, including the All tab, offer Duplicate, Export, and Delete icons in that order. Clicking a rule name opens its editor. The popup and editor action sets retain their existing behavior.

Icons appear on row hover and keyboard focus. Touch screens, including devices with both coarse and fine pointers, keep them visible. Hover-capable layouts reserve their space so revealing them does not move other controls. Narrow rows can wrap controls. Shared Button sizes provide 36px targets for a fine pointer and 44px targets for touch. Icons have accessible names and tooltips.

Select mode hides per-rule actions and uses the existing bulk Export and Delete controls. A new copy is not automatically selected. The current tab, search, scroll position, and selection remain intact.

## Duplicate

Duplicate immediately saves an independent, disabled copy directly after the source in the stored priority order. Header and Switch Rules share an order; Network Rules have their own. All continues to group rows by type. Later matching enabled rules retain higher priority.

Copy all saved configuration values, including request headers, response bodies, Switch options, and the selected option. Give the rule and each Switch option fresh UUIDs and remap the selected option. Leave the source unchanged. Copies do not share editable data with their sources.

Generate the name from the source name, removing trailing generated copy suffixes. Use `Original (copy)`, then `Original (copy 2)`, incrementing until unused. Compare trimmed names without case differences across both rule collections. An unnamed source uses `Untitled rule`. Copying a copy remains in the same name family.

Read the source, generate the name, insert the copy, renumber the affected order, and save while holding both storage locks in their established order. Read the latest saved state, preserving concurrent unrelated edits. A source deleted before the locks are acquired produces an error without writing or activating. Block repeat creation while it is pending in the current Settings page. Concurrent copies from different pages serialize and get distinct names and identities.

After saving, activate outside the locks. A success toast says `Rule duplicated` and offers Edit, which navigates to the saved copy only when clicked. A later deliberate click creates another copy.

## Export and Delete

Export reads the latest saved state under the storage locks and exports only that rule in Overidify JSON format version 1. Switch Rules include all options and the selected option. Report a missing source or read failure without downloading an empty export. Export remains usable during saves and does not wait for activation.

Opening Delete reads the latest saved rule's name. The confirmation focuses Cancel. Cancel or Escape keeps the rule and returns focus to its Delete control. Confirming removes the identified rule from the latest saved state under the existing deletion helper's locks, preserving unrelated edits. Keep the confirmation open if saving fails. A saved deletion closes the confirmation and reports activation separately, even after the row disappears.

## Failures and recovery

A failed save reports that no copy was created or no deletion was saved. Do not attempt activation after a failed save.

A saved change with failed activation remains saved. Show a persistent notification with Retry activation, retaining Edit for a saved copy. Retry only activation; it never creates another copy or repeats a deletion. Guard repeated retries while one is pending. Successful activation reports any website reload requirement; keep that notice visible until dismissed.

## Verification

Regression tests in `tests/rule-duplication.test.ts` exercise the public saved-rule interface for copied values, independent identities, selection remapping, placement, naming, missing sources, save/activation failures, concurrent creation, and pending source edits. Saved-rule export and deletion tests cover their storage boundaries, including deletion persistence completing before activation starts. Routine row wiring, tooltip/focus behavior, navigation, rendering, and layout use one-time verification under the repository testing policy.
