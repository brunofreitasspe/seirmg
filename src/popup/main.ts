import { createLocalConfigStore } from '../lib/storage'

async function abrirOuFocarAba(baseUrlSei: string, url: string): Promise<void> {
  const [abaExistente] = await chrome.tabs.query({ url: `${baseUrlSei}/*` })

  if (abaExistente?.id) {
    chrome.tabs.update(abaExistente.id, { active: true, url })
    if (abaExistente.windowId) chrome.windows.update(abaExistente.windowId, { focused: true })
  } else {
    chrome.tabs.create({ url })
  }
}

async function render(): Promise<void> {
  try {
    const localConfig = await createLocalConfigStore().get()
    const total = localConfig.blocoAssinaturaPendenteAtual.length

    const status = document.getElementById('status')
    const contagem = document.getElementById('contagem')
    if (status) status.textContent = total > 0 ? 'Pendências encontradas' : 'Tudo em dia'
    if (contagem) {
      contagem.textContent = total > 0 ? `${total} bloco(s) com pendência de assinatura` : ''
    }

    const totalProcessos = localConfig.processosNovosBadgeCount
    const statusProcessos = document.getElementById('status-processos')
    const contagemProcessos = document.getElementById('contagem-processos')
    if (statusProcessos) {
      statusProcessos.textContent =
        totalProcessos > 0 ? 'Processos novos encontrados' : 'Nenhum processo novo'
    }
    if (contagemProcessos) {
      contagemProcessos.textContent =
        totalProcessos > 0 ? `${totalProcessos} processo(s) não visualizado(s)` : ''
    }

    if (totalProcessos > 0) {
      await createLocalConfigStore().set({ ...localConfig, processosNovosBadgeCount: 0 })
      chrome.action.setBadgeText({ text: '' })
    }
  } catch (error) {
    console.error('[SEIRMG] Falha ao renderizar popup:', error)
  }
}

document.getElementById('abrir-bloco')?.addEventListener('click', async () => {
  try {
    const localConfig = await createLocalConfigStore().get()
    if (!localConfig.baseUrlSei) return
    await abrirOuFocarAba(
      localConfig.baseUrlSei,
      `${localConfig.baseUrlSei}/controlador.php?acao=bloco_assinatura_listar`
    )
  } catch (error) {
    console.error('[SEIRMG] Falha ao abrir bloco de assinatura:', error)
  }
})

document.getElementById('abrir-processos')?.addEventListener('click', async () => {
  try {
    const localConfig = await createLocalConfigStore().get()
    if (!localConfig.baseUrlSei) return
    await abrirOuFocarAba(
      localConfig.baseUrlSei,
      `${localConfig.baseUrlSei}/controlador.php?acao=procedimento_controlar`
    )
  } catch (error) {
    console.error('[SEIRMG] Falha ao abrir Controle de Processos:', error)
  }
})

render()
