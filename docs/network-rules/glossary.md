# Network Rules glossary

| Term | Meaning | Status |
| --- | --- | --- |
| Network Rule | Mock responses configured in the Network Rules tab, beside Header Rules and Switch Rules. | Confirmed in Round 1 |
| Header Rule | An existing entry that applies one set of request headers. | Existing behavior |
| Switch Rule | An existing entry with named header options; the selected option supplies its request headers. | Existing behavior |
| Page domain match | The shared matcher checks the website tab's host and optional port. Header Rules, Switch Rules, and Network Rules use the same page-domain matching logic. | Existing behavior extended by Round 3 |
| Request target | An outgoing request URL with an optional HTTP method. Query parameter order is ignored, but the parameters and values must match. | Confirmed in Rounds 1 and 2 |
| Mock response | A response configured through an editor, with editable body, status code, and headers. New responses start at status 200 with Content-Type: application/json. Invalid JSON warns without preventing saving. | Confirmed in Rounds 1 and 3 |
| Bypass-server mode | Return the configured mock without calling the real server for the target request. This is the default mode for new network rules. | Confirmed in Rounds 1 and 2 |
| Call-server mode | Call the real server, then replace its complete response with the configured mock. A transport failure without a response remains a failure. | Confirmed in Rounds 1 and 2 |
| Website scope | All tabs on the configured website domains. Domain scope checks the page's address-bar URL, separately from the outgoing request target. | Confirmed in Round 2 |
| Transport failure | A request fails before an HTTP response exists, such as a connection failure. This differs from an HTTP error status with a response. | Confirmed behavior in Round 2 |
| Network rule priority | The later list entry wins among enabled Network Rules matching a request. | Confirmed in Round 3 |
| Worker-originated call | A request initiated by worker JavaScript, rather than page or iframe JavaScript. These calls are outside version 1 scope. | Confirmed in Round 3 |
| Any method | A target matches regardless of HTTP method. New network rules start with GET rather than Any. | Confirmed in Round 4 |
| Request snapshot | The network rule settings captured when a matching request starts. In-progress call-server requests keep this configuration despite later edits. | Confirmed in Round 4 |
| Live update | Saved edits or toggles affect subsequent requests without reloading where possible. A visible reload requirement covers cases that cannot activate live. | Confirmed in Round 4 |
| Native Network response | What Chrome DevTools' Network panel displays. It may show the original response in call-server mode; a bypassed request makes no real target call. The mock is delivered to page JavaScript. | Clarified and accepted after Requestly comparison |
