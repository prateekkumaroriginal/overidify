# Overidify

Overidify configures request headers and mock API responses for matching websites. Its language covers saved rules and their transfer for backup or sharing.

## Language

**Rule**:
A saved Header Rule, Switch Rule, or Network Rule.

**Header Rule**:
A rule that supplies one set of request headers.

**Switch Rule**:
A rule containing named header options, with one selected option supplying its request headers.

**Network Rule**:
A rule specifying a mock response for a request target within a website scope.

**Rule export**:
A transferable collection of saved rules for backup or sharing.

**Full backup**:
A rule export containing every saved rule across all three rule types.

**Selected-rule export**:
A rule export containing the rules the user chooses, potentially across multiple rule types.

**Tab export**:
A rule export containing every saved rule in the active tab. On All, this is a full backup; on a type tab, it contains only that rule type.

**Single-rule export**:
A rule export containing one complete saved rule, including all options when it is a Switch Rule.

**Partial import**:
A user-approved import of the valid rules from an export that also contains invalid rules.

**Overlap**:
An imported rule with the same identity as an existing rule. Rules that merely share a name, contents, or website scope are separate rules.
_Avoid_: Matching website, duplicate name

**Replace overlaps**:
An import action that replaces overlapping rules, adds the remaining imported rules, and keeps unrelated existing rules.

**Add copies**:
An import action that keeps existing rules and adds overlapping imported rules as separate rules.

## Example dialogue

Developer: "Are you moving your whole setup or sharing a few rules?"
User: "I need a full backup for my other browser, and a selected-rule export for my teammate."
Developer: "The teammate's export contains an invalid rule."
User: "Show me which rule is invalid and ask whether I want a partial import."
