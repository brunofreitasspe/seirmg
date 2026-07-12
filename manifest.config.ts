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
  permissions: ['storage', 'notifications', 'tabs', 'alarms'],
  host_permissions: [
    '*://*.br/*controlador.php?acao=*',
    '*://*.org/*controlador.php?acao=*',
    'https://api.openai.com/*',
    'https://generativelanguage.googleapis.com/*',
    'https://api.anthropic.com/*',
  ],
  optional_host_permissions: ['*://*/*'],
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
    {
      matches: [
        '*://*.br/*controlador.php?acao=*',
        '*://*.org/*controlador.php?acao=*',
      ],
      js: ['src/content-scripts/ponto_controle/index.ts'],
      run_at: 'document_idle',
    },
    {
      matches: [
        '*://*.br/*controlador.php?acao=controle_unidade_gerar*',
        '*://*.org/*controlador.php?acao=controle_unidade_gerar*',
      ],
      js: ['src/content-scripts/controle_unidade_gerar/index.ts'],
      run_at: 'document_idle',
    },
    {
      matches: [
        '*://*.br/*controlador.php?acao=documento_receber*',
        '*://*.org/*controlador.php?acao=documento_receber*',
      ],
      js: ['src/content-scripts/documento_receber/index.ts'],
      run_at: 'document_idle',
    },
    {
      matches: [
        '*://*.br/*controlador.php?acao=procedimento_enviar*',
        '*://*.org/*controlador.php?acao=procedimento_enviar*',
      ],
      js: ['src/content-scripts/procedimento_enviar/index.ts'],
      all_frames: true,
      run_at: 'document_idle',
    },
    {
      matches: [
        '*://*.br/*controlador.php?acao=procedimento_visualizar*',
        '*://*.org/*controlador.php?acao=procedimento_visualizar*',
      ],
      js: ['src/content-scripts/procedimento_visualizar/index.ts'],
      run_at: 'document_idle',
    },
    {
      matches: [
        '*://*.br/*controlador.php?acao=anotacao_registrar*',
        '*://*.org/*controlador.php?acao=anotacao_registrar*',
      ],
      js: ['src/content-scripts/anotacao_registrar/index.ts'],
      run_at: 'document_idle',
    },
    {
      matches: [
        '*://*.br/*controlador.php?acao=*',
        '*://*.org/*controlador.php?acao=*',
      ],
      js: ['src/content-scripts/documento_editar/index.ts'],
      all_frames: true,
      run_at: 'document_idle',
    },
  ],
})
