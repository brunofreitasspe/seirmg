import { diagnosticarPdfA } from '../../features/ferramentas-pdf/pdfa'
import { ICONES } from '../ui/icones'
import {
  comCarregando,
  criarAviso,
  criarBarraAcoes,
  criarBotao,
  criarElemento,
  criarEtapa,
  criarIcone,
  criarMensagem,
  criarSeletorArquivos,
  lerBytes,
  montarEstruturaFerramenta,
} from '../ui/kit'

export function montar(container: HTMLElement): void {
  const corpo = montarEstruturaFerramenta(container, 'pdfa')

  const etapa1 = criarEtapa(1, 'Escolha o PDF')
  const seletor = criarSeletorArquivos({
    aceitar: 'application/pdf,.pdf',
    titulo: 'Clique pra escolher o PDF',
    dica: 'ou arraste o arquivo pra cá',
  })
  const botao = criarBotao('Diagnosticar', { variante: 'primario' })
  botao.disabled = true
  const mensagem = criarMensagem()
  etapa1.corpo.append(
    criarAviso(
      'info',
      'Este diagnóstico não converte o arquivo nem é um laudo de conformidade: aponta o que costuma impedir o aceite como PDF/A. A referência oficial é o veraPDF, que não roda no navegador.'
    ),
    seletor.elemento,
    criarBarraAcoes(botao),
    mensagem.elemento
  )

  const etapa2 = criarEtapa(2, 'Diagnóstico')
  etapa2.secao.hidden = true
  corpo.append(etapa1.secao, etapa2.secao)

  seletor.aoMudar((arquivos) => {
    botao.disabled = arquivos.length === 0
    etapa2.secao.hidden = true
    mensagem.limpar()
  })

  botao.addEventListener('click', async () => {
    mensagem.limpar()
    const [arquivo] = seletor.obterArquivos()
    if (!arquivo) return
    await comCarregando(botao, 'Analisando...', async () => {
      try {
        const { verificacoes } = await diagnosticarPdfA(await lerBytes(arquivo))
        const aprovadas = verificacoes.filter((v) => v.ok).length

        const lista = criarElemento('ul', 'checklist')
        for (const verificacao of verificacoes) {
          const item = criarElemento('li', `checklist-item ${verificacao.ok ? 'ok' : 'falha'}`)
          const textos = criarElemento('div')
          textos.append(criarElemento('strong', undefined, verificacao.titulo), criarElemento('span', undefined, verificacao.explicacao))
          item.append(criarIcone(verificacao.ok ? ICONES.circleCheck : ICONES.circleX), textos)
          lista.append(item)
        }

        const resumo =
          aprovadas === verificacoes.length
            ? criarAviso('sucesso', `Nenhum impedimento encontrado nas ${verificacoes.length} verificações.`)
            : criarAviso('aviso', `${verificacoes.length - aprovadas} de ${verificacoes.length} verificações apontam problema.`)
        etapa2.corpo.replaceChildren(resumo, lista)
        etapa2.secao.hidden = false
      } catch (error) {
        console.error('[SEIRMG] Falha no diagnóstico PDF/A:', error)
        mensagem.mostrar('erro', 'Não foi possível analisar o arquivo. Confira se é um PDF válido.')
      }
    })
  })
}
