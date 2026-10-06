// Etapa final comum a todas as ferramentas que geram PDF: lista o(s) arquivo(s) gerado(s), cada um
// com "Baixar" e -- quando a página foi aberta pelo atalho da árvore do processo -- "Enviar ao
// processo" (documento externo, ver enviarAoProcesso.ts). Em modo avulso, explica como habilitar.
import { lerContextoProcesso } from '../../features/ferramentas-pdf/contexto'
import { TIPO_RECARREGAR_ARVORE, type MensagemRecarregarArvore } from '../../features/ferramentas-pdf/recarregarArvore'
import { createLocalConfigStore } from '../../lib/storage'
import { enviarPdfAoProcesso } from '../enviarAoProcesso'
import { ICONES } from './icones'
import { baixarArquivo, comCarregando, criarAviso, criarBotao, criarElemento, criarEtapa, criarIcone, formatarBytes } from './kit'

export interface ItemResultado {
  nome: string
  bytes: Uint8Array
  detalhe?: string
}

export interface PainelResultado {
  elemento: HTMLElement
  mostrar: (itens: ItemResultado[]) => void
  limpar: () => void
}

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

function criarBotaoEnviar(item: ItemResultado, status: HTMLElement): HTMLButtonElement | null {
  const contexto = lerContextoProcesso(window.location.search)
  if (!contexto) return null

  const botao = criarBotao('Enviar ao processo', { variante: 'primario', icone: ICONES.send })
  botao.addEventListener('click', async () => {
    status.replaceChildren()
    if (!contexto.urlIncluir) {
      status.append(criarAviso('erro', 'Link do processo ausente. Reabra as Ferramentas de PDF pelo atalho na árvore do processo.'))
      return
    }
    const urlIncluir = contexto.urlIncluir
    const resultado = await comCarregando(botao, 'Enviando...', () =>
      enviarPdfAoProcesso({ urlIncluir, nomeArquivo: item.nome, bytes: item.bytes }).catch((error: unknown) => ({
        ok: false as const,
        error: error instanceof Error ? error.message : String(error),
      }))
    )
    if (!resultado.ok) {
      console.error('[SEIRMG] Falha ao enviar PDF ao processo:', resultado.error)
      status.append(criarAviso('erro', `Não foi possível enviar: ${resultado.error}`))
      return
    }
    // Enviado: o botão vira um selo, pra não duplicar o documento com um segundo clique.
    const selo = criarElemento('span', 'selo selo-sucesso')
    selo.append(criarIcone(ICONES.check), 'Enviado ao processo')
    botao.replaceWith(selo)
    pedirRecarregarArvore(contexto.idProcedimento).catch((error) => {
      console.error('[SEIRMG] Falha ao pedir recarga da árvore do processo:', error)
    })
  })
  return botao
}

function criarLinhaResultado(item: ItemResultado): HTMLLIElement {
  const linha = criarElemento('li', 'resultado-item')
  const principal = criarElemento('div', 'resultado-principal')
  const info = criarElemento('div', 'arquivo-info')
  info.append(
    criarElemento('span', 'arquivo-nome', item.nome),
    criarElemento('span', 'arquivo-tamanho', [formatarBytes(item.bytes.length), item.detalhe].filter(Boolean).join(' · '))
  )
  principal.append(criarIcone(ICONES.fileText, 'resultado-icone'), info)

  const acoes = criarElemento('div', 'resultado-acoes')
  const status = criarElemento('div', 'resultado-status')
  const baixar = criarBotao('Baixar', { icone: ICONES.download })
  baixar.addEventListener('click', () => baixarArquivo(item.bytes, item.nome))
  acoes.append(baixar)
  const enviar = criarBotaoEnviar(item, status)
  if (enviar) acoes.append(enviar)

  principal.append(acoes)
  linha.append(principal, status)
  return linha
}

export function criarPainelResultado(numeroEtapa: number): PainelResultado {
  const { secao, corpo } = criarEtapa(numeroEtapa, 'Resultado')
  secao.classList.add('etapa-resultado')
  secao.hidden = true

  return {
    elemento: secao,
    mostrar: (itens) => {
      corpo.replaceChildren()
      const lista = criarElemento('ul', 'resultado-lista')
      itens.forEach((item) => lista.append(criarLinhaResultado(item)))
      corpo.append(lista)

      if (itens.length > 1) {
        const todos = criarBotao(`Baixar todos (${itens.length})`, { variante: 'fantasma', icone: ICONES.download })
        todos.addEventListener('click', () => itens.forEach((item) => baixarArquivo(item.bytes, item.nome)))
        corpo.append(todos)
      }
      if (!lerContextoProcesso(window.location.search)) {
        const dica = criarElemento('p', 'dica-avulso')
        dica.append(
          criarIcone(ICONES.link),
          'Pra enviar direto a um processo do SEI, abra as Ferramentas de PDF pelo atalho na árvore do processo.'
        )
        corpo.append(dica)
      }
      secao.hidden = false
      secao.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    },
    limpar: () => {
      secao.hidden = true
      corpo.replaceChildren()
    },
  }
}
