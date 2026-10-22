# Rule actions

## Scope and interaction

All saved rule types in Settings, including the All tab, offer Duplicate, Export, and Delete icons in that order. Clicking anywhere on a card opens its editor. Outside Select mode, toggles, option dropdowns, and action buttons operate independently. The popup and editor action sets retain their existing behavior.

Settings shows one wide card per rule on the page background. The toggle and name remain vertically centered in the header row. Action icons appear on card hover or keyboard focus and align to the top of their reserved header space, independent of title wrapping. They sit 8px from the card's inner top edge and 12px from its inner right edge, reduced to 8px on mobile, without moving other card content. The toggle stays at the far left and actions at the top right. Long names wrap within their column. The website domain appears as a monospace pill beside the name, wrapping below it when space is limited. The domain pill uses a blue fill at 18% opacity with a 1px blue border at 45% opacity, keeping it distinct when the card is hovered. Metadata aligns below the name; Header counts remain visible, Switch option dropdowns sit below the title with a small vertical gap, and Network Rules include the website, server mode, status, method, and complete API URL. Action buttons use 14px icons in 26px targets on desktop and mobile. Cards use a uniform border and an outer shadow without an inset top highlight. Their backgrounds lighten on hover without changing the border; text and controls remain fully opaque. Card borders stay neutral during selection and keyboard focus; checked checkboxes indicate selected rules and controls keep their focus indicators. Background and border color use the existing transition timing, and action-button hover fills keep their transitions. Icons have accessible names and tooltips. Each action has its own hover fill; Delete uses the destructive treatment.

Select mode hides per-rule actions and places a selection checkbox at the far left, before the toggle. Clicking the card toggles that checkbox instead of opening the editor. Toggles and option dropdowns are inert and cannot receive pointer or keyboard interaction. Clicking their area selects the card without changing the rule. Escape cancels Select mode and clears the selection; a modal handles Escape before the page does. The existing bulk Export and Delete controls apply to the selection. A new copy is not automatically selected. The current tab, search, scroll position, and selection remain intact.

While an action is pending, keep the revealed action icons at full opacity and preserve keyboard focus. Temporarily blocked actions indicate that they are busy with a wait cursor and prevent repeated activation without flashing or hiding the card's controls.

## Duplicate

Duplicate immediately saves an independent, disabled copy directly after the source in the stored priority order. Header and Switch Rules share an order; Network Rules have their own. All continues to group cards by type. Later matching enabled rules retain higher priority.

Copy all saved configuration values, including request headers, response bodies, Switch options, and the selected option. Give the rule and each Switch option fresh UUIDs and remap the selected option. Leave the source unchanged. Copies do not share editable data with their sources.

Generate the name from the source name, removing trailing generated copy suffixes. Use `Original (copy)`, then `Original (copy 2)`, incrementing until unused. Compare trimmed names without case differences across both rule collections. An unnamed source uses `Untitled rule`. Copying a copy remains in the same name family.

Read the source, generate the name, insert the copy, renumber the affected order, and save while holding both storage locks in their established order. Read the latest saved state, preserving concurrent unrelated edits. A source deleted before the locks are acquired produces an error without writing or activating. Block repeat creation while it is pending in the current Settings page. Concurrent copies from different pages serialize and get distinct names and identities.

After saving, activate outside the locks. A success toast says `Rule duplicated` and offers Edit, which navigates to the saved copy only when clicked. A later deliberate click creates another copy.

## Export and Delete

Export reads the latest saved state under the storage locks and exports only that rule in Overidify JSON format version 1. Switch Rules include all options and the selected option. Report a missing source or read failure without downloading an empty export. Export remains usable during saves and does not wait for activation.

Opening Delete reads the latest saved rule's name. The confirmation focuses Cancel. Cancel or Escape keeps the rule and returns focus to its Delete control. Confirming removes the identified rule from the latest saved state under the existing deletion helper's locks, preserving unrelated edits. Keep the confirmation open if saving fails. A saved deletion closes the confirmation and reports activation separately, even after the card disappears.

## Failures and recovery

A failed save reports that no copy was created or no deletion was saved. Do not attempt activation after a failed save.

A saved change with failed activation remains saved. Show a persistent notification with Retry activation, retaining Edit for a saved copy. Retry only activation; it never creates another copy or repeats a deletion. Guard repeated retries while one is pending. Successful activation reports any website reload requirement; keep that notice visible until dismissed.

## Verification

Regression tests in `tests/rule-duplication.test.ts` exercise the public saved-rule interface for copied values, independent identities, selection remapping, placement, naming, missing sources, save/activation failures, concurrent creation, and pending source edits. Saved-rule export and deletion tests cover their storage boundaries, including deletion persistence completing before activation starts. Routine row wiring, tooltip/focus behavior, navigation, rendering, and layout use one-time verification under the repository testing policy.
