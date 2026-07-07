import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

export default defineManifest({
  manifest_version: 3,
  name: 'SEIRMG',
  description: 'Extensão unificada para o Sistema Eletrônico de Informações (SEI)',
  version: pkg.version,
  icons: {
    16: 'src/assets/icons/icon-16.png',
    32: 'src/assets/icons/icon-32.png',
    48: 'src/assets/icons/icon-48.png',
    128: 'src/assets/icons/icon-128.png',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: {
      16: 'src/assets/icons/icon-16.png',
      32: 'src/assets/icons/icon-32.png',
    },
  },
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },
  permissions: ['storage', 'notifications', 'alarms', 'tabs'],
  host_permissions: [
    '*://*.br/*controlador.php?acao=*',
    '*://*.org/*controlador.php?acao=*',
  ],
  content_scripts: [
    {
      matches: [
        '*://*.br/*controlador.php?acao=*',
        '*://*.org/*controlador.php?acao=*',
      ],
      js: ['src/content-scripts/core/index.ts'],
      run_at: 'document_idle',
    },
    {
      matches: [
        '*://*.br/*controlador.php?acao=*',
        '*://*.org/*controlador.php?acao=*',
      ],
      js: ['src/content-scripts/tema/index.ts'],
      css: ['src/content-scripts/core/theme.css'],
      all_frames: true,
      run_at: 'document_idle',
    },
    {
      matches: [
        '*://*.br/*controlador.php?acao=bloco_assinatura_listar*',
        '*://*.org/*controlador.php?acao=bloco_assinatura_listar*',
      ],
      js: ['src/content-scripts/rel_bloco_protocolo_listar/index.ts'],
      run_at: 'document_idle',
    },
    {
      matches: [
        '*://*.br/*controlador.php?acao=procedimento_controlar*',
        '*://*.org/*controlador.php?acao=procedimento_controlar*',
      ],
      js: ['src/content-scripts/procedimento_controlar/index.ts'],
      run_at: 'document_idle',
    },
  ],
})
