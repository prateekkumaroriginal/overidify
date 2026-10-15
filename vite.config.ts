import { crx } from '@crxjs/vite-plugin'
import type { CrxPlugin } from '@crxjs/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { build, defineConfig } from 'vite'

import manifest from './manifest.config'

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

export default defineConfig({
  plugins: [react(), tailwindcss(), crx({ manifest }), networkPageBundle()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
