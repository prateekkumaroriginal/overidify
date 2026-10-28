<picture>
  <source media="(prefers-color-scheme: dark)" srcset="icons/dark/icon-128.png" />
  <img src="icons/light/icon-128.png" width="64" height="64" alt="" />
</picture>

# Overidify

Overidify is a Chrome extension for changing request headers and mocking API responses. Use it to switch between test accounts, try different API responses, or work on your frontend before an endpoint is ready.

## Install

Requires Chrome 119 or newer.

- [Stable ZIP, v0.5.1](https://github.com/prateekkumaroriginal/overidify/releases/download/v0.5.1/overidify-v0.5.1.zip) is the versioned release.
- [Nightly ZIP](https://github.com/prateekkumaroriginal/overidify/releases/download/nightly/overidify-nightly.zip) contains the latest changes from `main` that pass CI.

1. Download a ZIP and extract it into a folder you'll keep.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the extracted folder containing `manifest.json`.
4. Reload the website tabs where you want to use Overidify.

Keep the extracted folder in place. Chrome loads the extension from it.

## Use it

Open Overidify from Chrome's extensions menu and click **Settings**. Choose a rule type:

- **Header Rules** add or replace request headers, such as an `Authorization` token.
- **Switch Rules** let you choose between named header sets, such as different test accounts.
- **Network Rules** match an API URL and return a response body, status, and headers you choose.

Settings opens on the **All** tab, which shows all three rule types together as wide cards on the page background. Each card keeps its toggle, name, and action icons in one header row, including on mobile. The website domain appears in a pill beside the name, and rule details sit below. Search fills the remaining width between the page title and New, with a search icon; on narrow screens it wraps below that row. Search across your rules, toggle them, choose Switch Rule options, or click a card to edit it. Card backgrounds lighten on hover. Click **+ New** to choose which type of rule to create.

**Duplicate**, **Export**, and **Delete** icons appear at the top right on card hover or keyboard focus. Duplicate saves a disabled copy immediately after the original, preserving its settings and Switch Rule options. Use **Edit** in the confirmation toast to open the copy. Select mode hides these icons and puts a checkbox at the far left. Clicking the card toggles its selection, while toggles and option dropdowns are inactive. Press Escape to cancel selection. Use the bulk toolbar to export or delete selected rules.

For example, to add a token to requests from your local app:

1. Under **Header Rules**, click **+ New** and give it a name.
2. Set **Domain** to `localhost:4200`.
3. Add a header named `Authorization` with the value `Bearer your-test-token`.
4. Click **Save**, then make a request from your app at `http://localhost:4200`.

The domain identifies the website in your address bar. Requests from that website receive the header even when they call another host, such as `https://api.example.com`.

Open the extension popup on a website to toggle matching rules or choose a Switch Rule option. Your rules are saved locally in your browser.

To override an API response directly from DevTools:

1. Open DevTools on your website and select the **Overidify** panel. It may be under the overflow menu. After updating the extension, reopen DevTools to see it.
2. Use your app or reload the page, then select a captured API request. The list refreshes when you return to **Overidify**. Click **Refresh** to load requests already visible in **Network**.
3. Edit the captured response body or status and click **Save override**. The URL, method, response headers, rule name, and website scope are filled in automatically.
4. Trigger the request again in your app. Reload the page first if the panel asks you to.

The panel saves a Network Rule that bypasses the server. Capturing and saving do not replay requests. It supports text responses, including JSON and XML, and keeps the latest 200 API requests in memory. Cookies and transport headers are omitted from copied responses. Use **Edit all settings** after saving to change the rule's matching, headers, or server behavior.

Keep one copy of Overidify enabled. If native Network shows Fetch/XHR calls but the Overidify panel stays empty, disable older copies, close and reopen DevTools, then reload the website. Chrome 154 can hide calls from the panel when another extension copy's interceptor appears in their initiator stack.

## Import and export

On the Settings home page, **Import**, **Export**, and **Select** sit beside the rule-type tabs.

- **Export** downloads all saved rules in the current tab. On **All**, it downloads a full backup across the three types.
- **Select** reveals checkboxes. Select rules across the rule-type tabs, then export or delete the selection. Delete asks for confirmation and permanently removes every selected rule, including selections on other tabs. Select every rule across the three types for a full backup.
- Inside a saved rule, **Export** downloads that rule. Save any edits first. Switch Rules include all options and the selected option.
- A rule's **Export** icon downloads its latest saved settings directly from the list.
- **Import** opens a JSON file picker and review. Overlapping UUIDs get one **Replace** or **Add** choice. Replace updates those rules; Add keeps both as separate copies. Invalid rules can be excluded after you accept a partial import.

Files contain exact saved header values and response bodies. Enabled states are preserved on import. If activation is not confirmed after saving, use **Retry activation** without importing the file again.

## Things to know

- Network Rules use **Bypass server** by default, which returns your mock without calling the API. **Call server, then replace response** makes the real request first.
- API mocking covers page and iframe `fetch` and `XMLHttpRequest` calls. Workers, page navigations, and asset requests are outside its scope.
- DevTools can stay open. Its Network panel shows real network traffic, so it can show the server's response while your app receives the mock.
- Saved changes affect subsequent requests. After updating or reloading the extension, reload website tabs. Also reload when Overidify asks you to.

See [rule matching and behavior](docs/rule-behavior.md) for domain patterns, priorities, and detailed response behavior.
