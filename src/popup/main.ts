import { createLocalConfigStore, type HistoricoProcessoEntry } from '../lib/storage'
import checkIconSvg from 'lucide-static/icons/check.svg?raw'
import alertIconSvg from 'lucide-static/icons/triangle-alert.svg?raw'
import infoIconSvg from 'lucide-static/icons/info.svg?raw'
import externalLinkIconSvg from 'lucide-static/icons/external-link.svg?raw'
import settingsIconSvg from 'lucide-static/icons/settings.svg?raw'

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

type ConsultaBlocos = { ok: true; total: number } | { ok: false }

async function consultarBlocosAoVivo(baseUrlSei: string | undefined): Promise<ConsultaBlocos> {
  if (!baseUrlSei) return { ok: false }
  try {
    const [aba] = await chrome.tabs.query({ url: `${baseUrlSei}/*` })
    if (!aba?.id) return { ok: false }
    const resposta = await chrome.tabs.sendMessage(aba.id, {
      type: 'seirmg:consultar-blocos-disponibilizados',
    })
    if (!resposta?.ok || typeof resposta.total !== 'number') return { ok: false }
    return { ok: true, total: resposta.total }
  } catch (error) {
    console.error('[SEIRMG] Falha ao consultar blocos de assinatura ao vivo:', error)
    return { ok: false }
  }
}

function renderizarStatus(consulta: ConsultaBlocos): void {
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

async function render(): Promise<void> {
  try {
    const localConfig = await createLocalConfigStore().get()

    const consulta = await consultarBlocosAoVivo(localConfig.baseUrlSei)
    renderizarStatus(consulta)

    const historico = localConfig.historicoProcessosVisitados ?? []
    const baseUrlSei = localConfig.baseUrlSei
    const secaoHistorico = document.getElementById('historico')
    const listaRecentes = document.getElementById('lista-recentes')
    if (secaoHistorico && listaRecentes && historico.length > 0 && baseUrlSei) {
      historico.forEach((entradaHistorico) => {
        listaRecentes.appendChild(montarItemHistorico(entradaHistorico, baseUrlSei))
      })
      secaoHistorico.classList.add('visivel')
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
