import { createLocalConfigStore, createSyncConfigStore, type HistoricoProcessoEntry } from '../lib/storage'
import { consultarBlocosAoVivo, type ConsultaBlocosAoVivo } from '../features/bloco-assinatura/consultarAoVivo'
import { filtrarHistoricoPorTexto } from '../features/procedimento-visualizar/historico'
import checkIconSvg from 'lucide-static/icons/check.svg?raw'
import alertIconSvg from 'lucide-static/icons/triangle-alert.svg?raw'
import infoIconSvg from 'lucide-static/icons/info.svg?raw'
import externalLinkIconSvg from 'lucide-static/icons/external-link.svg?raw'
import settingsIconSvg from 'lucide-static/icons/settings.svg?raw'
import layoutDashboardIconSvg from 'lucide-static/icons/layout-dashboard.svg?raw'

let historicoCompleto: HistoricoProcessoEntry[] = []
let baseUrlSeiAtual: string | undefined

function montarItemHistorico(entrada: HistoricoProcessoEntry, baseUrlSei: string): HTMLAnchorElement {
  const item = document.createElement('a')
  item.className = 'item-recente'
  item.target = '_blank'
  item.rel = 'noopener'
  item.href = `${baseUrlSei}/controlador.php?acao=procedimento_trabalhar&id_procedimento=${entrada.idProcedimento}`

  const marcador = document.createElement('span')
  marcador.className = 'item-marcador'

  const texto = document.createElement('span')
  texto.className = 'item-texto'
  const numero = document.createElement('span')
  numero.className = 'item-numero'
  numero.textContent = entrada.numero
  const tipo = document.createElement('span')
  tipo.className = 'item-tipo'
  tipo.textContent = entrada.tipo
  texto.append(numero, tipo)

  const seta = document.createElement('span')
  seta.className = 'item-seta'
  seta.innerHTML = externalLinkIconSvg

  item.append(marcador, texto, seta)
  return item
}

function renderizarStatus(consulta: ConsultaBlocosAoVivo): void {
  const status = document.getElementById('status')
  const statusIcone = document.getElementById('status-icone')
  const statusTitulo = document.getElementById('status-titulo')
  const statusSub = document.getElementById('status-sub')

  status?.classList.remove('pendente', 'indisponivel')
  statusTitulo?.classList.remove('pendente-cor')

  if (!consulta.ok) {
    status?.classList.add('indisponivel')
    if (statusIcone) statusIcone.innerHTML = infoIconSvg
    if (statusTitulo) statusTitulo.textContent = 'Status indisponível'
    if (statusSub) statusSub.textContent = 'Abra o SEI numa aba pra ver o status do bloco de assinatura'
    return
  }

  const pendente = consulta.total > 0
  status?.classList.toggle('pendente', pendente)
  if (statusIcone) statusIcone.innerHTML = pendente ? alertIconSvg : checkIconSvg
  if (statusTitulo) {
    statusTitulo.textContent = pendente ? 'Pendências encontradas' : 'Tudo em dia'
    statusTitulo.classList.toggle('pendente-cor', pendente)
  }
  if (statusSub) {
    statusSub.textContent = pendente
      ? `${consulta.total} bloco(s) disponibilizado(s) pra sua área`
      : 'Nenhum bloco disponibilizado pra sua área'
  }
}

function renderizarListaHistorico(termo: string): void {
  const listaRecentes = document.getElementById('lista-recentes')
  if (!listaRecentes || !baseUrlSeiAtual) return
  listaRecentes.innerHTML = ''
  filtrarHistoricoPorTexto(historicoCompleto, termo).forEach((entradaHistorico) => {
    listaRecentes.appendChild(montarItemHistorico(entradaHistorico, baseUrlSeiAtual!))
  })
}

async function render(): Promise<void> {
  try {
    const localConfig = await createLocalConfigStore().get()

    const syncConfig = await createSyncConfigStore().get()
    const botaoDashboard = document.getElementById('abrir-dashboard') as HTMLButtonElement | null
    if (botaoDashboard && syncConfig.dashboard?.ativo) {
      botaoDashboard.style.display = ''
      const iconeDashboard = document.getElementById('icone-dashboard')
      if (iconeDashboard) iconeDashboard.innerHTML = layoutDashboardIconSvg
      botaoDashboard.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html') })
      })
    }

    const consulta = await consultarBlocosAoVivo(localConfig.baseUrlSei)
    renderizarStatus(consulta)

    historicoCompleto = localConfig.historicoProcessosVisitados ?? []
    baseUrlSeiAtual = localConfig.baseUrlSei
    const secaoHistorico = document.getElementById('historico')
    if (secaoHistorico && historicoCompleto.length > 0 && baseUrlSeiAtual) {
      renderizarListaHistorico('')
      secaoHistorico.classList.add('visivel')
      document.getElementById('historico-busca')?.addEventListener('input', (evento) => {
        renderizarListaHistorico((evento.target as HTMLInputElement).value)
      })
    }

    const iconeOpcoes = document.getElementById('icone-opcoes')
    if (iconeOpcoes) iconeOpcoes.innerHTML = settingsIconSvg
  } catch (error) {
    console.error('[SEIRMG] Falha ao renderizar popup:', error)
  }
}

document.getElementById('abrir-opcoes')?.addEventListener('click', () => {
  chrome.runtime.openOptionsPage()
})

render()
