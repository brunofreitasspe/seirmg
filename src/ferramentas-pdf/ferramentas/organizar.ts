import { organizarPaginas } from '../../features/ferramentas-pdf/organizar'
import { ICONES } from '../ui/icones'
import { abrirPdf, escalaParaLargura, renderizarPagina } from '../ui/pdfjs'
import { criarPainelResultado } from '../ui/resultado'
import {
  comCarregando,
  criarBarraAcoes,
  criarBotao,
  criarBotaoIcone,
  criarElemento,
  criarEtapa,
  criarMensagem,
  criarSeletorArquivos,
  lerBytes,
  montarEstruturaFerramenta,
  nomeBase,
  rotuloPaginas,
} from '../ui/kit'

const LARGURA_MINIATURA = 120

export function montar(container: HTMLElement): void {
  const corpo = montarEstruturaFerramenta(container, 'organizar')

  const etapa1 = criarEtapa(1, 'Escolha o PDF')
  const seletor = criarSeletorArquivos({
    aceitar: 'application/pdf,.pdf',
    titulo: 'Clique pra escolher o PDF',
    dica: 'ou arraste o arquivo pra cá',
  })
  const mensagemArquivo = criarMensagem()
  etapa1.corpo.append(seletor.elemento, mensagemArquivo.elemento)

  const etapa2 = criarEtapa(2, 'Reordene ou remova páginas')
  etapa2.secao.hidden = true
  const resumo = criarElemento('div', 'resumo-numeros')
  const restaurar = criarBotao('Restaurar ordem original', { variante: 'fantasma', icone: ICONES.rotateCcw })
  const grade = criarElemento('div', 'miniaturas')
  const botao = criarBotao('Salvar PDF organizado', { variante: 'primario' })
  const mensagem = criarMensagem()
  etapa2.corpo.append(criarBarraAcoes(resumo, restaurar), grade, criarBarraAcoes(botao), mensagem.elemento)

  const resultado = criarPainelResultado(3)
  corpo.append(etapa1.secao, etapa2.secao, resultado.elemento)

  let arquivoAtual: File | null = null
  let bytesOriginais: Uint8Array | null = null
  let totalPaginas = 0
  let ordem: number[] = []
  // Uma miniatura (canvas) por página original, criada uma vez só -- reordenar só move os nós.
  let miniaturas = new Map<number, HTMLCanvasElement>()

  function renderizarGrade(): void {
    resultado.limpar()
    grade.replaceChildren()
    ordem.forEach((paginaOriginal, posicao) => {
      const cartao = criarElemento('div', 'miniatura')
      const imagem = criarElemento('div', 'miniatura-imagem')
      const canvas = miniaturas.get(paginaOriginal)
      if (canvas) imagem.append(canvas)
      imagem.append(criarElemento('span', 'miniatura-posicao', String(posicao + 1)))

      const rodape = criarElemento('div', 'miniatura-rodape')
      const anterior = criarBotaoIcone(ICONES.chevronLeft, `Mover página ${paginaOriginal + 1} pra antes`)
      anterior.disabled = posicao === 0
      anterior.addEventListener('click', () => mover(posicao, posicao - 1))
      const proxima = criarBotaoIcone(ICONES.chevronRight, `Mover página ${paginaOriginal + 1} pra depois`)
      proxima.disabled = posicao === ordem.length - 1
      proxima.addEventListener('click', () => mover(posicao, posicao + 1))
      const remover = criarBotaoIcone(ICONES.trash, `Remover página ${paginaOriginal + 1}`)
      remover.disabled = ordem.length === 1
      remover.addEventListener('click', () => {
        ordem = ordem.filter((_, i) => i !== posicao)
        renderizarGrade()
      })
      rodape.append(anterior, criarElemento('span', 'miniatura-rotulo', `pág. ${paginaOriginal + 1}`), proxima, remover)

      cartao.append(imagem, rodape)
      grade.append(cartao)
    })

    const removidas = totalPaginas - ordem.length
    resumo.replaceChildren(
      criarElemento('strong', undefined, rotuloPaginas(ordem.length)),
      removidas > 0 ? `${removidas} removida(s)` : 'nenhuma removida'
    )
    restaurar.hidden = ordem.length === totalPaginas && ordem.every((pagina, i) => pagina === i)
  }

  function mover(de: number, para: number): void {
    if (para < 0 || para >= ordem.length) return
    ;[ordem[de], ordem[para]] = [ordem[para], ordem[de]]
    renderizarGrade()
  }

  restaurar.addEventListener('click', () => {
    ordem = Array.from({ length: totalPaginas }, (_, i) => i)
    renderizarGrade()
  })

  seletor.aoMudar(async ([arquivo]) => {
    mensagemArquivo.limpar()
    mensagem.limpar()
    resultado.limpar()
    etapa2.secao.hidden = true
    arquivoAtual = arquivo ?? null
    bytesOriginais = null
    if (!arquivo) return
    try {
      const bytes = await lerBytes(arquivo)
      const pdf = await abrirPdf(bytes)
      if (arquivoAtual !== arquivo) return // trocou de arquivo enquanto carregava
      bytesOriginais = bytes
      totalPaginas = pdf.numPages
      ordem = Array.from({ length: totalPaginas }, (_, i) => i)
      miniaturas = new Map()
      etapa2.secao.hidden = false
      renderizarGrade()

      // Miniaturas aparecem progressivamente, sem travar a interação com a grade.
      for (let numero = 1; numero <= totalPaginas; numero++) {
        if (arquivoAtual !== arquivo) return
        const pagina = await pdf.getPage(numero)
        const { canvas } = await renderizarPagina(pagina, escalaParaLargura(pagina, LARGURA_MINIATURA))
        miniaturas.set(numero - 1, canvas)
        const posicao = ordem.indexOf(numero - 1)
        if (posicao >= 0) grade.children[posicao]?.querySelector('.miniatura-imagem')?.prepend(canvas)
      }
    } catch (error) {
      console.error('[SEIRMG] Falha ao ler PDF para organizar:', error)
      mensagemArquivo.mostrar('erro', 'Não foi possível ler o arquivo. Confira se é um PDF válido e sem senha.')
    }
  })

  botao.addEventListener('click', async () => {
    mensagem.limpar()
    if (!bytesOriginais || !arquivoAtual) return
    const original = bytesOriginais
    const base = nomeBase(arquivoAtual)
    await comCarregando(botao, 'Salvando...', async () => {
      try {
        const bytes = await organizarPaginas(original, ordem)
        resultado.mostrar([{ nome: `${base}-organizado.pdf`, bytes, detalhe: rotuloPaginas(ordem.length) }])
      } catch (error) {
        console.error('[SEIRMG] Falha ao organizar páginas:', error)
        mensagem.mostrar('erro', 'Não foi possível salvar o PDF organizado.')
      }
    })
  })
}
