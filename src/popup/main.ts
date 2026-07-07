import { createLocalConfigStore } from '../lib/storage'

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
  } catch (error) {
    console.error('[SEIRMG] Falha ao renderizar popup:', error)
  }
}

document.getElementById('abrir-bloco')?.addEventListener('click', async () => {
  try {
    const localConfig = await createLocalConfigStore().get()
    if (!localConfig.baseUrlSei) return

    const url = `${localConfig.baseUrlSei}/controlador.php?acao=bloco_assinatura_listar`
    const [abaExistente] = await chrome.tabs.query({ url: `${localConfig.baseUrlSei}/*` })

    if (abaExistente?.id) {
      chrome.tabs.update(abaExistente.id, { active: true, url })
      if (abaExistente.windowId) chrome.windows.update(abaExistente.windowId, { focused: true })
    } else {
      chrome.tabs.create({ url })
    }
  } catch (error) {
    console.error('[SEIRMG] Falha ao abrir bloco de assinatura:', error)
  }
})

render()
