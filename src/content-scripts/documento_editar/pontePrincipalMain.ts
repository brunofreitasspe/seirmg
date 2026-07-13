import { criarPonteMainWorld } from './pontePrincipal'
import { EVENTO_PRONTO } from './protocolo'
import type { DetalhePronto } from './protocolo'

// DIAGNÓSTICO TEMPORÁRIO (Lote R) — remover depois de descobrir por que a ponte
// não está ativando nada em produção. Banner visível na página em vez de console,
// porque o usuário não usa DevTools.
function atualizarBannerDiagnosticoMain(texto: string): void {
  let banner = document.getElementById('seirmg-diag-main')
  if (!banner) {
    banner = document.createElement('div')
    banner.id = 'seirmg-diag-main'
    banner.style.cssText =
      'position:fixed;top:4px;left:8px;z-index:2147483647;background:#022;color:#0f0;' +
      'font:12px monospace;padding:4px 8px;border-radius:4px;max-width:70vw;white-space:pre-wrap;'
    document.documentElement.appendChild(banner)
  }
  banner.textContent = `[SEIRMG main] ${texto}`
}

atualizarBannerDiagnosticoMain('script main-world carregado, procurando window.CKEDITOR...')

let tentativasDiagnostico = 0
const intervaloDiagnostico = setInterval(() => {
  tentativasDiagnostico++
  const ckeditor = (window as unknown as { CKEDITOR?: { instances?: Record<string, unknown> } }).CKEDITOR
  if (ckeditor?.instances) {
    const nomes = Object.keys(ckeditor.instances)
    atualizarBannerDiagnosticoMain(`window.CKEDITOR encontrado! instâncias: [${nomes.join(', ')}]`)
    clearInterval(intervaloDiagnostico)
    return
  }
  atualizarBannerDiagnosticoMain(`aguardando window.CKEDITOR... (tentativa ${tentativasDiagnostico}/30)`)
  if (tentativasDiagnostico >= 30) {
    atualizarBannerDiagnosticoMain('window.CKEDITOR NUNCA apareceu (desisti após ~6s)')
    clearInterval(intervaloDiagnostico)
  }
}, 200)

window.addEventListener(EVENTO_PRONTO, (evento) => {
  const { nome } = (evento as CustomEvent<DetalhePronto>).detail
  atualizarBannerDiagnosticoMain(`EVENTO_PRONTO disparado! instância editável = "${nome}"`)
})

criarPonteMainWorld(window)
