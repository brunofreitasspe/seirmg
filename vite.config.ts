import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

export default defineConfig({
  build: {
    rollupOptions: {
      // `src/dashboard/index.html` is only referenced inside the manifest's
      // `web_accessible_resources` (a list of URL patterns @crxjs/vite-plugin
      // does not scan for HTML entry points) — unlike `action.default_popup`
      // and `options_ui.page`, which the plugin does recognize and bundle
      // automatically. Without this explicit entry, the file is copied to
      // dist/ verbatim (raw `./main.ts`/`./style.css` references, unprocessed)
      // instead of being built like the popup/options pages.
      input: {
        dashboard: 'src/dashboard/index.html',
      },
    },
  },
  resolve: {
    alias: {
      // hunspell-asm's ESM build (dist/esm/loadModule.js) does
      // `import * as runtime from './lib/node/hunspell'` on a module that's plain
      // CommonJS (`module.exports = Module`) — a namespace import of a CJS module is
      // never callable per spec, so the wasm runtime factory ends up non-callable
      // ("X is not a function") when Vite picks this package's ESM entry (its default
      // preference). The CJS build uses a plain `require(...)`, which resolves
      // correctly; forcing that entry here sidesteps the upstream bug.
      'hunspell-asm': 'hunspell-asm/dist/cjs/index.js',
    },
  },
  plugins: [
    crx({
      manifest,
      contentScripts: {
        standaloneFiles: ['src/content-scripts/documento_editar/pontePrincipalMain.ts'],
      },
    }),
  ],
})
