// Tipos de mensagem compartilhados entre background/index.ts e
// content-scripts/documento_editar/referenciaLink.ts -- compartilhados só em tempo de build (cada
// contexto é bundlado separadamente), mesmo padrão de protocolo.ts pro par main/isolated world.
export const TIPO_LINK_SELECAO_ESTADO = 'seirmg:link-selecao-estado'
export const TIPO_LINK_SELECAO_CONVERTER = 'seirmg:link-selecao-converter'
export const TIPO_FETCH_SEI_FINAL_URL = 'seirmg:fetch-sei-final-url'
