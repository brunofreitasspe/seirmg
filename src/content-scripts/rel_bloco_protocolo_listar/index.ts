import { parseBlocoAssinaturaTable } from '../../features/bloco-assinatura/parser'
import { createLocalConfigStore } from '../../lib/storage'
import { renderBadge } from '../core/badge'

async function processarPagina(): Promise<void> {
  try {
    const localConfig = await createLocalConfigStore().get()
    const itens = parseBlocoAssinaturaTable(document, {
      seiVersionAtLeast4: localConfig.seiVersionAtLeast4 ?? true,
    })

    if (itens.length > 0) {
      chrome.runtime.sendMessage({ type: 'seirmg:bloco-assinatura:itens', itens })
    }

    await renderBadge()
  } catch (error) {
    console.error('[SEIRMG] Falha ao processar página de bloco de assinatura:', error)
  }
}

processarPagina()

const areaTabela = document.querySelector('#divInfraAreaTabela')
if (areaTabela) {
  const observer = new MutationObserver(() => {
    processarPagina()
  })
  observer.observe(areaTabela, { childList: true, subtree: true })
}
