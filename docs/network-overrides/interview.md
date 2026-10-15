# Network Overrides design interview

Status: interview complete. After checking Requestly and clarifying its Network panel limitation, the user accepted extension-only page interception. Implementation can proceed.

Run the interview in rounds with at most eight questions each. Give each question an answer field, a Recommended button, and an Explain button. Include option buttons only for multiple-choice questions. A recommendation becomes a decision only after the user sends their answers in chat.

Submit copies all questions and answers for the current round. The user pastes the copied text into chat. This supersedes the previous request to fill and send the T3 composer.

## Confirmed decisions

- Add a separate tab named Network Overrides. See [ADR 0001](adr/0001-network-overrides-tab.md).
- Rules and Switchers must retain identical URL matching logic, as required by the root AGENTS.md.
- First version scope and response controls are accepted in [ADR 0002](adr/0002-mock-response-scope.md).
- Website scope, query comparison, and server mode behavior are accepted in [ADR 0003](adr/0003-matching-and-server-modes.md).
- Editor defaults, shared page-domain matching, priority, and popup behavior are accepted in [ADR 0004](adr/0004-editor-and-activation.md).
- Activation, optional method defaults, in-flight behavior, and compatibility requirements are accepted in [ADR 0005](adr/0005-live-updates-and-compatibility.md).
- Native DevTools Network response visibility is accepted in [ADR 0006](adr/0006-native-network-response-visibility.md).
- ADR 0006 is superseded by [ADR 0007](adr/0007-extension-only-page-interception.md). The accepted approach delivers the mock to the page, keeps DevTools usable, and requires no extra setup.

## Round 1: Scope and response behavior

Completed. The user's submitted answers are:

1. Mock responses.
2. GET `https://backendapi-qa.topfan.dev/api/get-chatGroups-and-users?tab=featured&counts=true`.
3. Type or paste in an editor.
4. Edit response body, status code, and headers.
5. Exact request URL with an optional HTTP method.
6. Let each override choose whether to bypass the server or call it and replace its response.

The example's website URL was not supplied. The user clarified in Round 2 that the response is whatever the user enters; a fixed example response is not required.

## Round 2: Matching and server modes

The user's submitted answers are:

1. Requested more explanation of the website URL. Clarification is carried into Round 3.
2. All tabs on configured website domains.
3. Whatever the user types or enters. The response is user-configured, with no fixed response fixture required.
4. Ignore query parameter order, but require the same parameters and values.
5. Bypass the server by default.
6. Replace the whole response with the configured mock in call-server mode.
7. Preserve the original network failure when no response exists.
8. API calls made with fetch or XMLHttpRequest.

The website URL means the browser address-bar URL of the page making the request, not the backend API URL. It illustrates page domain scope but is not required to design a general-purpose editor.

## Round 3: Editor and activation

Completed. The user's submitted answers are:

1. Match the page URL in the same way as Rules and Switchers. This resolves the scope requirement; no particular frontend URL is required.
2. Warn about invalid JSON, but allow saving and returning the entered text.
3. Start with status 200, editable by the user.
4. Start with Content-Type: application/json, editable by the user.
5. Enabled by default, with an editor toggle before saving.
6. The later entry in the list wins.
7. Show overrides matching the current website in the popup, with enable toggles.
8. Cover page and iframe fetch/XHR calls. Worker-originated calls can wait.

## Round 4: Activation and compatibility

Completed. The user's submitted answers are:

1. Start with GET; the user can choose another method or Any.
2. Apply changes live when possible; clearly indicate when reload is needed.
3. Complete an in-progress call-server request using the override settings captured when it started.
4. Apply matching header Rules and Switchers to the real request as usual.
5. Overrides must keep working while Chrome DevTools is open.

## Questions to resolve after scope

Resolve browser constraints and observable interception failures through implementation research. Use existing local persistence for saved configuration, including enabled state, unless the user changes that convention. Existing storage and list conventions should guide routine choices without asking questions already answered by the repository. The [feature specification](spec.md) consolidates the accepted behavior.

The [interception feasibility review](../research/network-overrides-interception.md) includes the bounded direct-CDP test and the limits of extension-only approaches. Page-level wrapping does not satisfy the accepted native Network requirement. The tested direct-CDP setup was rejected in Round 6 because of friction.

## Round 5: DevTools response visibility

Is changing the response received by page fetch/XHR enough, or must the mocked status, headers, and body also appear in the Chrome DevTools Network panel?

Answer: The mocked status, headers, and body must also appear in the Chrome DevTools Network panel while overrides remain active.

This excludes a page-only fetch/XHR wrapper as the complete implementation. The requirement remains accepted while researching browser-level alternatives; do not silently substitute an extension's custom network panel.

## Round 6: Setup and deployment

Which setup is acceptable to support the mocked native Network response?

- A local helper plus a dedicated debugging Chrome profile. Recommended based on the bounded passing CDP test.
- A local HTTPS proxy helper for the usual browser profile, with proxy and certificate setup. A candidate requiring a separate feasibility test.
- Keep installation extension-only. No complete approach meeting every accepted requirement has been established; research or revised constraints would be needed.

Answer: The local helper and separate Chrome profile are unacceptable because they create too much friction.

Do not proceed with that deployment. A proxy plus certificate setup should not be treated as an accepted substitute. The next proposal should favor the existing extension installation and usual browser profile. Native Network response visibility remains accepted until the user explicitly changes it.

## Remaining tradeoff

Resolved after the Requestly comparison. The user accepted page-level mocking and its native Network panel limitation.

## Requestly comparison

The user requested checking Requestly's implementation before revisiting the tradeoff. Requestly's [current troubleshooting documentation](https://interceptor-docs.requestly.com/troubleshoot/http-rules/rule-changes-not-reflecting-in-chrome-devtools) explicitly says response modifications reach the page while Chrome's native Network panel displays the original response. Its [desktop browser setup](https://interceptor-docs.requestly.com/interceptor/desktop-app/browser-interception) uses a separate proxy application and certificate setup, with an extension connection available for an existing browser profile.

This is evidence about Requestly, not acceptance of a reduced Network Overrides requirement. Preserve the user's accepted constraints until they make a new decision.

The [Requestly source review](../research/requestly-response-overrides.md) confirms page-level fetch/XHR replacement in its Chrome extension at a pinned commit. Do not copy Requestly's real-fetch failure fallback or header inheritance into Overidify: accepted call-server behavior preserves transport failures and replaces the entire configured response.

After the explanation that Requestly uses the same extension-only approach without extra setup, the user answered "ok i am convinced". This accepts the approach and the Network panel limitation; see ADR 0007.

## Workflow availability

The installed grill-with-docs skill references `/grilling` and `/domain-modeling`. Neither dependency was found in the local skill directories. These documents capture decisions and terminology explicitly. The user's rounds of at most eight questions supersede the available grill-me skill's one-question format.

## Technical references

- [Chrome declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest) supports blocking, redirecting, and modifying headers. Response-body mocking requires separate investigation.
- [Chrome debugger](https://developer.chrome.com/docs/extensions/reference/api/debugger) supports protocol-based interception, but its DevTools detachment behavior conflicts with the accepted compatibility requirement. No API or permission change has been implemented.
- [Chrome debugger onDetach](https://developer.chrome.com/docs/extensions/reference/api/debugger#event-onDetach) documents session termination when Chrome DevTools opens. DevTools compatibility therefore needs an explicit requirement before selecting an interception approach.
- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) and [Chrome scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting) describe page execution contexts and script injection. These are candidates for page-level fetch/XHR interception. Worker-originated calls are deferred by Round 3.
