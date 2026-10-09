import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Overidify',
  version: '0.1.0',
  description: 'Override request headers with ordered browser-wide rules.',
  permissions: ['storage', 'tabs', 'webNavigation', 'declarativeNetRequest', 'declarativeNetRequestWithHostAccess'],
  host_permissions: ['<all_urls>'],
  action: {
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
})
