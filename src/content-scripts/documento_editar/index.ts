import { montarPromptComContexto, montarPromptPronto, type TipoPromptPronto } from '../../features/ferramentas-ia/prompts'
import { montarRequisicao, extrairResposta } from '../../features/ferramentas-ia/adaptadores'
import { fetchIA } from '../../lib/fetchIaViaBackground'
import { createSyncConfigStore } from '../../lib/storage'
import type { ProvedorIA, FerramentasIAConfig } from '../../lib/storage'
import openaiIconSvg from '@lobehub/icons-static-svg/icons/openai.svg?raw'
import geminiIconSvg from '@lobehub/icons-static-svg/icons/gemini-color.svg?raw'
import claudeIconSvg from '@lobehub/icons-static-svg/icons/claude-color.svg?raw'

const ESTILO_PAINEL_IA = `
  #seirmg-botao-ia {
    height: 24px;
    padding: 0 8px;
    background: #fff;
    border: 1px solid #017fff;
    border-radius: 3px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: #017fff;
    font-weight: bold;
    cursor: pointer;
    margin: 2px;
  }
  #seirmg-painel-ia {
    position: fixed;
    top: 60px;
    right: 20px;
    width: 420px;
    max-width: calc(100vw - 40px);
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, .2);
    z-index: 10000;
    font-family: Arial, Helvetica, sans-serif;
    color: #222;
    overflow: hidden;
  }
  .seirmg-ia-cabecalho {
    background: #017fff;
    color: #fff;
    padding: 10px 14px;
    font-weight: bold;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .seirmg-ia-cabecalho span:last-child {
    cursor: pointer;
  }
  .seirmg-ia-provedores {
    display: flex;
    border-bottom: 1px solid #eee;
  }
  .seirmg-ia-provedor {
    flex: 1;
    text-align: center;
    padding: 10px 4px;
    font-size: 12px;
    color: #666;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .seirmg-ia-icone-provedor {
    display: inline-flex;
  }
  .seirmg-ia-icone-provedor svg {
    width: 18px;
    height: 18px;
  }
  .seirmg-ia-provedor.ativo {
    background: #eef6ff;
    border-bottom: 2px solid #017fff;
    font-weight: bold;
    color: #017fff;
  }
  .seirmg-ia-confirmacao {
    padding: 10px 14px;
    background: #fff8e1;
    border-bottom: 1px solid #f0d9a0;
    font-size: 12px;
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .seirmg-ia-confirmacao.confirmado {
    background: #eef7ee;
    border-bottom: 1px solid #cde5cd;
    color: #2e7d32;
  }
  .seirmg-ia-bloqueio {
    padding: 10px 14px;
    background: #fdecea;
    border-bottom: 1px solid #f3c1bb;
    color: #c0392b;
    font-size: 12px;
  }
  .seirmg-ia-modos {
    display: flex;
    border-bottom: 1px solid #eee;
    font-size: 12px;
  }
  .seirmg-ia-modo {
    flex: 1;
    text-align: center;
    padding: 8px 4px;
    color: #666;
    cursor: pointer;
  }
  .seirmg-ia-modo.ativo {
    border-bottom: 2px solid #017fff;
    color: #017fff;
    font-weight: bold;
  }
  .seirmg-ia-corpo {
    padding: 14px;
  }
  .seirmg-ia-selecao-info {
    font-size: 11px;
    color: #888;
    margin-bottom: 6px;
  }
  .seirmg-ia-corpo textarea {
    width: 100%;
    height: 60px;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 8px;
    font-size: 13px;
    font-family: inherit;
    resize: vertical;
    box-sizing: border-box;
  }
  .seirmg-ia-botao-enviar {
    margin-top: 10px;
    width: 100%;
    padding: 9px;
    background: #017fff;
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
  }
  .seirmg-ia-botao-enviar:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
  .seirmg-ia-prontos-botao {
    display: block;
    width: 100%;
    margin-bottom: 8px;
    padding: 9px;
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
    text-align: left;
  }
  .seirmg-ia-resposta {
    border: 1px solid #017fff;
    border-radius: 4px;
    padding: 10px;
    background: #fafcff;
    margin-top: 12px;
  }
  .seirmg-ia-resposta-rotulo {
    font-size: 11px;
    color: #017fff;
    font-weight: bold;
    margin-bottom: 6px;
  }
  .seirmg-ia-resposta-texto {
    font-size: 13px;
    color: #333;
    line-height: 1.5;
    white-space: pre-wrap;
  }
  .seirmg-ia-resposta-acoes {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }
  .seirmg-ia-resposta-acoes button {
    flex: 1;
    padding: 9px;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
  }
  .seirmg-ia-inserir {
    background: #017fff;
    color: #fff;
    border: none;
    font-weight: bold;
  }
  .seirmg-ia-descartar {
    background: #fff;
    color: #666;
    border: 1px solid #ccc;
  }
`

function injetarEstilos(): void {
  if (document.getElementById('seirmg-estilo-ia')) return
  const style = document.createElement('style')
  style.id = 'seirmg-estilo-ia'
  style.textContent = ESTILO_PAINEL_IA
  document.head.appendChild(style)
}

const ICONES_PROVEDOR: Record<ProvedorIA, string> = {
  openai: openaiIconSvg,
  gemini: geminiIconSvg,
  claude: claudeIconSvg,
}

const ROTULOS_PROVEDOR: Record<ProvedorIA, string> = {
  openai: 'ChatGPT',
  gemini: 'Gemini',
  claude: 'Claude',
}

const MODOS = [
  { id: 'livre', rotulo: 'Prompt livre' },
  { id: 'prontos', rotulo: 'Prontos' },
  { id: 'redigir', rotulo: 'Redigir' },
] as const
type ModoPainel = (typeof MODOS)[number]['id']

interface EstadoPainel {
  provedor: ProvedorIA
  modo: ModoPainel
  confirmado: boolean
}

let estadoAtual: EstadoPainel = { provedor: 'openai', modo: 'livre', confirmado: false }
let respostaAtual: string | null = null
let enviandoAtual = false

function obterTextoSelecionado(editor: { getSelection: () => { getSelectedText: () => string } | null }): string {
  try {
    return editor.getSelection()?.getSelectedText()?.trim() ?? ''
  } catch {
    return ''
  }
}

function montarHtmlProvedores(config: FerramentasIAConfig): string {
  const provedoresComChave = (['openai', 'gemini', 'claude'] as const).filter(
    (provedor) => config[provedor].apiKey.trim() !== ''
  )

  return provedoresComChave
    .map((provedor) => {
      const ativo = provedor === estadoAtual.provedor ? ' ativo' : ''
      return `
        <div class="seirmg-ia-provedor${ativo}" data-acao="provedor" data-provedor="${provedor}">
          <span class="seirmg-ia-icone-provedor">${ICONES_PROVEDOR[provedor]}</span>
          ${ROTULOS_PROVEDOR[provedor]}
        </div>
      `
    })
    .join('')
}

function montarHtmlModos(): string {
  return MODOS.map(({ id, rotulo }) => {
    const ativo = id === estadoAtual.modo ? ' ativo' : ''
    return `<div class="seirmg-ia-modo${ativo}" data-acao="modo" data-modo="${id}">${rotulo}</div>`
  }).join('')
}

function escaparHtml(texto: string): string {
  const div = document.createElement('div')
  div.textContent = texto
  return div.innerHTML
}

function montarHtmlResposta(): string {
  if (respostaAtual === null) return ''
  return `
    <div class="seirmg-ia-resposta">
      <div class="seirmg-ia-resposta-rotulo">RESPOSTA — ${ROTULOS_PROVEDOR[estadoAtual.provedor]}</div>
      <div class="seirmg-ia-resposta-texto">${escaparHtml(respostaAtual)}</div>
    </div>
    <div class="seirmg-ia-resposta-acoes">
      <button class="seirmg-ia-inserir" data-acao="inserir">Inserir no documento</button>
      <button class="seirmg-ia-descartar" data-acao="descartar">Descartar</button>
    </div>
  `
}

function montarHtmlCorpo(textoSelecionado: string): string {
  const desabilitado = !estadoAtual.confirmado || enviandoAtual
  const textoInfo = textoSelecionado
    ? `Texto selecionado: <em>"${escaparHtml(textoSelecionado.slice(0, 80))}${textoSelecionado.length > 80 ? '...' : ''}"</em>`
    : 'Nenhum texto selecionado.'

  if (estadoAtual.modo === 'prontos') {
    const semSelecao = textoSelecionado === ''
    const rotulos: Record<TipoPromptPronto, string> = {
      resumir: 'Resumir',
      revisar: 'Revisar/corrigir português',
      formal: 'Deixar mais formal',
    }
    const botoes = (Object.keys(rotulos) as TipoPromptPronto[])
      .map(
        (tipo) => `
        <button class="seirmg-ia-prontos-botao" data-acao="enviar-pronto" data-tipo="${tipo}"
          ${desabilitado || semSelecao ? 'disabled' : ''}>${rotulos[tipo]}</button>
      `
      )
      .join('')
    return `
      <div class="seirmg-ia-selecao-info">${textoInfo}</div>
      ${botoes}
      ${semSelecao ? '<div class="seirmg-ia-selecao-info">Selecione um trecho no documento pra usar os prompts prontos.</div>' : ''}
      ${montarHtmlResposta()}
    `
  }

  const rotuloBotao = estadoAtual.modo === 'redigir' ? 'Gerar' : 'Perguntar'
  const placeholder =
    estadoAtual.modo === 'redigir'
      ? 'Descreva o que você quer redigir...'
      : 'Digite sua pergunta sobre o texto selecionado...'
  const textoBotao = enviandoAtual
    ? 'Enviando...'
    : !estadoAtual.confirmado
      ? `${rotuloBotao} (marque a confirmação acima)`
      : rotuloBotao

  return `
    <div class="seirmg-ia-selecao-info">${textoInfo}</div>
    <textarea id="seirmg-ia-instrucao" placeholder="${placeholder}" ${desabilitado ? 'disabled' : ''}></textarea>
    <button class="seirmg-ia-botao-enviar" data-acao="enviar-${estadoAtual.modo}" ${desabilitado ? 'disabled' : ''}>${textoBotao}</button>
    ${montarHtmlResposta()}
  `
}

function montarHtmlPainel(config: FerramentasIAConfig, textoSelecionado: string): string {
  const confirmacaoClasse = estadoAtual.confirmado ? ' confirmado' : ''
  const confirmacaoTexto = estadoAtual.confirmado
    ? '✓ Confirmado: documento não sigiloso/restrito.'
    : 'Confirmo que este documento <strong>não é sigiloso/restrito</strong> — o texto enviado sai do ambiente do SEI para um serviço externo.'
  const checkbox = estadoAtual.confirmado
    ? ''
    : '<input type="checkbox" id="seirmg-ia-checkbox-confirmar" data-acao="confirmar">'

  return `
    <div class="seirmg-ia-cabecalho">
      <span>Ferramentas de IA</span>
      <span data-acao="fechar">✕</span>
    </div>
    <div class="seirmg-ia-provedores">${montarHtmlProvedores(config)}</div>
    <div class="seirmg-ia-confirmacao${confirmacaoClasse}">${checkbox}<span>${confirmacaoTexto}</span></div>
    <div class="seirmg-ia-modos">${montarHtmlModos()}</div>
    <div class="seirmg-ia-corpo">${montarHtmlCorpo(textoSelecionado)}</div>
  `
}

interface EditorCKEditor {
  getSelection: () => { getSelectedText: () => string } | null
  insertHtml: (html: string) => void
}

function atualizarPainel(config: FerramentasIAConfig, editor: EditorCKEditor): void {
  const painel = document.getElementById('seirmg-painel-ia')
  if (!painel) return
  painel.innerHTML = montarHtmlPainel(config, obterTextoSelecionado(editor))
}

async function enviar(prompt: string, config: FerramentasIAConfig, editor: EditorCKEditor): Promise<void> {
  enviandoAtual = true
  respostaAtual = null
  atualizarPainel(config, editor)

  try {
    const provedorConfig = config[estadoAtual.provedor]
    const requisicao = montarRequisicao(estadoAtual.provedor, provedorConfig.modelo, prompt, provedorConfig.apiKey)
    const resultado = await fetchIA(requisicao.url, {
      method: requisicao.method,
      headers: requisicao.headers,
      body: requisicao.body,
    })

    if (!resultado.ok) {
      respostaAtual = `Erro ao consultar ${ROTULOS_PROVEDOR[estadoAtual.provedor]}: ${resultado.error}`
    } else {
      respostaAtual = extrairResposta(estadoAtual.provedor, resultado.data) ?? 'Não foi possível interpretar a resposta.'
    }
  } catch (error) {
    respostaAtual = `Erro inesperado: ${error instanceof Error ? error.message : String(error)}`
  } finally {
    enviandoAtual = false
    atualizarPainel(config, editor)
  }
}

function tratarCliquePainel(evento: MouseEvent, config: FerramentasIAConfig, editor: EditorCKEditor): void {
  if (!(evento.target instanceof HTMLElement)) return
  const elemento = evento.target.closest<HTMLElement>('[data-acao]')
  if (!elemento) return
  const acao = elemento.dataset.acao

  if (acao === 'fechar') {
    document.getElementById('seirmg-painel-ia')?.remove()
    return
  }

  if (acao === 'provedor') {
    const provedor = elemento.dataset.provedor as ProvedorIA
    estadoAtual = { ...estadoAtual, provedor }
    atualizarPainel(config, editor)
    return
  }

  if (acao === 'modo') {
    const modo = elemento.dataset.modo as ModoPainel
    estadoAtual = { ...estadoAtual, modo }
    respostaAtual = null
    atualizarPainel(config, editor)
    return
  }

  if (acao === 'confirmar' && elemento instanceof HTMLInputElement) {
    estadoAtual = { ...estadoAtual, confirmado: elemento.checked }
    atualizarPainel(config, editor)
    return
  }

  if (acao === 'descartar') {
    respostaAtual = null
    atualizarPainel(config, editor)
    return
  }

  if (acao === 'inserir') {
    if (respostaAtual) editor.insertHtml(escaparHtml(respostaAtual).replace(/\n/g, '<br>'))
    document.getElementById('seirmg-painel-ia')?.remove()
    return
  }

  if (acao === 'enviar-livre' || acao === 'enviar-redigir') {
    const textarea = document.getElementById('seirmg-ia-instrucao') as HTMLTextAreaElement | null
    const instrucao = textarea?.value.trim() ?? ''
    if (!instrucao || !estadoAtual.confirmado || enviandoAtual) return
    const textoSelecionado = obterTextoSelecionado(editor)
    const prompt = montarPromptComContexto(instrucao, textoSelecionado || null)
    enviar(prompt, config, editor).catch((error) => {
      console.error('[SEIRMG] Falha ao enviar prompt pra IA:', error)
    })
    return
  }

  if (acao === 'enviar-pronto') {
    const tipo = elemento.dataset.tipo as TipoPromptPronto
    const textoSelecionado = obterTextoSelecionado(editor)
    if (!textoSelecionado || !estadoAtual.confirmado || enviandoAtual) return
    const prompt = montarPromptPronto(tipo, textoSelecionado)
    enviar(prompt, config, editor).catch((error) => {
      console.error('[SEIRMG] Falha ao enviar prompt pronto pra IA:', error)
    })
  }
}

function montarPainel(config: FerramentasIAConfig, editor: EditorCKEditor): void {
  document.getElementById('seirmg-painel-ia')?.remove()
  estadoAtual = { provedor: config.provedorAtivo, modo: 'livre', confirmado: false }
  respostaAtual = null
  enviandoAtual = false

  const painel = document.createElement('div')
  painel.id = 'seirmg-painel-ia'
  document.body.appendChild(painel)
  painel.addEventListener('click', (evento) => tratarCliquePainel(evento, config, editor))

  atualizarPainel(config, editor)
}

interface JanelaComCKEditor {
  CKEDITOR?: { instances: Record<string, EditorCKEditor> }
}

function esperarCKEditor(callback: () => void, tentativasRestantes = 30): void {
  if (typeof (window as unknown as JanelaComCKEditor).CKEDITOR !== 'undefined') {
    callback()
    return
  }
  if (tentativasRestantes <= 0) return
  setTimeout(() => esperarCKEditor(callback, tentativasRestantes - 1), 200)
}

function obterInstanciaCKEditor(): EditorCKEditor | null {
  const instances = (window as unknown as JanelaComCKEditor).CKEDITOR?.instances
  if (!instances) return null
  return Object.values(instances)[0] ?? null
}

function inserirBotaoNaBarra(editor: EditorCKEditor, config: FerramentasIAConfig): void {
  if (document.getElementById('seirmg-botao-ia')) return
  const marcadorInicioBarra = document.querySelector('.cke_toolbox .cke_toolbar:first-child .cke_toolbar_start')
  if (!marcadorInicioBarra) return

  const botao = document.createElement('span')
  botao.id = 'seirmg-botao-ia'
  botao.textContent = '✨ IA'
  botao.title = 'Ferramentas de IA'
  botao.addEventListener('click', () => montarPainel(config, editor))
  marcadorInicioBarra.insertAdjacentElement('afterend', botao)
}

async function bootstrap(): Promise<void> {
  try {
    const config = await createSyncConfigStore().get()
    if (!config.ferramentasIA.ativo) return

    injetarEstilos()
    esperarCKEditor(() => {
      const editor = obterInstanciaCKEditor()
      if (!editor) return
      inserirBotaoNaBarra(editor, config.ferramentasIA)
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao inicializar ferramentas de IA no editor:', error)
  }
}

bootstrap()
