import { crx } from '@crxjs/vite-plugin'
import type { CrxPlugin } from '@crxjs/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { build, defineConfig } from 'vite'

import { createManifest } from './manifest.config'
import { getBuildIdentity } from './build/identity.ts'
import { favicon } from './scripts/favicon'

// MAIN-world interception must install synchronously at document_start.
// A shared-chunk import loader can miss the page's first inline API calls,
// and importing an extension module can also be blocked by the page's CSP.
function networkPageBundle(): CrxPlugin {
  return {
    name: 'overidify-network-page-bundle',
    enforce: 'post',
    apply: 'build',
    async renderCrxManifest(outputManifest) {
      const result = await build({
        configFile: false, publicDir: false, logLevel: 'error',
        build: {
          write: false, target: 'chrome119',
          lib: { entry: fileURLToPath(new URL('./src/network/page.ts', import.meta.url)), formats: ['iife'], name: 'OveridifyNetwork' },
        },
      })
      const outputs = Array.isArray(result) ? result : [result]
      const chunk = outputs.flatMap(output => 'output' in output ? output.output : []).find(file => file.type === 'chunk')
      if (!chunk || chunk.type !== 'chunk') throw new Error('Network interceptor bundle was not generated.')
      this.emitFile({ type: 'asset', fileName: 'network-page.js', source: chunk.code })
      for (const script of outputManifest.content_scripts ?? []) {
        if (script.world === 'MAIN') script.js = ['network-page.js']
      }
      return outputManifest
    },
  }
}

export default defineConfig(({ mode }) => {
  const identity = getBuildIdentity(mode, fileURLToPath(new URL('.', import.meta.url)))
  return {
    define: { __OVERIDIFY_BUILD__: JSON.stringify(identity) },
    build: {
      rollupOptions: { input: {
        offscreen: fileURLToPath(new URL('./offscreen.html', import.meta.url)),
        devtoolsPanel: fileURLToPath(new URL('./devtools-panel.html', import.meta.url)),
      } },
    },
    plugins: [
      react(), tailwindcss(),
      {
        name: 'overidify-build-identity',
        transformIndexHtml: {
          order: 'pre',
          handler(html) {
            if (!identity.worktree) return html
            const title = identity.name.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
            return html.replaceAll('/icons/', `/${identity.iconRoot}/`).replace('<title>Overidify', () => `<title>${title}`)
          },
        },
      },
      crx({ manifest: createManifest(identity) }), networkPageBundle(), favicon(identity.iconRoot),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@build-icons': fileURLToPath(new URL(`./${identity.iconRoot}`, import.meta.url)),
      },
    },
  }
})
