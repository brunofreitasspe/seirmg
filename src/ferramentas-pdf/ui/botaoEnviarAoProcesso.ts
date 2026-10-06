// Afordância compartilhada entre as ferramentas de PDF pra "Enviar ao processo aberto no SEI",
// alternativa ao download simples. Só aparece quando a página foi aberta com ?idProcedimento=...
// na URL (link acrescentado em content-scripts/procedimento_visualizar/index.ts, análogo ao item
// de menu "Ferramentas do Processo" do seipro) -- sem esse parâmetro não há processo-alvo, então
// nem vale a pena montar o botão.
import { enviarPdfAoProcesso } from '../enviarAoProcesso'
import { TIPO_RECARREGAR_ARVORE, type MensagemRecarregarArvore } from '../../features/ferramentas-pdf/recarregarArvore'
import { createLocalConfigStore } from '../../lib/storage'

// Melhor esforço: avisa as abas do SEI pra árvore do processo mostrar o documento novo. Abas sem
// o content script (ou em outro processo) simplesmente ignoram/rejeitam -- não é erro do envio.
async function pedirRecarregarArvore(idProcedimento: string): Promise<void> {
  const { baseUrlSei } = await createLocalConfigStore().get()
  if (!baseUrlSei) return
  const abas = await chrome.tabs.query({ url: `${new URL(baseUrlSei).origin}/*` })
  const mensagem: MensagemRecarregarArvore = { type: TIPO_RECARREGAR_ARVORE, idProcedimento }
  await Promise.all(
    abas.map((aba) => (aba.id === undefined ? undefined : chrome.tabs.sendMessage(aba.id, mensagem).catch(() => undefined)))
  )
}

export function obterIdProcedimentoDaUrl(): string | null {
  return new URL(window.location.href).searchParams.get('idProcedimento')
}

// URL assinada de "Incluir Documento" repassada pelo atalho da árvore (ver enviarAoProcesso.ts).
function obterUrlIncluirDaUrl(): string | null {
  return new URL(window.location.href).searchParams.get('urlIncluir')
}

export interface OpcoesBotaoEnviarAoProcesso {
  nomeArquivoPadrao: string
  // Texto do botão -- ex.: "Enviar parte 2 ao processo" quando há vários resultados (dividir).
  rotulo?: string
  // Lazy: cada clique relê o resultado mais recente -- a ferramenta pode ter sido usada de novo
  // (novo arquivo, novas tarjas, etc.) entre a primeira renderização do botão e o clique.
  obterBytes: () => Uint8Array | null
}

// Retorna null quando não há idProcedimento na URL -- o chamador simplesmente não anexa nada ao
// container nesse caso (a ferramenta continua funcionando só com download, como antes).
export function criarBotaoEnviarAoProcesso(opcoes: OpcoesBotaoEnviarAoProcesso): HTMLDivElement | null {
  const idProcedimento = obterIdProcedimentoDaUrl()
  if (!idProcedimento) return null
  const urlIncluir = obterUrlIncluirDaUrl()

  const wrapper = document.createElement('div')
  wrapper.className = 'seirmg-enviar-ao-processo'

  const botao = document.createElement('button')
  botao.type = 'button'
  botao.textContent = opcoes.rotulo ?? 'Enviar ao processo aberto no SEI'

  const status = document.createElement('span')
  status.className = 'seirmg-enviar-ao-processo-status'

  botao.addEventListener('click', () => {
    const bytes = opcoes.obterBytes()
    if (!bytes) {
      status.textContent = 'Gere o resultado antes de enviar.'
      return
    }

    if (!urlIncluir) {
      status.textContent = 'Link do processo ausente. Reabra as Ferramentas de PDF pelo atalho na árvore do processo.'
      return
    }

    botao.disabled = true
    status.textContent = 'Enviando ao processo...'

    enviarPdfAoProcesso({ urlIncluir, nomeArquivo: opcoes.nomeArquivoPadrao, bytes })
      .then((resultado) => {
        if (resultado.ok) {
          status.textContent = 'Enviado com sucesso ao processo aberto no SEI.'
          pedirRecarregarArvore(idProcedimento).catch((error) => {
            console.error('[SEIRMG] Falha ao pedir recarga da árvore do processo:', error)
          })
          return
        }
        status.textContent = `Falha ao enviar: ${resultado.error}`
        botao.disabled = false
      })
      .catch((error) => {
        console.error('[SEIRMG] Falha ao enviar PDF ao processo:', error)
        status.textContent = `Falha ao enviar: ${error instanceof Error ? error.message : String(error)}`
        botao.disabled = false
      })
  })

  wrapper.append(botao, status)
  return wrapper
}
