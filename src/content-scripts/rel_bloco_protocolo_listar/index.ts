import { parseBlocoAssinaturaTable } from '../../features/bloco-assinatura/parser'
import {
  deveSelecionar,
  encontrarCargoAssinante,
  encontrarIndiceColunaAssinaturas,
  extrairNomeUsuario,
  marcarCheckboxComoJaAssinado,
  tituloCheckboxJaAssinadoPorCargo,
  type TipoSelecaoDocumentos,
} from '../../features/bloco-assinatura/selecaoDocumentos'
import { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'
import { renderBadge } from '../core/badge'

const ID_SELECAO_DOCUMENTOS = 'seirmg-selecao-documentos-assinar'

async function processarPagina(): Promise<void> {
  try {
    const localConfig = await createLocalConfigStore().get()
    const itens = parseBlocoAssinaturaTable(document, {
      seiVersionAtLeast4: localConfig.seiVersionAtLeast4 ?? true,
    })

    chrome.runtime
      .sendMessage({ type: 'seirmg:bloco-assinatura:itens', itens })
      .catch((error) => {
        console.error('[SEIRMG] Falha ao enviar itens do bloco de assinatura:', error)
      })

    await renderBadge()
  } catch (error) {
    console.error('[SEIRMG] Falha ao processar página de bloco de assinatura:', error)
  }
}

function estaNaTelaDoBloco(): boolean {
  const barraLocalizacao = document.querySelector('#divInfraBarraLocalizacao')
  return (
    (barraLocalizacao?.textContent?.includes('Bloco de Assinatura') ?? false) &&
    document.querySelector('#btnAssinar') !== null
  )
}

function paraCadaLinhaDeDocumento(
  callback: (linha: Element, checkbox: HTMLInputElement, textoAssinaturas: string) => void
): void {
  const tabela = document.querySelector('#divInfraAreaTabela')
  if (!tabela) return

  const cabecalhos = Array.from(tabela.querySelectorAll('tr > th')).map(
    (th) => th.textContent?.trim() ?? ''
  )
  const indiceAssinaturas = encontrarIndiceColunaAssinaturas(cabecalhos)

  const linhas = tabela.querySelectorAll('tbody > tr[id^="trSeq"], tbody > tr[id^="trPos"]')
  linhas.forEach((linha) => {
    const checkbox = linha.querySelector<HTMLInputElement>('input[type="checkbox"]')
    if (!checkbox) return

    const celulaAssinaturas = linha.querySelectorAll('td')[indiceAssinaturas]
    const textoAssinaturas = celulaAssinaturas?.textContent?.trim() ?? ''
    callback(linha, checkbox, textoAssinaturas)
  })
}

function aplicarSelecao(tipo: TipoSelecaoDocumentos, usuario: string): void {
  paraCadaLinhaDeDocumento((_linha, checkbox, textoAssinaturas) => {
    const selecionado = deveSelecionar(tipo, textoAssinaturas, usuario)
    if (selecionado !== checkbox.checked) checkbox.click()
  })
}

function obterNomeUsuarioLogado(): string | null {
  const tituloUsuario = document.querySelector('#lnkUsuarioSistema')?.getAttribute('title') ?? ''
  return extrairNomeUsuario(tituloUsuario)
}

async function montarSelecaoDocumentos(): Promise<void> {
  try {
    const syncConfig = await createSyncConfigStore().get()
    if (!syncConfig.featureFlags.selecaoEmMassaBlocoAssinatura) return

    if (!estaNaTelaDoBloco()) return
    if (document.getElementById(ID_SELECAO_DOCUMENTOS)) return

    const usuario = obterNomeUsuarioLogado()
    if (!usuario) {
      console.error('[SEIRMG] Falha ao obter o nome do usuário para seleção em massa de documentos.')
      return
    }

    const caption = document.querySelector('#divInfraAreaTabela caption.infraCaption')
    if (!caption) return

    const container = document.createElement('div')
    container.id = ID_SELECAO_DOCUMENTOS
    container.innerHTML = `
      <span>Selecionar:</span>
      <a href="#" data-tipo="todos">Todos</a>
      <a href="#" data-tipo="nenhum">Nenhum</a>
      <a href="#" data-tipo="sem-assinatura">Sem nenhuma assinatura</a>
      <a href="#" data-tipo="sem-minha-assinatura">Sem a minha assinatura</a>
      <a href="#" data-tipo="com-minha-assinatura">Com a minha assinatura</a>
    `
    caption.insertAdjacentElement('beforeend', container)

    container.addEventListener('click', (evento) => {
      const alvo = evento.target
      if (!(alvo instanceof HTMLAnchorElement)) return
      evento.preventDefault()

      const tipo = alvo.dataset.tipo as TipoSelecaoDocumentos | undefined
      if (!tipo) return

      aplicarSelecao(tipo, usuario)
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar seleção em massa de documentos:', error)
  }
}

async function aplicarDesabilitacaoAssinados(): Promise<void> {
  try {
    const syncConfig = await createSyncConfigStore().get()
    if (!syncConfig.featureFlags.desabilitarDocumentosAssinados) return

    if (!estaNaTelaDoBloco()) return

    const usuario = obterNomeUsuarioLogado()
    // Config pode ter sido salva antes deste campo existir — trata como "nenhum cargo".
    const cargos = (syncConfig.blocoAssinatura.cargosAdicionais ?? []).filter((cargo) => cargo.trim() !== '')
    if (!usuario && cargos.length === 0) return

    paraCadaLinhaDeDocumento((_linha, checkbox, textoAssinaturas) => {
      if (usuario && deveSelecionar('com-minha-assinatura', textoAssinaturas, usuario)) {
        marcarCheckboxComoJaAssinado(checkbox)
        return
      }

      const cargoAssinante = encontrarCargoAssinante(textoAssinaturas, cargos)
      if (cargoAssinante) {
        marcarCheckboxComoJaAssinado(checkbox, tituloCheckboxJaAssinadoPorCargo(cargoAssinante))
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao desabilitar checkboxes de documentos já assinados:', error)
  }
}

async function aplicarOcultacaoAssinados(): Promise<void> {
  try {
    const syncConfig = await createSyncConfigStore().get()
    if (!syncConfig.featureFlags.ocultarDocumentosAssinados) return

    if (!estaNaTelaDoBloco()) return

    const usuario = obterNomeUsuarioLogado()
    const cargos = (syncConfig.blocoAssinatura.cargosAdicionais ?? []).filter((cargo) => cargo.trim() !== '')
    if (!usuario && cargos.length === 0) return

    paraCadaLinhaDeDocumento((linha, _checkbox, textoAssinaturas) => {
      const assinadoPorMim = usuario ? deveSelecionar('com-minha-assinatura', textoAssinaturas, usuario) : false
      const cargoAssinante = encontrarCargoAssinante(textoAssinaturas, cargos)

      if (assinadoPorMim || cargoAssinante) {
        ;(linha as HTMLElement).style.display = 'none'
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao ocultar documentos já assinados:', error)
  }
}

processarPagina()
montarSelecaoDocumentos()
aplicarDesabilitacaoAssinados()
aplicarOcultacaoAssinados()

const areaTabela = document.querySelector('#divInfraAreaTabela')
if (areaTabela) {
  const observer = new MutationObserver(() => {
    processarPagina()
    aplicarDesabilitacaoAssinados()
    aplicarOcultacaoAssinados()
  })
  observer.observe(areaTabela, { childList: true, subtree: true })
}
