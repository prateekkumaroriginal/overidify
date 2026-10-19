# Rule matching and behavior

See the [README](../README.md) for installation and a first example.

## Website domains

Header Rules, Switch Rules, Network Rules, and the popup use the same website matching logic. The domain identifies the top-level website in the address bar. Requests from embedded frames use that website's scope too.

All paths on a matching website are included. A Header Rule with domain `localhost:4200` applies to requests made by `http://localhost:4200/messages`, including requests to a separate host such as `https://api.example.com`.

Domain patterns accept:

- `localhost:4200` for that host and port.
- `app.example.com` for that exact host on any port.
- `*.example.com` for subdomains, including nested subdomains. This pattern does not include the bare host `example.com`.
- `*` for all HTTP and HTTPS website tabs.

Host matching ignores case. Include a port to match only that port. A complete website URL such as `http://localhost:4200/messages` is normalized to `localhost:4200`; paths, query strings, and fragments do not narrow the website scope. URL patterns such as `*://app.example.com/*` are normalized to `app.example.com`.

## Request headers

Header Rules apply one header set. Switch Rules apply only the selected option's header set. A Switch Rule with one option has no option dropdown.

Headers apply to HTTP, HTTPS, WS, and WSS requests from matching website tabs, including requests to other API hosts and requests from embedded frames. Top-level page navigations are excluded. Header rules refresh when tabs open, navigate, or close.

Matching enabled Header Rules and Switch Rules apply together. If they set the same header, the later entry has higher priority across both types. Existing header values are replaced and missing headers are added.

## Mock responses

Create a Network Rule with a website domain, a complete API request URL, and an HTTP method. Choose **Any** to match all methods.

New Network Rules start enabled, with GET, status 200, `Content-Type: application/json`, and **Bypass server**. The response body, status, and headers are editable. If the response declares JSON, invalid JSON produces a warning but can still be saved exactly as entered.

### Request matching

The website domain decides which tabs are eligible. Within those tabs, the API request URL and method decide which calls receive the mock.

Query parameter order is ignored. Parameter names and values must match, including repeated parameters. Paths and query values are case-sensitive. For example, a rule for `https://api.example.com/chats?tab=featured&counts=true` also matches `https://api.example.com/chats?counts=true&tab=featured`. Adding or changing a parameter prevents a match.

The later enabled Network Rule wins when several match a request.

### Server behavior

**Bypass server** returns the mock without making the target API call.

**Call server, then replace response** makes the original request with any matching Header Rules and Switch Rules. For fetch and asynchronous XHR, the page receives the entire configured mock once the server's response headers arrive. The real response does not supply missing mock fields. A network failure before headers remains a failure. A failure while downloading the real body after headers does not undo the delivered mock.

Synchronous XHR waits for the real request to finish in call-server mode. It replaces a successful response and preserves native failures, including a truncated real body.

### Limits and DevTools

API mocking covers page and iframe fetch/XHR calls. Worker calls, page navigations, and asset requests are outside its scope. A synchronous XHR made before settings arrive passes through to the server; later synchronous calls can use mocks.

HEAD requests and statuses 204, 205, and 304 return no body. The editor retains your entered text. Mock response headers cannot set browser cookies.

Chrome DevTools can stay open. In call-server mode, its native Network panel shows the actual server response. Bypassed calls make no target network request to display. The page receives the mock through its fetch/XHR APIs. No companion app, proxy, or certificate setup is required.

## Applying changes

The popup shows the current website's domain and lists matching rules. It opens on **All**. Use the **Header Rules**, **Switch Rules**, and **Network Rules** tabs to filter by type. Use it to toggle rules and select Switch Rule options. Open **Settings** from the icon beside the domain to edit responses and headers, search rules, or delete entries and options.

All three rule editors place a ghost Back arrow beside the title and **Export** and **Delete rule** actions at the top right. Export requires a saved rule without unsaved changes. **Cancel** and **Save** remain below the form.

Saved edits and toggles affect subsequent requests. An in-flight request keeps the Network Rule settings captured when it started. Changing a rule does not repeat a request or update content already on the page.

The settings page and popup follow the latest saved rules. Changes from multiple open extension pages are applied in sequence, so editing one rule preserves changes to other rules made in another page.

Reload website tabs after installing, updating, or reloading the extension, and whenever the settings page or popup asks you to.

The [Network Rules specification](network-rules/spec.md) covers further technical details and implementation decisions.

## Transferring rules

Import, Export, and Select appear to the right of the rule-type tabs on the options page. Without selection mode, Export includes every saved rule in the active tab, regardless of search. Export on All produces a full backup across the three types. Select reveals list checkboxes; selections carry across the tabs and searches. In selection mode, Export (n) shows the selection count and is disabled until at least one rule is selected. Cancel clears the selection. The All checkbox selects the visible rules; checked and mixed checkboxes use violet.

Exports use Overidify JSON format version 1. They preserve saved values, enabled states, relative order, and all Switch Rule options and the selected option. Rule and option identities are UUIDs.

Import always shows a review before applying changes. Same-UUID rules count as overlaps even when unchanged. Replace updates only overlaps in their existing positions; Add keeps existing rules and gives overlapping copies new UUIDs. Other imported rules are added. New rules and copies go after existing rules in their exported relative order, so later enabled rules can take priority.

A supported file with invalid rules offers a partial import. Whole invalid rules are excluded only after the user chooses to import the valid ones. Every occurrence of a repeated rule UUID in the file is invalid. Unreadable JSON and unsupported formats import nothing. Non-JSON mock response bodies remain allowed.

Saving and activation have separate outcomes. A save failure keeps the previous saved setup. If saved rules cannot be activated immediately, the review reports that they were saved, offers Retry activation without re-importing, and reports any required website reload.

See the [import/export specification](import-export/spec.md) for the complete behavior.
