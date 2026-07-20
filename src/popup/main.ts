import { createLocalConfigStore, type HistoricoProcessoEntry } from '../lib/storage'
import checkIconSvg from 'lucide-static/icons/check.svg?raw'
import alertIconSvg from 'lucide-static/icons/triangle-alert.svg?raw'
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

async function render(): Promise<void> {
  try {
    const localConfig = await createLocalConfigStore().get()
    const total = localConfig.blocoAssinaturaPendenteAtual.length
    const pendente = total > 0

    const status = document.getElementById('status')
    const statusIcone = document.getElementById('status-icone')
    const statusTitulo = document.getElementById('status-titulo')
    const statusSub = document.getElementById('status-sub')

    status?.classList.toggle('pendente', pendente)
    if (statusIcone) statusIcone.innerHTML = pendente ? alertIconSvg : checkIconSvg
    if (statusTitulo) {
      statusTitulo.textContent = pendente ? 'Pendências encontradas' : 'Tudo em dia'
      statusTitulo.classList.toggle('pendente-cor', pendente)
    }
    if (statusSub) {
      statusSub.textContent = pendente
        ? `${total} bloco(s) com pendência de assinatura`
        : 'Nenhuma pendência no bloco de assinatura'
    }

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
