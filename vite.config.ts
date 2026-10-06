import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

// OCR (ferramentas-pdf): o tesseract.js busca worker e core (JS+WASM) no jsdelivr por padrão, e a
// CSP do MV3 proíbe código remoto -- copiamos os arquivos pra dist/tesseract/ e o código aponta
// pra lá via chrome.runtime.getURL (ver features/ferramentas-pdf/ocr.ts). Só as variantes LSTM do
// core (o OEM padrão), uma por nível de suporte a SIMD do navegador.
function copiarArquivosTesseract(): Plugin {
  const arquivos: [string, string][] = [
    ['tesseract.js/dist/worker.min.js', 'tesseract/worker.min.js'],
    ...['lstm', 'simd-lstm', 'relaxedsimd-lstm'].map((variante): [string, string] => [
      `tesseract.js-core/tesseract-core-${variante}.wasm.js`,
      `tesseract/tesseract-core-${variante}.wasm.js`,
    ]),
  ]
  return {
    name: 'seirmg-copiar-tesseract',
    apply: 'build',
    generateBundle() {
      for (const [origem, destino] of arquivos) {
        this.emitFile({ type: 'asset', fileName: destino, source: readFileSync(new URL(`./node_modules/${origem}`, import.meta.url)) })
      }
    },
  }
}

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
        ferramentasPdf: 'src/ferramentas-pdf/index.html',
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
    copiarArquivosTesseract(),
    crx({
      manifest,
      contentScripts: {
        standaloneFiles: ['src/content-scripts/documento_editar/pontePrincipalMain.ts'],
      },
    }),
  ],
})
