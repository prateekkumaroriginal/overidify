import { defineManifest } from '@crxjs/vite-plugin'
import type { getBuildIdentity } from './build/identity.ts'

export function createManifest(identity: ReturnType<typeof getBuildIdentity>) {
  const icons = {
    16: `${identity.iconRoot}/icon-16.png`,
    32: `${identity.iconRoot}/icon-32.png`,
    48: `${identity.iconRoot}/icon-48.png`,
    128: `${identity.iconRoot}/icon-128.png`,
  }

  return defineManifest({
    manifest_version: 3,
    name: identity.worktree ? 'Overidify Dev' : identity.name,
    version: '0.6.0',
    minimum_chrome_version: '119',
    description: 'Override request headers and mock API responses with website-scoped rules.',
    icons,
    permissions: ['storage', 'tabs', 'webNavigation', 'declarativeNetRequest', 'declarativeNetRequestWithHostAccess', 'declarativeNetRequestFeedback', 'webRequest', 'offscreen'],
    host_permissions: ['<all_urls>'],
    devtools_page: 'devtools.html',
    action: {
      default_icon: icons,
      default_title: identity.name,
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
}
