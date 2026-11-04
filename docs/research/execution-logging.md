# Execution logging in Overidify DevTools

Researched 2026-11-03. Research only. Read `AGENTS.md`, the existing interception notes, and relevant local code at `d8892d11c677a6727aa4027d5a491dcecc4302c8`. Requestly source links pin `3ba50dcd96be7f0d82b10c2aa41d646a717cd968`, its inspected master revision. Chromium links pin `e4d1dc1e70c6f0f321b17b8032fd213d797f049b`. Source inspection and upstream tests are evidence about those revisions. The isolated debugger probes below used an unpacked fixture in Chrome for Testing 151.0.7922.34; they do not validate a published extension or every supported Chrome release.

## Conclusion

Selection update, 2026-11-04: the user selected the combined request observer and Chrome match-history method. The accepted design is recorded in [the Executions specification](../executions/spec.md). The [packed runtime experiment](#packed-runtime-validation-2026-11-04) subsequently passed its basic API, contribution, and history checks on Linux stable Chrome 154. Store-installed behavior, Chrome 119, and full integration remain unverified; application development is still paused.

Validation update, 2026-11-04: the [isolated packed experiment](#packed-runtime-validation-2026-11-04) passed the basic feedback, occurrence, header-contribution and immediate navigation-recovery checks in stable Chrome 154.0.8037.97 on Linux, using a signed CRX with `installType:"sideload"` and external-pref location `2`. Store delivery, Chrome 119 and the remaining lifecycle/completeness gates are still unverified. Application development remains paused.

Keep Header, Switch, and Network in the design. A practical extension-only candidate preserves DNR header modification, combines production `webRequest` observation with installed-rule snapshots, and instruments Overidify's actual Network interception branches. It can show observed header outcomes and directly reported Network executions. A second, stronger source-supported path uses `getMatchedRules` to admit genuine browser-reported Header/Switch occurrences, with missing request details explicitly shown as `Not captured`. Neither path establishes complete request-by-request causal attribution in all circumstances. [Local DNR][L1], [local interceptor][L2], [Chromium header application][C5], [match tracker][C1].

An important correction to the initial research premise: `getMatchedRules` is not limited to unpacked extensions or to an `activeTab` gesture. Its specific API contract permits `declarativeNetRequestFeedback` **or** granted `activeTab` for a filtered tab. Chromium leaves the feedback permission available to normal extensions, restricts only `onRuleMatchedDebug` and `testMatchOutcome` to unpacked locations, and runs feedback-based match-query browser tests under both packed and unpacked load types. The broad documentation introduction describes feedback as unpacked debugging; the member contract and inspected implementation are more precise. Treat the feedback-permission route as a serious production candidate requiring packed-binary and Store validation, not an undocumented internal API. [API contract][D1], [permission features][C3], [API features][C4], [permission check][C7], [packed test parameterization and query tests][C8].

Ordinary debugger observation also deserves a fresh gate: the isolated probe below demonstrated coexistence with native docked DevTools, contradicting a blanket impossibility conclusion from the API reference alone. It adds richer request observation, not DNR rule attribution. [Conflicting reference][D5], [multi-client announcement][D17], [pinned attachment implementation][C16], [probe findings](#isolated-debugger-probes).

Recommended research gate: validate the hybrid observer plus feedback polling, including immutable rule-version IDs described below; compare debugger observation if its broader permission is acceptable. It keeps all three rule types and the current modification behavior. Do not select Network-only, replace DNR with page headers, or call matching alone proof of execution. If exact, complete, immediate, request-linked browser execution evidence is mandatory, this research has not established an extension-only solution meeting that stronger contract. [Evidence limits][C1], [header arbitration][C5], [existing interception decision](network-rules-interception.md).

## Evidence labels and fixed product requirements

- **Documented guarantee** means a public API/specification states the behavior.
- **Source finding** means inspected first-party implementation or upstream test code supports it at the pinned revision. Upstream tests were read, not run here.
- **Inference** means a conclusion follows from cited mechanisms, with assumptions stated.
- **Untested hypothesis** means a proposed combination still needs a bounded runtime experiment.

The task's settled product contract is the source for the following requirements, not a browser guarantee. Use a dedicated Executions tab with a side inspector containing Changes, Request, and Rule. Include Header, Switch, and Network. One row represents a rule execution, including observed failures; rules that never run get no rows. Freeze execution-time information; unknown fields read `Not captured`. Capture the inspected tab while DevTools is open, including when another panel is selected. History survives reload/navigation and clears on manual Clear or DevTools close. No automatic masking. Retain full response bodies when the execution fits the estimated 50 MiB history budget; omit oversized bodies with an explanation and retain remaining details. Evict oldest records with a count. Keep selection pinned. Pause stops logging only, keeps history and rules active, and Resume records future activity only. Result evidence and all-types feasibility remain open. None of the proposals below silently changes these requirements.

## What exists locally

Source findings:

- Header and Switch share `requestHeaderRulesToSessionRules`. It sorts by order, resolves Switch's selected option, compiles nonempty enabled entries to request-header `set` actions, and limits them to eligible tab IDs using the shared page-domain matcher. The explicit resource list includes frames, scripts, images, XHR, WebSocket and others, excludes top-level navigation, and currently omits `webtransport`. Actual installed conditions, rather than an assumed future resource list, must govern inference. Numeric IDs and priorities are both `1000 + filtered index`; IDs can change meaning on updates. [Compiler][L1], [Switch resolution][L3], [shared matcher][L4].
- The background serializes requested synchronizations, reads storage and tabs, and tracks top-level URL changes starting at `onBeforeNavigate`. `updateSessionRules` acknowledgement is separate from a settings write. There is no installed-generation ledger exposed to a logger. Re-reading storage at request time cannot prove which rules Chrome selected earlier. [Background synchronization][L5], [compiler and installer][L1], [DNR request-stage timing][C6].
- Network interception owns fetch/XHR selection, native call-server requests, synthetic bypass responses, and failure/abort handling. Selected fetch settings are captured before later awaits once initialized. No execution-event emission exists in the inspected interceptor or bridge. This is the right place to report actual Network branch entry and outcome. [Interceptor][L2], [bridge][L6], [page installation][L7].
- The manifest already declares DevTools, DNR and broad host access, but neither `webRequest`, `activeTab` nor feedback permission. The DevTools registration page currently creates the panel; the existing HAR capture helper belongs to a different feature, filters to fetch/XHR, and uses a 250 MiB body budget. That helper does not implement this proposed 50 MiB execution-history contract. [Manifest][L8], [registration][L9], [current capture helper][L10].

## What Requestly actually does

The parent supplied a useful lead. Reading the full relevant source confirms this path at the pinned revision:

1. `webRequestInterceptor.ts` observes `onBeforeSendHeaders`, retrieves enabled rules from its settings cache, runs `matchRuleWithRequest` for HEADERS/USERAGENT, and calls `onRuleExecuted` when the matching pair has request modifications. `onHeadersReceived` does the analogous check for HEADERS response modifications. The request listener asks for `requestHeaders`; the response listener also asks for `extraHeaders`. [Listener implementation][R1].
2. `matchRuleWithRequest` checks source URL and configured filters, finds a matching pair, and returns `isApplied: true`. That variable means the JavaScript matcher found a pair. It does not inspect Chrome's applied rule IDs, arbitrate competing header operations, or compare post-modification headers. [Matcher][R2].
3. `onRuleExecuted` calls `sendLogToDevtools`. The message contains the rule object, timestamp, URL, method and request type. It sends neither a browser request ID nor observed before/after header values. [Execution handler][R3], [DevTools transport][R4].
4. `ExecutionsContainer` appends those messages and displays a resource table. Columns are URL, Method, Type and Rule. The details UI says "Rule applied"; its modification field is commented out. Navigation clears by default unless preserve-log is selected. These are UI labels and behavior, not stronger execution evidence. [Container][R5], [columns][R6], [details][R7].

The actual modification path is separate. The app's header parser creates DNR `modifyHeaders` actions. Its inspected header parser does not assign a priority; DNR defaults unspecified priority to 1. The worker copies stored `extensionRules`, assigns numeric IDs by current list position, deletes all dynamic rules before re-adding enabled rules, and debounces rule/group changes by 500 ms. Its observer cache refreshes independently. The logger does not join an event to an acknowledged installation generation or successful DNR rule ID. Consequently a matching settings object can differ from the installed state during changes or failed installation. This is a source-based race concern, not a measured Requestly bug. [Parser][R8], [worker installation][R9], [settings cache][R10], [DNR rule priority contract][C9].

No before/after verification appears in this execution path. A repository code search for `onSendHeaders` returned no results; that negative search is not proof against every uninspected recorder or deployed implementation. The handler also reports request and response matches separately, so it is not evidence of Overidify's one-row-per-execution policy. [Listeners][R1], [transport][R4].

The fetched Store listing showed version 26.7.27, updated July 27, 2026; the inspected source revision is dated October 22. No binary-to-commit mapping was established and no Store package was installed. Therefore this report establishes a first-party implementation precedent for useful inferred execution visibility, not that the published version has this exact code or that its "applied" label proves browser causality. [Store listing][R11], [inspected commit][R12].

## Candidate 1: observe real requests and model installed contributions

### Supported observation

Documented guarantee: ordinary MV3 can observe `webRequest` with its permission and appropriate hosts. Blocking permission is restricted to policy-installed MV3 extensions; this logger needs no blocking listener. Host access must cover the request and initiator. Public event schemas supply request IDs, URL, method, type, tab/frame information and timestamps. `onSendHeaders` includes modifications made at the preceding header stage. It is still a browser-visible abstraction, not all final-wire headers. [webRequest contract][D2], [event schemas][C10].

Source finding: Chromium computes DNR candidates before extension `onBeforeRequest` observation and applies request-header arbitration after the before-send listeners. The merge processes DNR operations in precedence order, prevents disallowed later writes, and records contributing DNR actions. An observer can therefore retain a visible before-stage header set and the visible sent-stage result for the same webRequest request ID. This is much stronger than matching a saved rule against a URL. [Implementation overview][C6], [header merge][C5], [event routing][C11].

Proposed research architecture:

1. Register nonblocking observation for the inspected tab's lifecycle. Retain `onBeforeRequest`, `onBeforeSendHeaders`, `onSendHeaders`, redirects, completion and errors as needed. Separate redirect/authentication legs; a request ID is not a promise of one URL or one send-stage event. Capture bodies only from sources that actually expose them. [Lifecycle and IDs][C10].
2. Maintain an acknowledgement-backed ledger of exact installed DNR rules, their complete source-rule snapshots, Switch selection, compiled headers, tab bindings, semantic priority and browser ID. Retain previous versions for in-flight work. Bootstrap from `getSessionRules` and reconcile it with a persisted mapping; unknown mappings stay unknown. Centralize this with the existing installer, rather than having another writer compete with it. [Local installer][L1], [sync queue][L5], [current-session query contract][C9].
3. Model only the installed conditions and deterministic contributions within Overidify. Compare visible postconditions per header and preserve evidence provenance. Keep inferred intended changes separate from observed changes. [Precedence implementation][C5], [sorted action collection][C12].
4. Join request-stage errors to that request record. Say "Request failed after observed header stage" when supported; an HTTP 401/500 or later network error does not prove the header rule itself failed. An error before application does not prove an execution occurred. [Lifecycle][C10], [application-stage tracking][C11].

These steps are proposals, not an implemented or runtime-verified logger.

### What the model can and cannot establish

For current set-only rules, descending semantic priority determines which Overidify rule may set each header, provided the installed generation is known. A lower-priority rule can contribute another header while losing Authorization. A rule whose every operation is suppressed should appear only in another execution's explanation, not as its own execution row. Shared page eligibility should remain the same matcher used by Header, Switch, Network and popup, but inference should evaluate captured installed tab conditions, not recompute the past from today's active URL. [Compiler][L1], [matcher][L4], [header conflict code][C5].

Source finding: Chromium sets `header_modified = true` for an accepted `set` without testing whether the old value already equals the new value. Entirely conflicting actions do not enter `matched_dnr_actions`. Thus an unchanged visible value does not establish "did not execute", and a URL match does not establish "did execute". An explicit browser match record is stronger than a header diff for these cases. [Set and conflict implementation][C5], [tracking call][C11].

Inference: a unique modeled Overidify contributor plus an observed matching value provides useful postcondition evidence under stated assumptions. It does not prove exclusive cause. Other extensions, user-agent restrictions, hidden headers, withheld access and installed-generation uncertainty can break those assumptions. Different extensions' DNR precedence depends on installation order; an `allow` in another extension is not a global exception to Overidify's rules. Allow/allowAllRequests suppression inside a DNR extension must be modeled if that extension gains such rules later. [Arbitration overview][C6], [permission and priority checks][C12], [header application][C5].

A settings-update acknowledgement is a checkpoint, not an atomic timestamp linking a webRequest callback to Chrome's earlier action selection. Requests can select old actions before an update and apply them later. Mark such observer-only records as generation-ambiguous rather than selecting the newest storage version. Immutable IDs plus browser match evidence address part of this problem in candidate 2. [Stage ordering][C6], [current ID reassignment][L1].

`webRequest.onActionIgnored` is not a replacement DNR per-rule failure feed. Its schema has request ID and ignored action type, without rule ID; the inspected header merge silently skips conflicting DNR operations while separately collecting ignored webRequest proposals. Installation failures are configuration diagnostics, not evidence of an execution. This leaves observed request failures, rejected Network branches, and independently verified discrepancies as distinct outcomes. [Event payload][C10], [conflict handling][C5], [routing][C11].

### Evidence and outcome vocabulary

Proposed vocabulary, requiring product acceptance where it broadens row admission:

| Label | Required evidence | What the label must not imply |
| --- | --- | --- |
| Reported by interceptor | Actual Network branch emits an execution ID and frozen selected rule | Native browser request or DNR activity occurred for a bypass |
| Reported by Chrome | A `getMatchedRules` occurrence, with an unambiguous version-ID mapping | Known request URL, request ID, successful transport or changed bytes |
| Observed | Named field/value captured at a specified request stage | Exclusive attribution to this rule |
| Expected | Installed-rule contribution model predicts this operation for an observed request | Chrome confirmed this execution |
| Conflicted | Known model conflict, or visible result differs from expectation, with reason | A specific external extension caused it |
| Unknown / Not captured | Evidence is missing or correlation is ambiguous | Empty header/body, success, or a rule never running |

Keep evidence and outcome as separate fields. "Observed" should describe the captured value, while "Expected" describes attribution. A generic "Success" column would erase this distinction. This taxonomy follows the different information supplied by [browser match records][C1], [webRequest][C10] and [the local interception branches][L2].

**Exact amendment needed for a Requestly-style observer-only table:** allow a row for an observed request's *inferred contributing rule*, explicitly labeled Expected, even when no browser or interceptor execution event identifies it. This relaxes the settled "one row per rule execution; exclude never-running rules" meaning. An eligible rule can still be fully suppressed externally or canceled before application. Adding an Unknown status alone does not fix false row admission. This amendment has not been accepted. [Counterexample mechanisms][C5], [cancellation ordering][C11].

Without that amendment, admit Network events and browser-reported DNR occurrences only. Observer matches can enrich confirmed rows or provide contextual diagnostics, but cannot independently create confirmed execution rows. Missing fields remain allowed by the existing `Not captured` requirement. Completeness and reliable request-linked failure attribution remain unresolved even with this stricter admission policy. [Match payload][C1], [Network branch control][L2].

## Candidate 2: packed-compatible browser match history

### Permissions and occurrence semantics

Documented guarantee and source findings agree on the specific method: feedback permission permits match queries; granted `activeTab` permits a filtered tab query. `onRuleMatchedDebug` and hypothetical `testMatchOutcome` remain unpacked-only. Feedback permission itself has no unpacked-location restriction in Chromium's permission feature list. The actual permission helper checks feedback globally or for a particular tab, and `PermissionsData` includes tab-specific grants. [API contract][D1], [API gates][C4], [permission gates][C3], [method permission implementation][C7], [permissions data][C13].

The activeTab-only route requires an invocation such as the toolbar action, extension shortcut or context menu. Opening DevTools or clicking inside a custom panel is not documented as granting activeTab. Same-origin navigation retains the grant; cross-origin navigation revokes it. Broad host access does not replace this special match-query permission. These restrictions concern match queries, not continued operation of installed DNR. [activeTab contract][D3], [activeTab query test][C8].

The earlier repeated-match uncertainty is resolved **at the inspected revision**. `ActionTracker::OnRuleMatched` appends a `TrackedRule` to a list on each recorded action; it does not upsert the latest time for a rule. `GetMatchedRulesTimestampFiltering` causes the same rule to match twice and expects counts 2, 1 and 0 under successive time filters. The lifespan unit test also retains two occurrences of the same rule/request fixture. These browser tests are parameterized for packed and unpacked extensions. [Tracker][C1], [timestamp-filter browser test][C8], [tracker unit test][C2].

For header actions, tracking is downstream of accepted header operations. The routing helper guards `action.tracked`, so the same action is not simply counted again at every processing stage. A same-value `set` can be tracked; a fully suppressed set-only action is excluded. This gives meaningful browser-level contribution evidence, although it still does not mean distinct bytes reached a server. [Header merge][C5], [tracking and deduplication][C11].

### Completeness, navigation and correlation

- Query output contains rule/ruleset ID, tab ID and timestamp only. It has no request ID, URL, method, headers, status, error or configuration snapshot. Repeated occurrences can have identical exposed tuples. [Schema][C9], [conversion code][C1].
- Current-document occurrences remain associated with the tab. When a different document commits, old occurrences move to tab `-1`; tab close also transfers them. The tracker trims unknown-tab occurrences after five minutes. Here "active document" is not the browser's foreground tab. A same-origin reload can lose old matches from a filtered tab query even while the activeTab grant survives. [Tracker lifecycle][C1], [lifespan constant][C14], [navigation browser test][C8].
- With activeTab alone, the old `-1` pool is inaccessible through a grant for the real tab. Polling at unload cannot guarantee a final read, and consumes quota anyway. Feedback permits querying the old pool, but it has lost original tab identity. Several inspected tabs, or other tabs using the same rule, make naive reassociation unsafe. [Permission implementation][C7], [tracker transfer][C1].
- Automatic calls share a 20-per-10-minute quota for the extension; user-gesture calls are exempt. The implementation uses a singleton quota bucket, not one bucket per inspected tab. A timer is not a continuing user gesture. A shared poll around every 35 seconds is a conservative hypothesis, not a real-time feed or quota guarantee under other callers. [Constants][C9], [quota implementation][C7].
- The source applies `>= min_time_stamp`, despite "after" wording in the public filter description. Use overlap plus occurrence counts, not a Set of tuples or `lastTimestamp + 1`. Equal tuples have no unique occurrence cursor. Transfers from tab ID to `-1`, permission changes, clearing and history trimming complicate deduplication. [Filtering and lists][C1].
- webRequest timestamps are guaranteed internally consistent, not comparable to extension wall time. DNR timestamps use browser wall time. A nearby timestamp across the APIs is not an identity key. Concurrent requests, redirects and delayed callback handling can yield multiple candidates. Preserve an association as inferred, or leave request fields uncaptured. [webRequest timestamp caveat][D2], [DNR time generation][C1].

### A stronger hypothesis worth testing: immutable browser IDs

The current compiler need not abandon DNR to improve evidence. Allocate a fresh browser rule ID for each immutable source-rule version and retain a mapping to its exact snapshot. Keep semantic priority independent of identity. Optionally split each compiled rule by tab and recording generation, so its browser ID identifies the original tab even after Chrome moves the occurrence to `-1`. Query with feedback permission; map actual browser-reported IDs back to frozen Header/Switch snapshots. This combines supported rule identity and match records, but the complete design is an **untested hypothesis**. [Rule ID/priority schema][C9], [current tab-scoped compilation][L1], [match identity and transfer][C1].

This could preserve genuine per-rule occurrence rows and config snapshots across normal polling intervals and navigation, without changing transmitted headers. It also avoids treating an old numeric ID as a newly edited rule. Conditions and priorities must remain behaviorally equivalent; a split produces more installed rules and consumes both session-rule and regex-rule capacity, since the current compiler uses `regexFilter`. Mapping recovery, ID reuse, simultaneous installation writers and old in-flight actions need explicit handling. A record from an unmapped ID must not inherit the newest rule definition. [Compiler][L1], [action persistence through stages][C6], [session rule API and limits][C9].

It does not manufacture a request ID. Use webRequest/HAR correlation only when supported by enough context, never by timestamp alone. Bare confirmed rows can display `Not captured` for request details and response body. Polls delayed beyond five minutes after navigation can miss records; extension unload/removal of its matcher clears tracker data. Browser-side recording is not bounded by Overidify's 50 MiB history budget, and the inspected tracker has no count cap for current-document matches. Measure large histories and query payloads. [Tracker storage][C1], [matcher removal][C15].

Recording generations could also distinguish matches while logging is paused or before DevTools opens. Swapping equivalent ID cohorts on recording transitions is a hypothesis with request-stage timing and rule-churn costs. Define when a transition becomes effective and how in-flight work is treated. Do not retrospectively ingest paused matches on Resume, or promise exact open/close boundaries from a delayed first poll. A baseline query with multiset accounting is simpler but has its own startup and transition races. [Application timing][C6], [quota and query implementation][C7].

Feedback polling is therefore stronger than pure expected-match logging, and can preserve strict row admission for recovered occurrences. It does not yet establish complete observed failures or complete request detail capture. No product amendment is required merely to retain genuine rows with uncaptured fields; accepting best-effort completeness, delayed arrival or inferred associations would need to be stated wherever the final specification promises more.

## Concrete scenarios that must remain honest

| Scenario | Supported conclusion and proposed presentation |
| --- | --- |
| Header sets Authorization=A; higher-priority Switch sets Authorization=B | The set-only model suppresses the lower write. If Header has no other contributing header, do not create its execution row. Chrome's accepted-action tracking can distinguish contributions. Authorization may be absent from an observation stage; `extraHeaders` is not a blanket final-wire visibility guarantee. Show intended B and any actual captured value separately. [C5][C5], [D2][D2]. |
| Authorization already equals the selected rule's value | A zero diff does not mean no execution. Chromium records an accepted set even without a value comparison. Chrome-reported row can say "Value unchanged where captured"; observer-only attribution remains inferred. [C5][C5], [C11][C11]. |
| Another extension sets the same or a different value | Same value cannot identify the causal extension. A different value can establish a visible discrepancy, not which extension caused it. DNR precedence and webRequest priority matter. A Chrome match provides Overidify contribution evidence, not a server receipt. [C5][C5], [C6][C6]. |
| User changes a Switch option while a request is in flight | Current storage may describe the new option while previously selected actions contain the old one. Preserve candidate installation generations; prefer immutable browser-ID snapshots when actual feedback identifies the action. Never rewrite an existing row's Rule inspector. [L1][L1], [C6][C6]. |
| Another extension cancels/redirects before the header stage, or an allow rule suppresses an action | A matching URL is not sufficient for a Header/Switch execution row. Redirect/authentication legs require separate stage context. No after snapshot means no observed postcondition. [C6][C6], [C10][C10], [C11][C11]. |
| Network rule bypasses the server | The wrapper can report a real Network execution and configured synthetic response. It creates no original network request for Header/Switch to modify. Do not fabricate DNR rows by applying the page matcher to the synthetic call. [L2][L2]. |
| Network call-server rule encounters an abort or native error | Emit the selected Network execution and observed failure at the responsible branch. Capture any genuine Header/Switch contribution independently; never label every matching DNR rule failed merely because the request failed. Current call-server fetch rejects before constructing a mock on native failure. [L2][L2], [C11][C11]. |
| Network call-server returns a mock after real response headers | HAR describes the real transport response, while application code receives the synthetic one. Preserve provenance in Changes/Request and avoid merging their bodies/statuses. The local fetch code drains real bytes separately. [L2][L2], [D4][D4]. |
| Memory-cache hit, site worker response, worker-origin call, or WebSocket | webRequest documents invisible renderer-memory-cache hits. DNR covers network-stack requests, not site-worker-generated responses; requests reaching the network from a worker are a different case. Window wrappers do not instrument worker globals. WebSocket observation covers the handshake, not message executions. Report coverage gaps and do not turn an absent event into proof that a rule never ran. [D1][D1], [D2][D2], [L7][L7]. |

## Candidate 3: DevTools HAR and CDP

Documented guarantee: `devtools.network` provides HAR and finished-request notifications, and `Request.getContent` retrieves response content. It requires a DevTools page, not debugger attachment. It can enrich native request data while normal DevTools is open. Its public contract offers no DNR rule attribution or portable mapping to webRequest IDs. A native request finishing before listener startup may be absent, and a synthetic bypass does not generate one. [DevTools network][D4], [local bypass][L2].

Use HAR as optional enrichment. Capture content promptly if it is available; retain the obtained bytes rather than a handle expected to survive navigation. Do not assume Chrome's Network preserve-log option stores Overidify's history, or that `_requestId` and other private HAR additions are stable cross-API identity guarantees. Current local capture uses URL/method/time signatures with occurrence accounting, which is useful for its own HAR deduplication, not proof of a webRequest or DNR join. [Public contract][D4], [local helper][L10].

The debugger sources conflict. The current `onDetach` reference says opening DevTools terminates an extension session. Chrome's multi-client announcement explicitly says debugger extensions can coexist with DevTools. Pinned source supports multiple clients: `DebuggerAttachFunction` rejects an existing client for the same extension/agent host, not all other clients; `AttachClient` creates a separate session per client. Source alone does not prove every native window-opening path, so the bounded probes below tested coexistence. A universal "ordinary debugger cannot coexist" conclusion is not supported by this investigation. [Current API reference][D5], [official multi-client announcement][D17], [extension attachment and client lookup][C16], [agent-host sessions][C17].

A promising alternative is developer-facing `chrome.debugger` Network observation alongside unchanged DNR. Network events and extra-info events can supply request IDs, transport headers, responses and errors; body retrieval has its own availability/buffering limits. The fixture established attachment and event delivery, not complete body capture or equivalence of every header. CDP still exposes no public per-Overidify-DNR-rule attribution in the inspected Network interface. Correlating CDP IDs to webRequest or match-history records is not automatically guaranteed. Keep the same evidence taxonomy, and validate minimum-version, navigation/frame, ordinary user-opened DevTools, competing clients and packed-distribution behavior before selecting this path. [Network protocol][D18], [inspected protocol schema][C19], [debugger permission and sessions][D5], [match payload][C1].

This needs the broad `debugger` permission and browser debugging warning. Chrome's current protocol documentation describes `chrome.debugger` support as best-effort for developer-facing debugging extensions and warns about protocol compatibility. Overidify's developer inspector fits that stated category as an inference, not a Store approval promise. The larger permission must be justified against the less privileged webRequest/HAR design. Public `inspectedWindow.eval` gives page JavaScript access, not the DevTools frontend's privileged protocol connection. Do not recommend `InspectorBackend`, private frontend transports or custom frontend hooks as supported extension APIs. [Protocol support statement][C18], [warning implementation][C16], [minimum permissions][P1], [inspectedWindow contract][D6].

A native companion using remote CDP is a separate deployment option. The protocol supports multiple clients, and the earlier local research recorded a bounded coexistence experiment. Chrome 136+ requires remote-debugging switches to use a nondefault data directory. Native messaging requires an installed/registered host and extension permission. CDP can supply stronger request transport observations, but its public Network/Fetch data still does not directly identify Overidify's individual DNR header rules; a companion that performs the modifications itself could emit authoritative execution IDs for those owned operations. That is an architecture and setup change requiring acceptance. Current official documentation explicitly treats direct third-party CDP clients as unsupported and recommends supported tooling instead; multi-client capability is not a compatibility guarantee. This companion remains an experiment, not the default supported recommendation. [Official CDP transport documentation][D7], [pinned support statement][C18], [remote debugging change][D8], [native messaging][D9], [prior probe scope](network-rules-interception.md#isolated-browser-probes).

### Isolated debugger probes

Observed in this research on Linux, Chrome for Testing 151.0.7922.34. A small independent MV3 fixture used `debugger`, `tabs`, DNR and feedback permissions with localhost-only hosts. It was loaded unpacked into a disposable profile; no Overidify files, user profile, global proxy or certificate settings were changed. A local server served one page and a JSON endpoint. A Node script drove CDP only to orchestrate and inspect the experiment.

Two bounded coexistence checks passed:

- Attach the fixture by target ID, enable Network, then load the bundled native `inspector.html` frontend through a separate remote-debugging connection. The frontend reported a live primary page target. The extension received the endpoint's request, extra-info, response and completion events, recorded no detach event, and a debugger Runtime command returned 2 for `1+1`. Extension detach/reattach succeeded while the frontend remained connected.
- Launch Chrome with `--auto-open-devtools-for-tabs`, then attach the fixture by **tab ID** while native DevTools was open. The inspected frontend was bundled `devtools_app.html`, reported "DevTools is docked to right", and exposed both its native tab target and primary frame target for the local page. Network events continued through the extension; the Runtime command and extension detach/reattach succeeded, with the frontend still reporting its primary page target.

These results refute an unconditional attachment-conflict claim for the tested configuration. They do not prove user-triggered opening after attachment on every platform, no interference under simultaneous Fetch interception, packed-extension behavior, Store review acceptance, Chrome 119 compatibility, or DNR per-rule causality. Native DevTools model access was used solely to verify a connected target in the probe, not proposed as an application API. The temporary profile, fixture, scripts and logs were removed after recording these findings.

## Candidate 4: change the modification architecture

Moving Header/Switch into fetch/XHR wrappers would allow direct logging of wrapper-owned header operations, but it would remove existing coverage for script, image, stylesheet, frame, ping and WebSocket requests unless separately reimplemented. Window wrappers also miss worker globals and can be bypassed or replaced by page code. This is a behavior/resource-coverage change, not a logging implementation detail. [Current DNR coverage][L1], [page wrapper installation][L7], [MAIN-world contract][D10].

Page request headers obey Fetch header guards, forbidden request-header rules, credentials behavior and CORS/no-cors restrictions. Cookies, Host, Origin and other browser-controlled fields cannot simply be reproduced with `new Headers` plus fetch. Adding non-safelisted headers can require preflight and alter server acceptance; response observation remains filtered. Thus moving existing DNR sets to wrappers does not preserve Header/Switch capability merely because Authorization works in one same-origin demo. [Fetch standard][D11].

A proxy can own modification and emit its own rule-execution records before forwarding, while retaining normal DevTools. HTTPS interception requires proxy routing and certificate trust; it needs a companion, failures/restoration behavior, and a tab/page scoping protocol. A proxy's request lacks Chrome tab identity by default; top-level page matching is not equivalent to Origin/Referer matching. This route can retain all three product concepts if accepted, but changes setup and operation. A site-owned service worker requires website integration and coordination with existing workers, so it does not preserve arbitrary-site extension-only deployment. [Prior primary-source investigation](network-rules-interception.md#credible-routes-with-additional-setup), [proxy API][D12], [proxy certificate requirements][D13], [service-worker registration contract][D14].

Do not add per-rule marker headers as harmless logging. Headers that reach the server alter the observable request, can leak identifiers or rule values, affect caching/authentication/request signing, and can change CORS behavior. A marker set then removed by another DNR rule can itself be suppressed by arbitration and offers no general request-linked callback. A marker observed by the server requires server cooperation and creates a different product behavior. Immutable browser rule IDs provide an evidence route without sending new headers. [Fetch/CORS][D11], [DNR conflict implementation][C5].

## Lifecycle, retention, permissions and Store effects

The following is a proposed research design consistent with the settled lifecycle, subject to verification:

- Put the history owner and listeners in the persistent DevTools extension page, not a React component loaded only when Executions is shown. Chrome documents one such page for the DevTools window's lifetime. Keep tab-scoped collection active across other panels and document navigations. Destroy that history with the DevTools page; background routing should remove its subscription on disconnect. [DevTools lifetime and connection pattern][D15], [current registration][L9].
- Keep history outside service-worker globals. Chrome can terminate the worker; opening a port alone does not keep it alive. A reconnect must restore routing and installed-ID mappings, with an explicit gap indicator if events were lost. A live DevTools page can own its memory while worker delivery is recoverable. [Worker lifecycle][D16].
- Give every retained row an immutable execution ID and frozen rule snapshot, including selected Switch option. Keep request, intended changes, observed stages, body provenance, result and evidence source together. Multiple rules contributing to one native request can have separate rows sharing request metadata. A row admitted from delayed browser feedback may lack a request association. [Match payload][C1], [application branches][L2].
- Pause gates event admission and body collection, not DNR or wrappers' modification behavior. Resume cannot replay paused browser matches as new executions. Clear increments a generation and invalidates queued messages/content callbacks so old work cannot refill the history. In-flight completion behavior at Pause/Resume needs an explicit definition; a reasonable proposal is to finish already-admitted rows but admit no executions begun while paused. This is proposed semantics for a boundary case, not a settled requirement. [Asynchronous sources][C7], [D4][D4], [local async handling][L2].
- Implement one estimated 50 MiB budget for execution records, snapshots and retained bodies. Count text encoding, base64 overhead and shared snapshot ownership consistently. A selected row must not switch to a newer row when events arrive. If its history record is evicted, a detached selected snapshot must still count against the budget, or the inspector must retain only an explicit eviction notice. Selection is not permission for unlimited extra retention. These are consequences of the task's retention and pinning requirements.
- An oversized response body is omitted with a reason, while other details remain. No truncation, arbitrary preview-only cap or automatic masking is authorized. If metadata alone exceeds 50 MiB, the requirements need a defined exception; this research does not invent silent metadata truncation. The estimate bounds retained history, not necessarily peak browser/process memory. `getContent` returns content as a whole rather than a size-bounded stream, so retrieval can transiently exceed the retention budget. Network synthetic bodies are already known strings and need no native-body clone. [Content retrieval contract][D4], [mock construction][L2].

Add only permissions needed for the selected approach. `webRequest` plus existing permitted hosts supports observation; feedback supports broader DNR evidence, while activeTab alone has the activation and navigation costs above. `extraHeaders` is a listener option rather than a new manifest permission, exposes more sensitive header data and has documented performance costs. It should be justified by actual capture needs and validated for Authorization and other restricted/invisible fields; it does not promise every wire header. Keep the current Chrome 119 baseline in view and use the callback-compatible DevTools APIs already used locally instead of assuming newly documented Promise support. [webRequest contract][D2], [manifest baseline][L8], [local HAR callbacks][L10], [DevTools compatibility][D15].

Store-compatible here means a design using production extension APIs with a policy-compliant distribution path, not guaranteed review approval. The Store requires minimum necessary permissions, accurate privacy disclosures for handled user data, and browsing-activity collection tied to a prominently disclosed user-facing purpose. An explicit developer execution inspector is a plausible purpose; no automatic masking does not waive privacy duties. Keep captures local and scoped to inspected sessions, disclose raw headers/bodies including credentials, avoid execution telemetry, and render captured data as inert text. Those are recommendations to preserve the requested functionality, not a request to add masking or change the accepted data policy. [Permissions policy][P1], [privacy policy requirements][P2], [Limited Use][P3].

Page-originated Network events need schema, size, sender-tab/frame and lifecycle validation in the isolated bridge/background path. MAIN-world messaging is spoofable by the inspected page. It is useful developer evidence, not tamper-proof browser attestation. Do not execute captured rule descriptions, response bodies or reviewer/source text. [Chrome's own bridge spoofing warning][D15], [current bridge][L6].

Performance work should filter to inspected tabs, batch transport/UI updates, avoid rescanning storage per request, and avoid retrieving unrelated bodies. Keep nonblocking observers off the modification decision path. Measure `extraHeaders`, polling payload growth, all-frame messages, large bodies and ID-cohort rule churn. Avoid cache flushing or disabling cache to make logs appear more complete; those change inspected behavior. These are proposed precautions based on [observation cost/cache caveats][D2], [tracker growth][C1] and [current wrapper behavior][L2].

## Bounded validation plan and unresolved gates

No application implementation, normal test run, user-browser/profile modification, Store package installation, commit or push was performed. The isolated debugger probes above used disposable profiles and an independent unpacked fixture. The repeated-occurrence and packed-feedback findings come from primary source and upstream test inspection, not unpacked-only feedback events or a packed probe. Downloaded sources and probe artifacts were kept under the gitignored `.scratch/verification/execution-logging-research/` task directory and removed after report verification.

A follow-up research spike should extend the independent-fixture approach with genuinely packed installations in disposable profiles. Do not alter Overidify to conduct the initial API experiments. Record Chrome version, packed installation method, manifest permissions, exact extension source, request fixtures and observed events. Clean temporary artifacts after documenting outcomes per `AGENTS.md`.

1. **Packed API gate.** In a genuinely packed extension, test feedback-only match querying without action activation, activeTab-only before/after actual action activation, filtered/unfiltered/`-1` queries, absent debug APIs and quota failures. Repeat on the minimum supported version and current stable. An unpacked extension with debug listeners removed is not a packed-extension test. Upstream packed tests make this a credible gate, not a speculative API workaround. [C3][C3], [C4][C4], [C8][C8].
2. **Contribution gate.** Use a local HTTP/HTTPS echo fixture for one Header, one Switch, overlapping setters, same-value existing headers, partially contributing multi-header rules, and a second isolated competing extension. Compare server receipt, before/sent observation and browser match occurrences. Keep transport receipt, observed fields and causal attribution separate. Test withheld host access and fields absent from callbacks. [C5][C5], [C12][C12], [D2][D2].
3. **Immutable-ID/history gate.** Test per-version and per-tab IDs with unchanged conditions/priority, rapid edits, rules removed/re-added, failed atomic updates, stale in-flight actions, same-origin reload, cross-origin navigation, BFCache, two inspected tabs, tab close and delayed polling beyond five minutes. Verify duplicate occurrences sharing a timestamp and transfer to `-1`; validate mapping recovery after worker termination. [C1][C1], [C7][C7], [C9][C9], [C15][C15].
4. **Network/evidence gate.** Cover fetch and XHR, bypass/call-server, HTTP errors, abort, timeout, CORS/native failure, mocked versus real body/status, frames and worker/cache traffic. An independently instrumented fixture can test the reporting concept; integration into Overidify needs separate development authorization. Never fabricate a Header/Switch row for a synthetic bypass. [L2][L2], [D2][D2].
5. **Lifecycle/budget gate.** Open DevTools in Elements before first showing Overidify. Change panels, reload/navigate, Clear during pending content reads, Pause/Resume, close/reopen DevTools, restart the worker, and exhaust history with many small rows plus a body exceeding 50 MiB. Verify pinned selection, exact eviction counts, no replay after Clear/Resume, correct body omission reason, peak memory and no behavioral request changes. These checks derive from the fixed task requirements and [DevTools lifetime][D15], [worker lifecycle][D16], [body retrieval][D4].
6. **Debugger comparison gate.** Repeat both attachment orders with ordinary user-opened docked/undocked DevTools in a packed fixture on current stable and the minimum supported release. Measure debugger warnings, disconnects, extra-info headers, bodies, worker/frame coverage and interference when another client uses Fetch. Keep modifications in DNR during this observation comparison. The successful headless Chrome for Testing probe alone does not establish these guarantees. [C16][C16], [C17][C17], [D5][D5], [D18][D18].
7. **Distribution gate.** Review the actual release permissions, disclosures and packaged code against current Store policies. Confirm the reviewed packed build works while normal DevTools is open. Existing Requestly source and an unpacked experiment cannot substitute for this. [P1][P1], [P2][P2], [P3][P3], [R11][R11].

Remaining decisions are narrow and explicit: whether observer-inferred contributors may be rows; whether delayed browser-reported rows with `Not captured` request fields are sufficient; what completeness statement is acceptable under lifecycle gaps; how to represent request failure separately from rule failure; and how to handle in-flight logging transitions or metadata exceeding the whole budget. The recommended next step is the bounded packed hybrid experiment. Header and Switch remain first-class throughout.

## Packed runtime validation, 2026-11-04

### Result and scope

**PASS on installed stable Chrome 154.0.8037.97, Linux.** A genuinely packed, non-policy-installed MV3 fixture queried `getMatchedRules` with `declarativeNetRequestFeedback`, without `activeTab`, an action declaration, action activation, or a user gesture. Repeated accepted header operations produced separate history occurrences. The same fixture observed before/sent request headers through nonblocking `webRequest` listeners and received real localhost echo responses. This closes the basic packed API gate for this browser and installation type. It does not establish Chrome Web Store approval, Store-installed behavior, Chrome 119 support, or full application completeness.

The selected observer plus match-history method remains viable. Browser-reported occurrences can admit Header/Switch rows; observations can enrich them conservatively. The experiment supports immutable rule IDs and per-tab ID mappings across an ordinary document navigation. It supplies no missing request identifier and makes no observer-only row-admission proposal. Application development remains paused. Earlier source findings and upstream tests elsewhere in this report retain their original evidence labels.

### Environment and packed installation evidence

The measured run started at `2026-11-04T06:32:33.593Z`. `google-chrome-stable --version` returned `Google Chrome 154.0.8037.97`; the automation connection returned `Chrome/154.0.8037.97`. The copied browser's `CHROME_VERSION_EXTRA` identified channel `stable`. Host was Linux `6.17.0-1033-oem`, x86_64. Existing `/tmp/node_modules/puppeteer-core` version `24.15.0` and Node `v24.15.0` supplied disposable test orchestration. No dependency installation was needed. Cached executables separately returned CfT `151.0.7922.34` and `156.0.8078.4` from `--version`; neither ran these scenarios. No Chrome 119 executable was found in the inspected local caches. No historical browser download was attempted.

Chrome's documented Linux external-CRX installation was used. A private copy of `/opt/google/chrome` lived under `.scratch/verification/execution-packed-probe/chrome-copy/`. Its binary SHA-256 matched the original, `6c792041b07547a662e1b17974d1dc34a3db630379b45d9d89ddd7e3e68cc587`. Only the copy received an `extensions/<id>.json` registration. Chromium resolves this provider relative to the binary module directory and uses `kExternalPref`; this permitted isolation without writing `/opt`, `/usr/share`, policy directories, or the user's profile. The copied sandbox helper initially failed its ownership check. Replacing that copied helper with a symlink to the existing root-owned `/opt/google/chrome/chrome-sandbox` allowed the browser to launch. No `--no-sandbox` or sandbox-policy change was used. [Linux installation documentation][D19], [stable provider][C20], [stable path resolution][C21].

The fixture was packaged using the installed stable binary with `--headless=new`, a task-local `--user-data-dir`, `--pack-extension=<task>/fixture`, `--no-first-run`, and `--no-default-browser-check`. Chrome generated an actual signed CRX3 and PEM. The registration contained:

```json
{"external_crx":"<task>/fixture.crx","external_version":"1.0"}
```

The measured runtime launch arguments, after the executable, were exactly:

```text
--headless=new
--user-data-dir=<task>/runtime-profile
--no-first-run
--no-default-browser-check
--remote-debugging-port=0
```

`<task>` means the absolute task directory under this checkout. Puppeteer used `ignoreDefaultArgs:true`, with the profile path explicitly included in the arguments. There was no `--load-extension`, `--disable-extensions-except`, permission override, enterprise install, or test-only quota override. CDP orchestrated pages and evaluated the fixture's ordinary extension APIs; it did not grant extension privileges. Every worker evaluation used `Runtime.evaluate` with `userGesture:false`, `awaitPromise:true`, and `returnByValue:true`. The fixture has no action to activate. Its worker remained attached during this short experiment, so worker-suspension/recovery is unverified.

Retained runtime evidence:

```json
{
  "extensionId": "kkconmngldjecfophlpecnpdkfmjkcgo",
  "chrome.management.getSelf": {"installType":"sideload","enabled":true,"version":"1.0"},
  "profilePreference": {
    "location":2,
    "path":"kkconmngldjecfophlpecnpdkfmjkcgo/1.0_0",
    "from_webstore":false,
    "disable_reasons":[],
    "creation_flags":1
  },
  "chrome.developerPrivate.getExtensionsInfo": {
    "state":"ENABLED",
    "location":"UNKNOWN",
    "locationText":"Not from Chrome Web Store.",
    "mustRemainInstalled":false,
    "disableReasons.blockedByPolicy":false,
    "manifestErrors":[],
    "runtimeErrors":[],
    "runtimeWarnings":[]
  },
  "typeof onRuleMatchedDebug":"undefined",
  "typeof testMatchOutcome":"undefined"
}
```

The installed directory was `<task>/runtime-profile/Default/Extensions/kkconmngldjecfophlpecnpdkfmjkcgo/1.0_0/`, not the fixture source directory. Stable Chromium's location enum identifies `2` as external-pref CRX, `4` as unpacked, `8` as command-line, and `7`/`9` as policy locations. The browser's coarse `UNKNOWN` display location alone would not establish packed status; the installed path, profile enum, sideload identity and absent debug APIs supply the combined evidence. The private `developerPrivate` read was browser-installation diagnostics only, not a proposed application API. [Stable location enum][C22].

This is an ordinary-privilege Linux sideload, comparable to Store delivery for the tested API gates. It is not a Store install. Chrome displayed its off-store provenance warning. Store signatures, Store-specific behavior, other platforms and review approval remain unverified.

Two bounded installation approaches were tried. A CRX drag/drop through CDP into `chrome://extensions` produced no installed extension or fixture worker. The external-CRX approach also produced none under Puppeteer's default flags with `--disable-extensions` removed. A minimal launch succeeded. The default argument list contained `--disable-default-apps` and other suppression flags; the individual responsible flag was not isolated. Do not describe these failed automation configurations as a Chrome API rejection. The minimal-launch installation check and the measured explicitly named profile both installed the packed fixture. An intermediate Puppeteer launch with `ignoreDefaultArgs:true` omitted an explicit profile argument, so Puppeteer used and removed its own temporary profile on close; retained scenario evidence comes from the subsequent task-local `runtime-profile`. No unpacked control was needed or claimed.

### Exact fixture and request setup

The complete manifest and worker packaged in the CRX were:

```json
{"manifest_version":3,"name":"Executions isolated packed probe","version":"1.0","permissions":["declarativeNetRequest","declarativeNetRequestFeedback","webRequest"],"host_permissions":["http://127.0.0.1/*"],"background":{"service_worker":"worker.js"}}
```

```javascript
globalThis.events=[];
for (const name of ['onBeforeSendHeaders','onSendHeaders']) chrome.webRequest[name].addListener(d=>events.push({stage:name,...d}),{urls:['http://127.0.0.1/*']},['requestHeaders','extraHeaders']);
chrome.webRequest.onErrorOccurred.addListener(d=>events.push({stage:'onErrorOccurred',...d}),{urls:['http://127.0.0.1/*']});
globalThis.query = filter => new Promise(resolve=>chrome.declarativeNetRequest.getMatchedRules(filter || {},r=>resolve(chrome.runtime.lastError?{error:chrome.runtime.lastError.message}:r)));
globalThis.identity = async()=>({self:await chrome.management.getSelf(), permissions:await chrome.permissions.getAll(),debugType:typeof chrome.declarativeNetRequest.onRuleMatchedDebug,testType:typeof chrome.declarativeNetRequest.testMatchOutcome,quota:chrome.declarativeNetRequest.MAX_GETMATCHEDRULES_CALLS_PER_INTERVAL,interval:chrome.declarativeNetRequest.GETMATCHEDRULES_QUOTA_INTERVAL});
```

`chrome.permissions.getAll()` returned only `webRequest`, `declarativeNetRequest`, `declarativeNetRequestFeedback`, and origin `http://127.0.0.1/*`. The profile's active permissions agreed. No `webRequestBlocking`, `debugger`, `activeTab`, `tabs` or `management` permission was declared. `management.getSelf` and host-visible tab queries were used without adding those broad permissions.

A Node HTTP server listened only on `127.0.0.1:35311`. `/page`, `/page2` and `/navigated` served a minimal HTML document. `/echo/<case>` recorded URL/headers and returned them as JSON with HTTP 200 and `Cache-Control:no-store`. Page-origin `fetch` calls made genuine same-origin GETs; only the same-value case supplied an initial custom header. `/echo/fail` recorded the request and destroyed the socket without a response. No Overidify extension was loaded.

The runner installed session rules through `updateSessionRules`, awaited each acknowledgement, then performed the indicated requests. All rules used `modifyHeaders` with request-header `set` operations. Conditions had `resourceTypes:["xmlhttprequest"]`, the specified `tabIds`, and `regexFilter` of the form `^http://127[.]0[.]0[.]1:35311/echo/<case>(?:[?]|$)`. Priorities were independent of IDs. The original tab was `1059483032`; the second was `1059483033`.

| Rule ID | Case | Priority | Tab | Configured header operations |
| --- | --- | --- | --- | --- |
| 101 | repeat | 1 | first | `X-Header=A` |
| 201 | switch | 1 | first | `X-Switch=selected-B`, `X-Extra=extra-B` |
| 301 | same | 1 | first | `X-Same=same` |
| 401 | suppressed | 1 | first | `X-Overlap=low` |
| 402 | suppressed | 2 | first | `X-Overlap=high` |
| 501 | partial | 1 | first | `X-Overlap=low`, `X-Unique=low-only` |
| 502 | partial | 2 | first | `X-Overlap=high` |
| 601 | edit | 1 | first | `X-Version=v1` |
| 602 | edit | 1 | first | `X-Version=v2`, installed atomically while removing 601 |
| 701 | tab | 1 | first | `X-Tab=first` |
| 702 | tab | 1 | second | `X-Tab=second` |
| 801 | fail | 1 | first | `X-Failure=configured` |

IDs 101 through 601 were installed first. After seven fetches, the first filtered history query ran. Rule 601 was replaced by 602 and another fetch/query followed. Then 701/702 were installed and each tab fetched once. The first tab navigated to `/navigated`; filtered, `-1`, and unfiltered queries followed. Rule 801 was installed for the final failing fetch. A worker-side `snapshots` object retained a full original rule object, source kind and selected Switch option label for each installed version. The acknowledged addition of 602 added a new mapping without overwriting 601. This validates the fixture's mapping concept, not durable application installation/recovery logic.

### Measured scenarios

The table shows only fixture headers. `absent` means absent from the captured `requestHeaders` array for those names. Header names were compared case-insensitively. Each listed before/sent pair shares the stated **webRequest** request ID. History records do not contain that ID. Controlled distinct rule IDs, exact URL conditions, isolated sequential requests and query counts establish these scenario results; no nearby-time join was used to attach a history record to a webRequest record. The two occurrences of rule 101 remain two identity-free history entries, not individually request-linked rows.

| Scenario | Before / sent / actual server receipt | Browser history evidence | Result |
| --- | --- | --- | --- |
| Header, two GETs to `/echo/repeat?i=1` and `?i=2` | Request IDs `4`,`5`; `X-Header` absent / `A` / `A` on each | Two entries for 101, timestamps `1793773954073.713` and `1793773954077.405` | PASS, repeated occurrences preserved |
| Switch-equivalent selected header set | ID `6`; both absent / `selected-B`,`extra-B` / same values | One entry for 201, `1793773954083.389` | PASS, one action with two accepted header operations |
| Same-value set | ID `7`; `X-Same=same` / `same` / `same` | One entry for 301, `1793773954086.785` | PASS, contribution despite zero observed value diff |
| Lower setter fully suppressed | ID `8`; `X-Overlap` absent / `high` / `high` | 402 at `1793773954090.028`; zero entries for 401 | PASS, no row supported for the fully suppressed rule |
| Lower setter partially contributes | ID `9`; both absent / `X-Overlap=high`, `X-Unique=low-only` / same values | 502 at `1793773954093.223` and 501 at `1793773954093.236` | PASS, both actions reported, not every configured write applied |
| Edited immutable version | IDs `10`,`11`; `X-Version` absent / `v1` then `v2` / same values | Removed 601 retained at `1793773954098.496`; new 602 added at `1793773954105.571` | PASS, old occurrence retains original mapping |
| Per-tab identity | IDs `14`,`15`; `X-Tab` absent / `first` or `second` / same values | 701 on tab `1059483032` at `1793773954168.375`; 702 on `1059483033` at `1793773954172.111` | PASS for two separately scoped rules |
| Same-origin document navigation | First tab navigated without rule changes | First-tab query became empty. `tabId:-1` returned its 10 prior occurrences with unchanged IDs/timestamps, including removed 601. Unfiltered query also retained 702 on the second tab | PASS for immediate recovery; frozen 701 mapping recovers original tab without guessing |
| Transport failure after headers | ID `18`; `X-Failure` absent / `configured`; server recorded it, fetch rejected `Failed to fetch`, webRequest error `net::ERR_EMPTY_RESPONSE` | One entry for 801 at `1793773954197.877`, with no error/outcome field | PASS for distinct contribution and request failure evidence; no rule-failure conclusion |

The initial filtered query returned IDs `[101,101,201,301,402,502,501,601]`, all ruleset `_session` on the original tab. The post-edit query added 602 without losing 601. Before navigation the unfiltered count was 11, comprising 10 on the first tab and one on the second. Immediately after navigation, `-1` returned those 10 and the unfiltered query still returned 11. After the failing fetch, the total was 12. Payload fields were exactly `rule:{ruleId,rulesetId}`, `tabId`, `timeStamp`; there was no URL, request ID, method, status, header set or failure field.

The failing fetch produced **three server receipts**, all with `X-Failure=configured`, while the observer exposed one before/sent pair and one error under request ID `18`, and match history exposed one 801 occurrence. This experiment did not identify individual transport attempts. Server receipt count, webRequest request count and browser-reported rule occurrences are different quantities. A match record alone proves neither a response nor a changed byte, and a transport failure does not mean DNR failed.

### Actual quota result

The fixture exposed constants `MAX_GETMATCHEDRULES_CALLS_PER_INTERVAL=20` and `GETMATCHEDRULES_QUOTA_INTERVAL=10`. In the same fresh-profile extension session, all 20 non-gesture queries succeeded. Query 21 returned the actual `runtime.lastError` text:

```text
This request exceeds the MAX_GETMATCHEDRULES_CALLS_PER_INTERVAL quota.
```

The first eight queries covered baseline/scenarios/history/navigation/failure; the final 13 repeated unfiltered calls until the first rejection. The sequence completed within the short run, without a ten-minute wait. No quota settings, clocks, Chromium internals or gesture exemptions were changed. This verifies the immediate production quota rejection in this packed installation. Quota replenishment after ten minutes and gesture-exempt calls were not exercised. The official reference documents 20 calls per ten minutes and the user-gesture exemption. [Quota contract][D1].

Practical implication: ordinary polling must share this extension-wide budget. Spending every call evenly permits about one call per 30 seconds with no reserve; a longer interval such as the earlier 35-second hypothesis leaves some reserve but remains untested as a sustained scheduler. Confirmation will be delayed, and a burst exhausts queries until allowance returns. A click does not authorize continuous gesture-exempt polling. The fast explicit queries here measured availability after completed requests, not a production delivery-latency bound.

### Remaining release and integration gates

- **UNVERIFIED:** an actual Store-signed/Store-installed release, Store review acceptance, Windows/macOS, and minimum supported Chrome 119. This result is packed Linux stable sideload evidence only.
- **UNVERIFIED:** denied feedback permission, activeTab-only activation, withheld host access, a second competing extension, sensitive headers such as Authorization, HTTPS, redirects/authentication, frames/workers/cache, BFCache/cross-origin navigation/tab close, and histories polled after the five-minute unknown-tab lifetime. The short normal navigation result does not establish those cases.
- **UNVERIFIED:** equal-timestamp duplicate accounting. These recorded occurrences had distinct timestamps; the experiment did not manipulate the clock to manufacture a tie. A tuple Set or incremented timestamp cursor still has no completeness guarantee.
- **UNVERIFIED:** persistent snapshot recovery after worker/browser restarts, rapid edits/in-flight version races, failed atomic updates, ID reuse/exhaustion, concurrent installation writers, and session/regex-capacity scaling. The fixture retained mappings in memory while its worker was attached.
- **UNVERIFIED:** production DevTools lifetime across panels/navigation, Pause/Resume without backfill, Clear/in-flight semantics, 50 MiB eviction/body handling, pinned selection, memory/performance, and Network direct-branch reporting. These require later authorized application work; they were not implemented by this spike.

The selected method passes the packed API/contribution/history concept checks above. It remains a delayed, best-effort evidence stream with incomplete request identity and failure information. Admit recovered browser occurrences, retain immutable source snapshots, and leave request fields `Not captured` when association is ambiguous. Do not derive failures or request identity solely from match timestamps. Store release and the unresolved completeness boundaries remain pending.

### Audit and cleanup

The retained manifest/worker, rule table, launch/install details, observed tuples, request-stage evidence, permission identity and literal quota error above replace the temporary artifacts. SHA-256 values from the measured run were:

```text
fixture/manifest.json  383075713db3c941525069a266ffe64c49b9da13ac7fdb3b7250854cfb79d09a
fixture/worker.js      a2667b1689f6557e8a9fa7a109af7457c790a98f79fab1307f08b4f7b40e9312
fixture.crx            9a1921810549800f00ab37fd7477b4630dbd66f1e2afd8f04b3a124e26e9ed74
probe.cjs              ce79515a5b6a73feeff88412ccd0a9f933d80bc11c3bf7e340e9c299eb079e21
results.json           91668a8fa36d5f941409b8838d9766be41f68f6897534441edeecf72a86741fa
```

No retained regression test or CI probe was added. The only retained edit from this spike is this report. Application source, manifest, dependencies, tests, installed skills, existing spec/selection note and other pre-existing workspace edits were preserved. No commits, pushes, PRs, GitHub connectors, user-profile changes or global-policy writes were made.

The one-time verification passed the packed CRX3/install checks, all recorded scenario counts, before/sent pairing, same-value and failure evidence, and preservation of the complete earlier report and parent selection note. Both `git diff --no-index --check` against the saved pre-spike report and `git diff --check` reported no whitespace errors. No task browser or Node process remained. After recording this evidence, the entire gitignored `.scratch/verification/execution-packed-probe/` directory was removed, including fixture source, private key/CRX, copied Chrome, profiles, downloaded source, scripts and logs. The directory-absence check passed.

## Primary sources

Local source links refer to the inspected checkout; external code links are pinned. Official web references are live documents checked on the research date.

[L1]: ../../src/lib/dnr.ts
[L2]: ../../src/network/interceptor.ts
[L3]: ../../src/lib/request-header-rules.ts
[L4]: ../../src/lib/pattern.ts
[L5]: ../../src/background/index.ts
[L6]: ../../src/network/bridge.ts
[L7]: ../../src/network/page.ts
[L8]: ../../manifest.config.ts
[L9]: ../../src/devtools/register.ts
[L10]: ../../src/lib/devtools-requests.ts
[C1]: https://github.com/chromium/chromium/blob/e4d1dc1e70c6f0f321b17b8032fd213d797f049b/extensions/browser/api/declarative_net_request/action_tracker.cc
[C2]: https://github.com/chromium/chromium/blob/e4d1dc1e70c6f0f321b17b8032fd213d797f049b/chrome/browser/extensions/api/declarative_net_request/action_tracker_unittest.cc#L189
[C3]: https://github.com/chromium/chromium/blob/e4d1dc1e70c6f0f321b17b8032fd213d797f049b/extensions/common/api/_permission_features.json#L212
[C4]: https://github.com/chromium/chromium/blob/e4d1dc1e70c6f0f321b17b8032fd213d797f049b/extensions/common/api/_api_features.json#L167
[C5]: https://github.com/chromium/chromium/blob/e4d1dc1e70c6f0f321b17b8032fd213d797f049b/extensions/browser/api/web_request/web_request_api_helpers.cc#L363
[C6]: https://github.com/chromium/chromium/blob/e4d1dc1e70c6f0f321b17b8032fd213d797f049b/extensions/browser/api/declarative_net_request/README.md#interaction-with-webrequest-api
[C7]: https://github.com/chromium/chromium/blob/e4d1dc1e70c6f0f321b17b8032fd213d797f049b/extensions/browser/api/declarative_net_request/declarative_net_request_api.cc#L538
[C8]: https://github.com/chromium/chromium/blob/e4d1dc1e70c6f0f321b17b8032fd213d797f049b/chrome/browser/extensions/api/declarative_net_request/declarative_net_request_browsertest.cc#L4880
[C9]: https://github.com/chromium/chromium/blob/e4d1dc1e70c6f0f321b17b8032fd213d797f049b/extensions/common/api/declarative_net_request.webidl
[C10]: https://github.com/chromium/chromium/blob/e4d1dc1e70c6f0f321b17b8032fd213d797f049b/extensions/common/api/web_request.json
[C11]: https://github.com/chromium/chromium/blob/e4d1dc1e70c6f0f321b17b8032fd213d797f049b/extensions/browser/api/web_request/extension_web_request_event_router.cc#L3259
[C12]: https://github.com/chromium/chromium/blob/e4d1dc1e70c6f0f321b17b8032fd213d797f049b/extensions/browser/api/declarative_net_request/ruleset_manager.cc#L448
[C13]: https://github.com/chromium/chromium/blob/e4d1dc1e70c6f0f321b17b8032fd213d797f049b/extensions/common/permissions/permissions_data.cc#L363
[C14]: https://github.com/chromium/chromium/blob/e4d1dc1e70c6f0f321b17b8032fd213d797f049b/extensions/browser/api/declarative_net_request/action_tracker.h#L38
[C16]: https://github.com/chromium/chromium/blob/e4d1dc1e70c6f0f321b17b8032fd213d797f049b/chrome/browser/extensions/api/debugger/debugger_api.cc#L1356
[C17]: https://github.com/chromium/chromium/blob/e4d1dc1e70c6f0f321b17b8032fd213d797f049b/content/browser/devtools/devtools_agent_host_impl.cc#L311
[C18]: https://github.com/ChromeDevTools/devtools-protocol/blob/145efd73b25c9078cb6c9aaa25330a8bfbe42327/index.html#L108
[C19]: https://github.com/ChromeDevTools/devtools-protocol/blob/2e90ef3c4f25836c84b0306b51dec8d3f3d0e6d9/json/browser_protocol.json
[C15]: https://github.com/chromium/chromium/blob/e4d1dc1e70c6f0f321b17b8032fd213d797f049b/extensions/browser/api/declarative_net_request/rules_monitor_service.cc#L1267
[R1]: https://github.com/requestly/interceptor/blob/3ba50dcd96be7f0d82b10c2aa41d646a717cd968/browser-extension/mv3/src/service-worker/services/webRequestInterceptor.ts
[R2]: https://github.com/requestly/interceptor/blob/3ba50dcd96be7f0d82b10c2aa41d646a717cd968/browser-extension/mv3/src/common/ruleMatcher.ts
[R3]: https://github.com/requestly/interceptor/blob/3ba50dcd96be7f0d82b10c2aa41d646a717cd968/browser-extension/mv3/src/service-worker/services/ruleExecutionHandler.ts
[R4]: https://github.com/requestly/interceptor/blob/3ba50dcd96be7f0d82b10c2aa41d646a717cd968/browser-extension/mv3/src/service-worker/services/devtools.ts
[R5]: https://github.com/requestly/interceptor/blob/3ba50dcd96be7f0d82b10c2aa41d646a717cd968/browser-extension/common/src/devtools/containers/executions/ExecutionsContainer.tsx
[R6]: https://github.com/requestly/interceptor/blob/3ba50dcd96be7f0d82b10c2aa41d646a717cd968/browser-extension/common/src/devtools/containers/executions/columns.tsx
[R7]: https://github.com/requestly/interceptor/blob/3ba50dcd96be7f0d82b10c2aa41d646a717cd968/browser-extension/common/src/devtools/containers/executions/details-tabs/ExecutionDetails.tsx
[R8]: https://github.com/requestly/interceptor/blob/3ba50dcd96be7f0d82b10c2aa41d646a717cd968/app/src/modules/extension/mv3RuleParser/parseHeadersRule.ts
[R9]: https://github.com/requestly/interceptor/blob/3ba50dcd96be7f0d82b10c2aa41d646a717cd968/browser-extension/mv3/src/service-worker/services/rulesManager.ts
[R10]: https://github.com/requestly/interceptor/blob/3ba50dcd96be7f0d82b10c2aa41d646a717cd968/browser-extension/mv3/src/rulesStorageService.ts
[R11]: https://chromewebstore.google.com/detail/requestly-intercept-modif/mdnleldcmiljblolnjhpnblkcekpdkpa?hl=en-GB
[R12]: https://github.com/requestly/interceptor/commit/3ba50dcd96be7f0d82b10c2aa41d646a717cd968
[D1]: https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest#method-getMatchedRules
[D2]: https://developer.chrome.com/docs/extensions/reference/api/webRequest
[D3]: https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
[D4]: https://developer.chrome.com/docs/extensions/reference/api/devtools/network
[D5]: https://developer.chrome.com/docs/extensions/reference/api/debugger#event-onDetach
[D6]: https://developer.chrome.com/docs/extensions/reference/api/devtools/inspectedWindow
[D7]: https://chromedevtools.github.io/devtools-protocol/index.html
[D8]: https://developer.chrome.com/blog/remote-debugging-port
[D9]: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
[D10]: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts#work_in_isolated_worlds
[D11]: https://fetch.spec.whatwg.org/#forbidden-request-header
[D12]: https://developer.chrome.com/docs/extensions/reference/api/proxy
[D13]: https://docs.mitmproxy.org/stable/concepts/certificates/
[D14]: https://w3c.github.io/ServiceWorker/#register-algorithm
[D15]: https://developer.chrome.com/docs/extensions/how-to/devtools/extend-devtools
[D16]: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
[D17]: https://developer.chrome.com/blog/new-in-devtools-63#multi-client
[D18]: https://chromedevtools.github.io/devtools-protocol/tot/Network/
[P1]: https://developer.chrome.com/docs/webstore/program-policies/permissions
[P2]: https://developer.chrome.com/docs/webstore/program-policies/privacy
[P3]: https://developer.chrome.com/docs/webstore/program-policies/limited-use

[D19]: https://developer.chrome.com/docs/extensions/how-to/distribute/install-extensions
[C20]: https://github.com/chromium/chromium/blob/154.0.8037.97/chrome/browser/extensions/external_provider_impl.cc
[C21]: https://github.com/chromium/chromium/blob/154.0.8037.97/chrome/common/chrome_paths.cc
[C22]: https://github.com/chromium/chromium/blob/154.0.8037.97/extensions/common/mojom/manifest.mojom
