<picture>
  <source media="(prefers-color-scheme: dark)" srcset="icons/dark/icon-128.png" />
  <img src="icons/light/icon-128.png" width="64" height="64" alt="" />
</picture>

# Overidify

Overidify is a Chrome extension for changing request headers and mocking API responses. Use it to switch between test accounts, try different API responses, or work on your frontend before an endpoint is ready.

## Install

Requires Chrome 119 or newer.

- [Stable ZIP, v0.2.1](https://github.com/prateekkumaroriginal/overidify/releases/download/v0.2.1/overidify-v0.2.1.zip) is the versioned release.
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

For example, to add a token to requests from your local app:

1. Under **Header Rules**, click **New Header Rule** and give it a name.
2. Set **Domain** to `localhost:4200`.
3. Add a header named `Authorization` with the value `Bearer your-test-token`.
4. Click **Save**, then make a request from your app at `http://localhost:4200`.

The domain identifies the website in your address bar. Requests from that website receive the header even when they call another host, such as `https://api.example.com`.

Open the extension popup on a website to toggle matching rules or choose a Switch Rule option. Your rules are saved locally in your browser.

## Things to know

- Network Rules use **Bypass server** by default, which returns your mock without calling the API. **Call server, then replace response** makes the real request first.
- API mocking covers page and iframe `fetch` and `XMLHttpRequest` calls. Workers, page navigations, and asset requests are outside its scope.
- DevTools can stay open. Its Network panel shows real network traffic, so it can show the server's response while your app receives the mock.
- Saved changes affect subsequent requests. After updating or reloading the extension, reload website tabs. Also reload when Overidify asks you to.

See [rule matching and behavior](docs/rule-behavior.md) for domain patterns, priorities, and detailed response behavior.
