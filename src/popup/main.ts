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

document.getElementById('abrir-opcoes')?.addEventListener('click', () => {
  chrome.runtime.openOptionsPage()
})

render()
