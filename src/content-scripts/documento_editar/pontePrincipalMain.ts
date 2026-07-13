import { criarPonteMainWorld } from './pontePrincipal'
import { EVENTO_PRONTO } from './protocolo'
import type { DetalhePronto } from './protocolo'

// DIAGNÓSTICO TEMPORÁRIO (Lote R) — remover depois de descobrir por que a ponte
// não está ativando nada em produção. Banner visível na página em vez de console,
// porque o usuário não usa DevTools. Cada aspecto tem sua PRÓPRIA linha (não
// sobrescrevem uma à outra), pra não perder evidência por causa de race entre elas.
function criarLinhaDiagnostico(id: string, topoPx: number, corTexto: string): (texto: string) => void {
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

const linhaPoll = criarLinhaDiagnostico('seirmg-diag-main-poll', 4, '#0f0')
const linhaEvento = criarLinhaDiagnostico('seirmg-diag-main-evento', 24, '#0ff')
const linhaErro = criarLinhaDiagnostico('seirmg-diag-main-erro', 44, '#f55')
const linhaFrame = criarLinhaDiagnostico('seirmg-diag-main-frame', 64, '#ff0')
const linhaBattimento = criarLinhaDiagnostico('seirmg-diag-main-batimento', 84, '#f0f')

linhaPoll('[poll] script main-world carregado, procurando window.CKEDITOR...')
linhaEvento('[evento] aguardando EVENTO_PRONTO (ainda não disparou)...')
linhaErro('[erro] nenhum erro capturado ainda')
linhaFrame(
  `[frame-main] topo=${window === window.top} url=${window.location.href.slice(0, 60)}`
)

let batimentos = 0
setInterval(() => {
  batimentos++
  linhaBattimento(`[batimento-main] enviando #${batimentos}`)
  window.dispatchEvent(new CustomEvent('seirmg:diag-batimento', { detail: { n: batimentos } }))
}, 1000)

let tentativasDiagnostico = 0
const intervaloDiagnostico = setInterval(() => {
  tentativasDiagnostico++
  const ckeditor = (window as unknown as { CKEDITOR?: { instances?: Record<string, unknown> } }).CKEDITOR
  if (ckeditor?.instances) {
    const nomes = Object.keys(ckeditor.instances)
    linhaPoll(`[poll] window.CKEDITOR encontrado! instâncias: [${nomes.join(', ')}]`)
    clearInterval(intervaloDiagnostico)
    return
  }
  linhaPoll(`[poll] aguardando window.CKEDITOR... (tentativa ${tentativasDiagnostico}/30)`)
  if (tentativasDiagnostico >= 30) {
    linhaPoll('[poll] window.CKEDITOR NUNCA apareceu (desisti após ~6s)')
    clearInterval(intervaloDiagnostico)
  }
}, 200)

window.addEventListener(EVENTO_PRONTO, (evento) => {
  const { nome } = (evento as CustomEvent<DetalhePronto>).detail
  linhaEvento(`[evento] EVENTO_PRONTO disparado! instância editável = "${nome}"`)
})

window.addEventListener('error', (evento) => {
  linhaErro(`[erro] NÃO CAPTURADO no main world: ${evento.message} (${evento.filename}:${evento.lineno}:${evento.colno})`)
})

try {
  criarPonteMainWorld(window)
} catch (error) {
  linhaErro(`[erro] EXCEÇÃO SÍNCRONA ao criar a ponte: ${error instanceof Error ? error.message : String(error)}`)
}
