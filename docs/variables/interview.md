# Variables design interview

Status: design complete and implemented. Rounds 1–3 record the user's answers. The user then delegated every remaining product decision to the design sub-agent (Claude Opus 5.5). The [delegated design decisions](#delegated-design-decisions) below are that agent's choices, not literal answers from the user. The [specification](spec.md) consolidates the design; only implementation remains.

The user proposed a variables feature using placeholders such as `{{AUTH_TOKEN}}`.
Recommendations below are proposals until the user answers.

## Round 1: scope

1. Should the first version use manually entered text values? Recommended: enter a value once and update it manually when it changes. Automatic token capture and generated values would be separate future decisions.
2. Should placeholders work only in request-header values initially? Recommended: support Header Rules and every Switch Rule option's header values. Network Rules, request URLs, website domains, and header names would remain outside the first version.
3. Should all rules share one collection of variables? Recommended: a variable name has one value across the extension installation. Website-specific values and selectable environments would remain outside the first version.

### Confirmed answers

1. Manually entered text values.
2. "Everything." This rejects the proposed restriction to Header Rule and Switch Rule header values. Round 2 asks for the precise field list and treatment of existing typed controls.
3. One shared collection of variables across this extension installation.

The user explicitly excluded a collections feature after considering it. Collections are not a prerequisite or part of this feature.

## Round 2: confirmed substitution and management

1. Interpret "everything" as all editable text fields: website domains, request URLs, header names and values, mock response bodies, rule names, and Switch option names. Keep method, status, server mode, toggles, and identities in their existing typed controls.
2. Use case-sensitive variable names containing letters, digits, and underscores, with a letter or underscore first. Accept optional whitespace around the name inside `{{ ... }}`.
3. Substitute text literally in one pass. Do not recursively resolve references inside variable values or automatically URL-encode or JSON-escape values.
4. Allow rules with missing references to be saved, but keep affected rules inactive and show the missing names. Do not send unresolved placeholders as request headers or use them for request matching.
5. Preserve variable values exactly, including whitespace and an empty string. Validate each resulting rule field according to its own requirements.
6. Save variables locally so they survive browser restarts. Do not synchronize them between browsers or installations.
7. Add a Variables tab in Settings for management. Keep the popup focused on rule toggles and Switch options.
8. Keep placeholders in exported rules and omit variable values by default. Decide explicit value export and import behavior in the next round.

The user selected the recommended answer for every round 2 question. All eight items above are confirmed.

## Round 3: original lifecycle and transfer proposals

1. Stage variable edits until Save, then apply the saved setup to future requests. Preserve in-flight Network requests and old execution snapshots. If storage fails, keep the prior saved setup. If activation fails after saving, retain the saved values and offer Retry activation.
2. Renaming a variable updates matching references throughout saved rule templates, including disabled rules and every Switch option. Preserve variable reference spacing and all unrelated text. Reject duplicate variable names. Do not rewrite literal text in variable values or old execution snapshots.
3. Block deletion while a variable is referenced anywhere in saved rules, including disabled rules and unselected Switch options. Show those references so the user can remove or replace them first.
4. Use a backslash to escape a literal reference: `\{{AUTH_TOKEN}}` produces the literal text `{{AUTH_TOKEN}}` and is not a dependency. Consume that escape during the single substitution pass, without interpreting inserted variable text again.
5. Keep a rule inactive when its resolved website domain, request URL, header, or required name is invalid. Report the field and cause. Invalid mock JSON remains a warning and can still be returned exactly as entered, consistent with existing Network Rule behavior.
6. A missing or invalid reference confined to an unselected Switch option does not deactivate its working selected option. Mark the broken option; selecting it makes the rule inactive until corrected.
7. Hide values by default in the Variables tab and provide reveal/hide controls. This display choice does not encrypt storage or promise masking in rules or execution history.
8. Execution history retains the saved template and the resolved settings used at execution time. Later edits do not change old records. Include only the applicable rule/selected option, not a dump of all shared variable values. Preserve the current unmasked execution-value display.
9. Offer an unchecked Include variable values export choice. With it enabled, ordinary rule exports include referenced variables from all exported rule fields and Switch options; All/full backup includes every variable, including unused ones. Without it, exports contain placeholders but no variable values.
10. Treat an unescaped malformed reference, such as `{{AUTH-TOKEN}}` or an unclosed `{{AUTH_TOKEN`, as a syntax error. Allow saving but keep the affected rule inactive, as with a missing variable. Use the literal escape for placeholder-like text that should be returned unchanged.

### Confirmed answers and superseded proposals

1. Explain more. Save timing and activation handling were left open. Round 4 explains the choice with an editing example, and delegated decision 1 settles it.
2. Rename the variable and update saved references. This confirms the rename proposal, including disabled rules and every Switch option. Existing execution snapshots remain unchanged.
3. Confirm deletion and leave affected rules inactive. This rejects blocking deletion while referenced. Show affected references in the confirmation and preserve rule templates so recreating the same variable can repair them.
4. The user wants an editor suggestion popup triggered by typing `{{`, filtering as typing continues, with Enter confirming a variable. They said the variable would "only be selected from an activated dropdown." This replaces the proposed backslash-escape answer with a new prerequisite: whether only confirmed selections are references or typed/pasted placeholder text also resolves. Round 4 clarifies this distinction before choosing escape or malformed-reference behavior.
5. Skip invalid rules; keep invalid JSON warning-only. Confirmed.
6. Only the selected Switch option affects activation. Confirmed.
7. Hide values until explicitly revealed in the Variables tab. Confirmed.
8. Keep templates only; omit resolved values from execution history. This rejects retaining both templates and resolved settings. Round 4 clarifies how this applies to the Changes and Request details as well as the Rule snapshot.
9. Omit values entirely; no value export in the first version. This rejects opt-in value export, including value export in a full backup. Rules retain references; users restore values manually through Variables.
10. The user asked whether answer 4 also resolves malformed syntax. It does not fully do so until typed/pasted text versus confirmed selection semantics are settled. Do not adopt the original malformed-reference error or backslash-escape proposals by default.

## Round 4: Save and autocomplete clarification

These were proposals put to the user. The user did not answer them individually and delegated the remaining decisions instead. See [Delegated design decisions](#delegated-design-decisions) for the outcome of each one.

1. Explain staged Save with a concrete example: edits to AUTH_TOKEN stay in a Variables-page draft while existing requests use the last saved token; Save commits the draft and applies it to subsequent requests. Cancel discards it. Preserve the previous setup on storage failure; retain saved values and offer Retry activation if activation fails after saving.
2. Only a confirmed suggestion selection creates a reference. Manually typed or pasted `{{NAME}}`, malformed braces, and unfinished text remain literal. The alternative is ordinary text templates where any valid typed or pasted reference resolves. The user must choose before escaping, clipboard semantics, or representation is finalized.
3. Suggestions show saved variable names only, not values. Arrow keys navigate, Enter confirms, Escape dismisses, and typing filters. A no-match message points to the Variables tab rather than creating values inline.
4. Clarify whether template-only applies throughout Overidify's execution history or only to its Rule tab. Recommended: use templates for settings and Changes, omit resolved request/response snapshots and raw header observations, and retain method/status/timing/outcome details. The alternative keeps raw captured traffic visible even though the Rule snapshot contains templates only. Neither behavior changes Chrome's native Network panel.
5. Imported references use existing local variables with exactly matching case-sensitive names. Import review lists reused and missing names; it never imports variable values. Missing references leave affected rules inactive under the already-confirmed policy.

## Existing behavior relevant to the design

- All website eligibility uses the shared domain matcher. Placeholder resolution must preserve this shared behavior across Header Rules, Switch Rules, Network Rules, and the popup.
- Website normalization currently lowercases the saved domain pattern. Applying that operation to a template would change case-sensitive variable names. Template identity must be preserved if case-sensitive names are adopted.
- Saved header names and values are currently trimmed, while mock response bodies are preserved. Variable text and resolved field validation require an explicit policy rather than reusing those transformations indiscriminately.
- Header and Switch values compile into browser request-header rules. Network Rule configurations are sent into the matching website's page context. A variable collection must not be sent to the page wholesale merely to resolve an individual rule.
- Exports currently serialize saved rule values directly. Execution snapshots retain configured values without automatic masking. Variable exports and execution display need explicit decisions.
- Settings currently uses hash routes for the rule workspace and editors. There is no existing Variables page.

## Delegated design decisions

The user delegated all remaining product decisions. The design sub-agent made the decisions below and treated the user's confirmed answers in rounds 1–3 as binding. They are design decisions, not the user's words. [spec.md](spec.md) has the full details, and [ADR 0001](adr/0001-selected-variable-references.md) explains the main trade-off.

1. **Round 4.1, Save timing.** Adopted as proposed. The Variables page keeps a draft. Saved values stay in use until Save. Cancel or leaving the page discards the draft. Save merges the draft by variable ID onto the latest stored set under the header, Network, and variables locks. A storage failure keeps the previous setup. A saved change that is not activated offers Retry activation.
2. **Round 4.2, selected versus typed references.** Only a confirmed suggestion creates a reference, following the user's "only be selected from an activated dropdown." References are stored as structured template parts. All typed or pasted plain text, including an exact `{{NAME}}`, is literal. This answers the user's malformed-syntax question: no escape syntax or malformed-reference error is needed, and round 3 proposals 4 and 10 are withdrawn. References render as chips everywhere. Copy and paste between Overidify fields keeps references through a private clipboard flavor, and other paste sources insert literal text. Existing data and version 1/2 exports keep their exact meaning. Round 2.2's whitespace tolerance now applies only to the suggestion filter query, and round 3.2's "preserve reference spacing" has nothing left to preserve.
3. **Round 4.3, suggestions.** Adopted as proposed. The list shows names only. It ranks case-insensitive matches, uses arrows to move, Enter or click to confirm, and Escape to dismiss. With no match, it links to the Variables page in a new tab so the editor draft is kept. The list's keys do not trigger editor Escape, domain Enter, or Select-mode Escape.
4. **Round 4.4, template-only history.** Applied throughout Overidify's execution history. Rule snapshots, Changes, and Headers show templates. The header installation ledger stores templates, and its signatures no longer use resolved DNR actions. Network records keep templates for request URLs, response headers, and bodies that contain references. The background hides variable-derived header values, header names, and call-server URLs before sending request observations to DevTools. It retains unrelated details when it can establish which settings applied, including during activation changes. Chrome's Network panel and the DevTools Requests tab still show Chrome's network log.
5. **Round 4.5, import.** Adopted as proposed. References bind to local variables by exact name. The review lists used and missing names. Values are never imported, and missing references leave rules saved but inactive. Exports use format version 3 only when a rule contains a reference.
6. **Template fields.** "Every editable text field" means rule names, website domains, header names and values, Switch option names, the Network request URL, the response body, and response header names and values.
7. **Inactive versus enabled.** A variable problem never blocks Save and never changes a rule's enabled toggle. The rule is inactive until the problem is fixed, then reactivates by itself. A rule is active only when its name, domains, and applicable fields resolve and validate. For Switch Rules, only the selected option counts, as confirmed in round 3.6. Resolved fields are validated against their own requirements. An empty resolved header value is inactive. An empty body is valid. Invalid JSON is a warning only, as confirmed.
8. **Domains.** Literal domains are normalized as today. Domains containing references keep their stored case so variable names stay case-sensitive. Domains are normalized after resolution and checked with the shared matcher in every surface.
9. **Problem visibility.** Problems appear in Settings card badges, inline editor issues, broken-option markers, popup row warnings, a popup footer count for rules with unresolvable domains, and the Variables page's Used by and Referenced but missing sections. Resolved values are never shown outside the Variables page reveal.
10. **Open editors.** Editors remap references in both the draft and the saved baseline when a variable is renamed elsewhere. Deleted names show as missing chips.
11. **Search.** Settings search matches template display text and never variable values.
12. **Compatibility.** No migration is needed. Downgrading after saving references is unsupported.

## Open branches

None. Implementation follows [spec.md](spec.md).
