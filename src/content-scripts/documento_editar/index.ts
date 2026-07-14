import { montarPromptComContexto, montarPromptPronto, type TipoPromptPronto } from '../../features/ferramentas-ia/prompts'
import { montarRequisicao, extrairResposta } from '../../features/ferramentas-ia/adaptadores'
import { fetchIA } from '../../lib/fetchIaViaBackground'
import { createSyncConfigStore } from '../../lib/storage'
import type { ProvedorIA, FerramentasIAConfig } from '../../lib/storage'
import openaiIconSvg from '@lobehub/icons-static-svg/icons/openai.svg?raw'
import geminiIconSvg from '@lobehub/icons-static-svg/icons/gemini-color.svg?raw'
import claudeIconSvg from '@lobehub/icons-static-svg/icons/claude-color.svg?raw'
import sparklesIconSvg from 'lucide-static/icons/sparkles.svg?raw'
import { criarClienteEditor, type EditorSEI } from './ponteEditor'

const ESTILO_PAINEL_IA = `
  #seirmg-botao-ia {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10000;
    height: 32px;
    padding: 0 12px;
    background: #017fff;
    border: none;
    border-radius: 16px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #fff;
    font-weight: bold;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, .25);
  }
  #seirmg-botao-ia:hover {
    background: #0066cc;
  }
  #seirmg-botao-ia svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
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

type ProvedorPainel = ProvedorIA | 'jusia'

interface EstadoPainel {
  provedor: ProvedorPainel
  modo: ModoPainel
  confirmado: boolean
}

let estadoAtual: EstadoPainel = { provedor: 'openai', modo: 'livre', confirmado: false }
let respostaAtual: string | null = null
let enviandoAtual = false

async function obterTextoSelecionado(editor: EditorSEI): Promise<string> {
  try {
    return (await editor.obterTextoSelecionado()).trim()
  } catch {
    return ''
  }
}

function montarHtmlProvedores(config: FerramentasIAConfig): string {
  const provedoresComChave = (['openai', 'gemini', 'claude'] as const).filter(
    (provedor) => config[provedor].apiKey.trim() !== ''
  )

  const abasApi = provedoresComChave
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

  const ativoJusia = estadoAtual.provedor === 'jusia' ? ' ativo' : ''
  const abaJusia = `
    <div class="seirmg-ia-provedor${ativoJusia}" data-acao="provedor" data-provedor="jusia">
      <img src="https://ia.jusbrasil.com.br/favicon.ico" alt="" onerror="this.style.visibility='hidden'">
      JusIA
    </div>
  `

  return abasApi + abaJusia
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
  if (respostaAtual === null || estadoAtual.provedor === 'jusia') return ''
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
  const semSelecaoLivre =
    estadoAtual.modo === 'livre' ? 'Nenhum texto selecionado — a pergunta vai considerar o documento inteiro.' : 'Nenhum texto selecionado.'
  const textoInfo = textoSelecionado
    ? `Texto selecionado: <em>"${escaparHtml(textoSelecionado.slice(0, 80))}${textoSelecionado.length > 80 ? '...' : ''}"</em>`
    : semSelecaoLivre

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

function montarHtmlCorpoJusia(textoSelecionado: string): string {
  const textoInfo = textoSelecionado
    ? `Texto selecionado: <em>"${escaparHtml(textoSelecionado.slice(0, 80))}${textoSelecionado.length > 80 ? '...' : ''}"</em> (copiado pra área de transferência ao clicar)`
    : 'Nenhum texto selecionado — o JusIA abre sem nada copiado.'

  return `
    <div class="seirmg-ia-selecao-info">${textoInfo}</div>
    <button class="seirmg-ia-botao-enviar" data-acao="ir-jusia" ${!estadoAtual.confirmado ? 'disabled' : ''}>
      ${estadoAtual.confirmado ? 'Ir pro JusIA' : 'Ir pro JusIA (marque a confirmação acima)'}
    </button>
  `
}

function montarHtmlPainel(
  config: FerramentasIAConfig,
  textoSelecionado: string,
  documentoRestrito: boolean
): string {
  const confirmacaoClasse = estadoAtual.confirmado ? ' confirmado' : ''
  const confirmacaoTexto = estadoAtual.confirmado
    ? '✓ Confirmado: documento não sigiloso/restrito.'
    : 'Confirmo que este documento <strong>não é sigiloso/restrito</strong> — o texto enviado sai do ambiente do SEI para um serviço externo.'
  const checkbox = estadoAtual.confirmado
    ? ''
    : '<input type="checkbox" id="seirmg-ia-checkbox-confirmar" data-acao="confirmar">'

  const blocoConfirmacao = documentoRestrito
    ? '<div class="seirmg-ia-bloqueio">⚠ Este documento parece ter acesso restrito/sigiloso (detectado automaticamente) — ferramentas de IA bloqueadas.</div>'
    : `<div class="seirmg-ia-confirmacao${confirmacaoClasse}">${checkbox}<span>${confirmacaoTexto}</span></div>`

  const modosOuVazio = estadoAtual.provedor === 'jusia' ? '' : `<div class="seirmg-ia-modos">${montarHtmlModos()}</div>`
  const corpo =
    estadoAtual.provedor === 'jusia' ? montarHtmlCorpoJusia(textoSelecionado) : montarHtmlCorpo(textoSelecionado)

  return `
    <div class="seirmg-ia-cabecalho">
      <span>Ferramentas de IA</span>
      <span data-acao="fechar">✕</span>
    </div>
    <div class="seirmg-ia-provedores">${montarHtmlProvedores(config)}</div>
    ${blocoConfirmacao}
    ${documentoRestrito ? '' : modosOuVazio}
    <div class="seirmg-ia-corpo">${documentoRestrito ? '' : corpo}</div>
  `
}

async function obterTextoDocumentoInteiro(editor: EditorSEI): Promise<string> {
  try {
    return (await editor.obterTextoCompleto()).trim()
  } catch {
    return ''
  }
}

function obterIdDocumentoAtual(): string | null {
  return new URLSearchParams(window.location.search).get('id_documento')
}

function detectarDocumentoRestrito(): boolean {
  const idDocumento = obterIdDocumentoAtual()
  if (!idDocumento) return false
  return document.getElementById(`anchorNA${idDocumento}`) !== null
}

async function atualizarPainel(config: FerramentasIAConfig, editor: EditorSEI): Promise<void> {
  const painel = document.getElementById('seirmg-painel-ia')
  if (!painel) return
  const textoSelecionado = await obterTextoSelecionado(editor)
  painel.innerHTML = montarHtmlPainel(config, textoSelecionado, detectarDocumentoRestrito())
}

async function enviar(
  prompt: string,
  provedor: ProvedorIA,
  config: FerramentasIAConfig,
  editor: EditorSEI
): Promise<void> {
  enviandoAtual = true
  respostaAtual = null
  await atualizarPainel(config, editor)

  try {
    const provedorConfig = config[provedor]
    const requisicao = montarRequisicao(provedor, provedorConfig.modelo, prompt, provedorConfig.apiKey)
    const resultado = await fetchIA(requisicao.url, {
      method: requisicao.method,
      headers: requisicao.headers,
      body: requisicao.body,
    })

    if (!resultado.ok) {
      respostaAtual = `Erro ao consultar ${ROTULOS_PROVEDOR[provedor]}: ${resultado.error}`
    } else {
      respostaAtual = extrairResposta(provedor, resultado.data) ?? 'Não foi possível interpretar a resposta.'
    }
  } catch (error) {
    respostaAtual = `Erro inesperado: ${error instanceof Error ? error.message : String(error)}`
  } finally {
    enviandoAtual = false
    await atualizarPainel(config, editor)
  }
}

async function tratarCliquePainel(evento: MouseEvent, config: FerramentasIAConfig, editor: EditorSEI): Promise<void> {
  if (!(evento.target instanceof HTMLElement)) return
  const elemento = evento.target.closest<HTMLElement>('[data-acao]')
  if (!elemento) return
  const acao = elemento.dataset.acao

  if (acao === 'fechar') {
    document.getElementById('seirmg-painel-ia')?.remove()
    return
  }

  if (acao === 'provedor') {
    const provedor = elemento.dataset.provedor as ProvedorPainel
    estadoAtual = { ...estadoAtual, provedor }
    respostaAtual = null
    await atualizarPainel(config, editor)
    return
  }

  if (acao === 'modo') {
    const modo = elemento.dataset.modo as ModoPainel
    estadoAtual = { ...estadoAtual, modo }
    respostaAtual = null
    await atualizarPainel(config, editor)
    return
  }

  if (acao === 'confirmar' && elemento instanceof HTMLInputElement) {
    estadoAtual = { ...estadoAtual, confirmado: elemento.checked }
    await atualizarPainel(config, editor)
    return
  }

  if (acao === 'descartar') {
    respostaAtual = null
    await atualizarPainel(config, editor)
    return
  }

  if (acao === 'inserir') {
    if (respostaAtual) await editor.inserirHtml(escaparHtml(respostaAtual).replace(/\n/g, '<br>'))
    document.getElementById('seirmg-painel-ia')?.remove()
    return
  }

  if (acao === 'ir-jusia') {
    if (!estadoAtual.confirmado) return
    const textoSelecionado = await obterTextoSelecionado(editor)
    if (textoSelecionado) {
      navigator.clipboard.writeText(textoSelecionado).catch((error) => {
        console.error('[SEIRMG] Falha ao copiar texto pra área de transferência:', error)
      })
    }
    window.open('https://ia.jusbrasil.com.br', '_blank')
    return
  }

  if (acao === 'enviar-livre') {
    if (estadoAtual.provedor === 'jusia') return
    const textarea = document.getElementById('seirmg-ia-instrucao') as HTMLTextAreaElement | null
    const pergunta = textarea?.value.trim() ?? ''
    if (!pergunta || !estadoAtual.confirmado || enviandoAtual) return
    const textoSelecionado = await obterTextoSelecionado(editor)
    const contexto = textoSelecionado || (await obterTextoDocumentoInteiro(editor))
    const prompt = montarPromptComContexto(pergunta, contexto || null)
    await enviar(prompt, estadoAtual.provedor, config, editor)
    return
  }

  if (acao === 'enviar-redigir') {
    if (estadoAtual.provedor === 'jusia') return
    const textarea = document.getElementById('seirmg-ia-instrucao') as HTMLTextAreaElement | null
    const instrucao = textarea?.value.trim() ?? ''
    if (!instrucao || !estadoAtual.confirmado || enviandoAtual) return
    const textoSelecionado = await obterTextoSelecionado(editor)
    const prompt = montarPromptComContexto(instrucao, textoSelecionado || null)
    await enviar(prompt, estadoAtual.provedor, config, editor)
    return
  }

  if (acao === 'enviar-pronto') {
    if (estadoAtual.provedor === 'jusia') return
    const tipo = elemento.dataset.tipo as TipoPromptPronto
    const textoSelecionado = await obterTextoSelecionado(editor)
    if (!textoSelecionado || !estadoAtual.confirmado || enviandoAtual) return
    const prompt = montarPromptPronto(tipo, textoSelecionado)
    await enviar(prompt, estadoAtual.provedor, config, editor)
  }
}

function montarPainel(config: FerramentasIAConfig, editor: EditorSEI): void {
  document.getElementById('seirmg-painel-ia')?.remove()
  estadoAtual = { provedor: config.provedorAtivo, modo: 'livre', confirmado: false }
  respostaAtual = null
  enviandoAtual = false

  const painel = document.createElement('div')
  painel.id = 'seirmg-painel-ia'
  document.body.appendChild(painel)
  painel.addEventListener('click', (evento) => {
    tratarCliquePainel(evento, config, editor).catch((error) => {
      console.error('[SEIRMG] Falha ao tratar clique no painel de IA:', error)
    })
  })

  atualizarPainel(config, editor).catch((error) => {
    console.error('[SEIRMG] Falha ao atualizar painel de IA:', error)
  })
}

// Botão flutuante, independente da barra de ferramentas do CKEditor — item próprio,
// não misturado com os botões nativos de formatação do editor.
function montarBotaoFlutuante(editor: EditorSEI, config: FerramentasIAConfig): void {
  if (document.getElementById('seirmg-botao-ia')) return

  const botao = document.createElement('button')
  botao.type = 'button'
  botao.id = 'seirmg-botao-ia'
  botao.innerHTML = `${sparklesIconSvg}<span>Ferramentas de IA</span>`
  botao.title = 'Ferramentas de IA'
  botao.addEventListener('click', () => montarPainel(config, editor))
  document.body.appendChild(botao)
}

// DIAGNÓSTICO TEMPORÁRIO (Lote R) — remover depois de descobrir por que a ponte
// não está ativando nada em produção. Banner visível na página em vez de console,
// porque o usuário não usa DevTools.
function atualizarBannerDiagnosticoIsolado(texto: string): void {
  let banner = document.getElementById('seirmg-diag-isolado')
  if (!banner) {
    banner = document.createElement('div')
    banner.id = 'seirmg-diag-isolado'
    banner.style.cssText =
      'position:fixed;top:64px;right:8px;z-index:2147483647;background:#003;color:#0ff;' +
      'font:12px monospace;padding:4px 8px;border-radius:4px;max-width:40vw;white-space:pre-wrap;pointer-events:none;'
    document.documentElement.appendChild(banner)
  }
  banner.textContent = `[SEIRMG isolado] ${texto}`
}

function criarLinhaDiagnosticoIsolado(id: string, topoPx: number, corTexto: string): (texto: string) => void {
  return (texto: string) => {
    let banner = document.getElementById(id)
    if (!banner) {
      banner = document.createElement('div')
      banner.id = id
      banner.style.cssText =
        `position:fixed;top:${topoPx}px;right:8px;z-index:2147483647;background:#000;color:${corTexto};` +
        'font:12px monospace;padding:4px 8px;border-radius:4px;max-width:40vw;white-space:pre-wrap;pointer-events:none;'
      document.documentElement.appendChild(banner)
    }
    banner.textContent = texto
  }
}

const linhaFrameIsolado = criarLinhaDiagnosticoIsolado('seirmg-diag-isolado-frame', 104, '#ff0')
const linhaBatimentoIsolado = criarLinhaDiagnosticoIsolado('seirmg-diag-isolado-batimento', 124, '#f0f')

linhaFrameIsolado(`[frame-isolado] topo=${window === window.top} url=${window.location.href.slice(0, 60)}`)
linhaBatimentoIsolado('[batimento-isolado] aguardando primeiro batimento do main world...')

window.addEventListener('seirmg:diag-batimento', (evento) => {
  const { n } = (evento as CustomEvent<{ n: number }>).detail
  linhaBatimentoIsolado(`[batimento-isolado] recebido #${n}`)
})

// Precisa ser criado de forma síncrona, assim que o script carrega — não dentro do
// bootstrap() depois de um await. O main world pode disparar EVENTO_PRONTO a qualquer
// momento (assim que achar o CKEditor), e CustomEvent não fica "guardado" pra quem
// registra o listener depois: se o cliente só for criado após o await no
// createSyncConfigStore().get(), existe uma janela real onde o evento se perde pra
// sempre. Criar aqui garante que o listener já está no ar antes de qualquer await.
const clienteEditorGlobal = criarClienteEditor(window)

async function bootstrap(): Promise<void> {
  atualizarBannerDiagnosticoIsolado('bootstrap iniciado')
  try {
    const config = await createSyncConfigStore().get()
    atualizarBannerDiagnosticoIsolado(
      `config carregada — IA ativo=${config.ferramentasIA.ativo} corretor ativo=${config.corretorOrtografico.ativo}`
    )
    if (!config.ferramentasIA.ativo && !config.corretorOrtografico.ativo) {
      atualizarBannerDiagnosticoIsolado('ambos desativados nas Opções, parando aqui')
      return
    }

    atualizarBannerDiagnosticoIsolado('aguardando "editor pronto" vindo do main world...')
    const editor = await clienteEditorGlobal.aguardarEditorPronto()
    atualizarBannerDiagnosticoIsolado('editor pronto recebido! montando features...')

    if (config.ferramentasIA.ativo) {
      injetarEstilos()
      montarBotaoFlutuante(editor, config.ferramentasIA)
      atualizarBannerDiagnosticoIsolado('botão de Ferramentas de IA montado')
    }

    if (config.corretorOrtografico.ativo) {
      const { iniciarCorretorOrtografico } = await import('./corretorOrtografico')
      await iniciarCorretorOrtografico(editor, config.corretorOrtografico)
      atualizarBannerDiagnosticoIsolado('corretor ortográfico iniciado')
    }
  } catch (error) {
    atualizarBannerDiagnosticoIsolado(`ERRO: ${error instanceof Error ? error.message : String(error)}`)
    console.error('[SEIRMG] Falha ao inicializar recursos do editor de documentos:', error)
  }
}

bootstrap()
