import { comprimirPdf } from '../../features/ferramentas-pdf/comprimir'
import { criarPainelResultado } from '../ui/resultado'
import {
  comCarregando,
  criarBarraAcoes,
  criarBotao,
  criarEtapa,
  criarMensagem,
  criarSeletorArquivos,
  formatarBytes,
  lerBytes,
  montarEstruturaFerramenta,
  nomeBase,
} from '../ui/kit'

export function montar(container: HTMLElement): void {
  const corpo = montarEstruturaFerramenta(container, 'comprimir')

  const etapa = criarEtapa(1, 'Escolha o PDF')
  const seletor = criarSeletorArquivos({
    aceitar: 'application/pdf,.pdf',
    titulo: 'Clique pra escolher o PDF',
    dica: 'ou arraste o arquivo pra cá',
  })
  const botao = criarBotao('Comprimir PDF', { variante: 'primario' })
  botao.disabled = true
  const mensagem = criarMensagem()
  etapa.corpo.append(seletor.elemento, criarBarraAcoes(botao), mensagem.elemento)

  const resultado = criarPainelResultado(2)
  corpo.append(etapa.secao, resultado.elemento)

  seletor.aoMudar((arquivos) => {
    botao.disabled = arquivos.length === 0
    resultado.limpar()
    mensagem.limpar()
  })

  botao.addEventListener('click', async () => {
    mensagem.limpar()
    resultado.limpar()
    const [arquivo] = seletor.obterArquivos()
    if (!arquivo) return
    await comCarregando(botao, 'Comprimindo...', async () => {
      try {
        const { bytes, tamanhoOriginal, tamanhoFinal } = await comprimirPdf(await lerBytes(arquivo))
        if (tamanhoFinal >= tamanhoOriginal) {
          // Compressão estrutural não mexe em imagens: PDF já enxuto (ou escaneado) não diminui.
          mensagem.mostrar(
            'info',
            `Este arquivo já está otimizado (${formatarBytes(tamanhoOriginal)}): a compressão estrutural não reduziu o tamanho. PDFs escaneados costumam ser grandes por causa das imagens, que esta ferramenta não recomprime.`
          )
          return
        }
        const economia = Math.round((1 - tamanhoFinal / tamanhoOriginal) * 100)
        resultado.mostrar([
          {
            nome: `${nomeBase(arquivo)}-comprimido.pdf`,
            bytes,
            detalhe: `antes ${formatarBytes(tamanhoOriginal)} · ${economia}% menor`,
          },
        ])
      } catch (error) {
        console.error('[SEIRMG] Falha ao comprimir PDF:', error)
        mensagem.mostrar('erro', 'Não foi possível comprimir. Confira se é um PDF válido e sem senha.')
      }
    })
  })
}
