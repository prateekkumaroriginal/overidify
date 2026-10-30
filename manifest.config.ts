import { defineManifest } from '@crxjs/vite-plugin'

const icons = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
}

export default defineManifest({
  manifest_version: 3,
  name: 'Overidify',
  version: '0.5.1',
  minimum_chrome_version: '119',
  description: 'Override request headers and mock API responses with website-scoped rules.',
  icons,
  permissions: ['storage', 'tabs', 'webNavigation', 'declarativeNetRequest', 'declarativeNetRequestWithHostAccess', 'offscreen'],
  host_permissions: ['<all_urls>'],
  devtools_page: 'devtools.html',
  action: {
    default_icon: icons,
    default_title: 'Overidify',
    default_popup: 'popup.html',
  },
  options_ui: {
    page: 'options.html',
    open_in_tab: true,
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['src/network/page.ts'],
      world: 'MAIN', run_at: 'document_start', all_frames: true,
      match_about_blank: true, ...{ match_origin_as_fallback: true },
    },
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['src/network/bridge.ts', 'src/icon-theme/main.ts'],
      run_at: 'document_start', all_frames: true,
      match_about_blank: true, ...{ match_origin_as_fallback: true },
    },
  ],
})
