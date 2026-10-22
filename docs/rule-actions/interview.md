# Rule actions design interview

This records the design interview. The user confirmed the complete design in round 3 and requested implementation. See the [specification](spec.md) for the implemented behavior.

## Confirmed in round 1

- The user means a saved rule when referring to an item.
- Scope is Header Rules, Switch Rules, and Network Rules in Settings, including the All tab.
- Duplicate immediately saves an independent, disabled copy and keeps the user in the list.
- Rule rows offer Duplicate, Export, and Delete. Clicking the rule name opens the editor.

## Confirmed in round 2

- Reveal Duplicate, Export, and Delete icons on row hover or keyboard focus. Keep them visible on touch screens.
- Name copies `Original (copy)`, then `Original (copy 2)`, incrementing until unused.
- Insert the copy immediately after its source in the stored priority order.
- Hide row actions during Select mode and use the existing bulk toolbar.
- Show a short `Rule duplicated` toast with an Edit shortcut. Preserve the current tab, search, and scroll position.

## Confirmed in round 3

The user answered: "Yes, this is the complete design. Implement it." The confirmed details follow.

- Keep the popup and editor action sets as they are. The new actions belong to rule rows in Settings.
- Preserve all saved settings in a copy, including every Switch option and its selected option. Give the copy and its options independent identities. Leave the source unchanged.
- Number copies within a name family: copying `Original (copy)` produces the next unused `Original (copy N)` name. Compare candidate names without case differences across saved rules. An unnamed source uses `Untitled rule` as the base.
- Keep icons in Duplicate, Export, Delete order. Reserve their space on hover-capable screens so revealing them does not move row content. Let narrow rows wrap controls as needed, keeping touch targets usable. Give every icon an accessible name and tooltip.
- Do not automatically select a new copy. A deliberate repeated click after completion creates another copy; block repeat submission while creation is pending.
- Export one rule's latest saved settings in the existing Overidify JSON format. Include every Switch option and its selected option.
- Delete uses the existing named-rule confirmation, initially focusing Cancel. Cancel or Escape preserves the rule.
- Read the latest saved rules inside the appropriate storage locks before creating, exporting, or deleting a rule. Preserve unrelated concurrent edits.
- A failed save reports that no copy was created. A successful save followed by activation failure reports that the copy exists and offers Retry activation without creating another copy. Surface website reload requirements.
- Preserve the current tab, search, scroll position, and existing selection when completing a copy. The toast's Edit shortcut opens that saved copy only when clicked.

