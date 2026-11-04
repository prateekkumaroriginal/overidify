# Executions

Design decisions accepted through 2026-11-04. Implementation was authorized with `$implement`. The selected method passed its basic packed-extension experiment on stable Chrome 154.0.8037.97 on Linux. Focused application reporting checks also passed on Chrome 119. Store-installed behavior remains unverified. See [validation](validation.md) for implementation checks.

## Panel

Add an Executions tab inside the existing Overidify DevTools panel. Keep the Requests tab. Show the execution table beside a side inspector with Changes, Request, and Rule tabs. At narrow widths, place the inspector below the table.

Include Header Rules, Switch Rules, and Network Rules. Web Store compatibility is required.

## Selected observation method

Keep Chrome DNR responsible for Header and Switch modifications. Observe actual requests and available header stages with nonblocking `webRequest` listeners. Query Chrome's rule-match history with `getMatchedRules` and the feedback permission to obtain browser-reported rule occurrences. Preserve snapshots of the exact installed rule versions, including the selected Switch option.

Admit Header/Switch execution rows from browser-reported occurrences. A match against saved settings alone does not create an execution row. Use request observations to enrich rows only where the association is reliable. The match-history API does not include a request ID or URL; missing or ambiguous fields show `Not captured`.

Report Network executions and observed outcomes directly from the Network interceptor. A synthetic bypass does not imply that a Header or Switch rule ran on a native request.

Header/Switch confirmation may arrive after polling. A browser-reported match does not prove changed bytes reached the server. Keep configured changes, observed values, request outcomes, and rule outcomes distinct. Do not invent Header/Switch failure results from an HTTP or transport failure.

The packed Linux experiment verified feedback queries without an activation gesture, repeated occurrences, same-value sets, suppressed and partial contributions, immutable version-ID mappings, per-tab IDs, and immediate navigation recovery. The actual polling quota was also enforced. General request association and complete lifecycle recovery remain limited. The selected method does not depend on unpacked-only `onRuleMatchedDebug`, a debugger attachment, a native companion, or additional transmitted marker headers.

Header/Switch polling shares one 35-second schedule across inspected tabs and persists its last call time across worker restarts. Its rows leave request identity and original/final header values uncaptured. The Request inspector can browse separate native header observations, explicitly without linking them to the selected rule. These observations share the history budget.

See [the research report](../research/execution-logging.md) for primary sources, alternatives, and validation gates.

## History and details

- One row represents one reported rule execution, including an observed failure where the reporting source supports that outcome. Rules that never run have no execution row.
- Store execution-time details and rule settings. Later edits do not rewrite old rows.
- Label unavailable values `Not captured`. Absence of evidence does not imply an empty value or successful execution.
- Show recorded values as captured. There is no automatic masking in the first version.
- Capture only the inspected tab while DevTools is open, including when another DevTools panel is selected.
- Preserve history across reloads and navigation. Manual Clear and closing DevTools clear the history.
- Use an estimated 50 MiB budget for retained execution history. Remove oldest executions first and show the removal count.
- Retain complete response bodies when their execution records fit the shared history budget. There is no separate per-body cap. Omit an oversized body with an explicit explanation, retaining the remaining execution details.
- Keep the selected execution pinned as new rows arrive.
- Pause stops logging while rules continue running and existing history remains visible. Resume records future executions without backfilling the paused interval.

## Boundary behavior

Capture is best effort. A disconnected worker produces a visible gap notice. Recovered match occurrences retain frozen source identities; overlapping polls count equal-timestamp occurrences rather than collapsing them. Unmapped browser IDs are never attributed to current settings. Old installed mappings are retained for ten minutes after retirement; later recovery can lack snapshots. Request association remains conservative.

Executions begun before Pause may finish while paused. Clear rejects delayed results from before its boundary. A selected record removed by eviction is replaced by an eviction notice, rather than retained outside the budget. Metadata that alone exceeds the whole budget is omitted, increments the removal count, and produces an explicit notice. A header observation too large to retain produces a notice. Snapshot-storage pressure can reduce reporting coverage but must not prevent otherwise valid header installation.
