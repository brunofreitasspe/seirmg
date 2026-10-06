import { criarReconhecedorOcr, montarTextoPorPagina } from '../../features/ferramentas-pdf/ocr'
import { ICONES } from '../ui/icones'
import { abrirPdf, renderizarPagina, type PDFDocumentProxy } from '../ui/pdfjs'
import {
  baixarArquivo,
  comCarregando,
  criarBarraAcoes,
  criarBotao,
  criarElemento,
  criarEtapa,
  criarMensagem,
  criarProgresso,
  criarSeletorArquivos,
  lerBytes,
  montarEstruturaFerramenta,
  nomeBase,
} from '../ui/kit'

// Escala 2 (~144 dpi): resolução boa pro reconhecimento sem pesar demais.
async function paginaParaPng(pdf: PDFDocumentProxy, numero: number): Promise<Uint8Array> {
  const { canvas } = await renderizarPagina(await pdf.getPage(numero), 2)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar imagem da página.'))), 'image/png')
  )
  return new Uint8Array(await blob.arrayBuffer())
}

export function montar(container: HTMLElement): void {
  const corpo = montarEstruturaFerramenta(container, 'ocr')

  const etapa1 = criarEtapa(1, 'Escolha o PDF escaneado')
  const seletor = criarSeletorArquivos({
    aceitar: 'application/pdf,.pdf',
    titulo: 'Clique pra escolher o PDF',
    dica: 'ou arraste o arquivo pra cá. Reconhecimento em português.',
  })
  const botao = criarBotao('Reconhecer texto', { variante: 'primario' })
  botao.disabled = true
  const progresso = criarProgresso()
  const mensagem = criarMensagem()
  etapa1.corpo.append(seletor.elemento, criarBarraAcoes(botao), progresso.elemento, mensagem.elemento)

  const etapa2 = criarEtapa(2, 'Texto reconhecido')
  etapa2.secao.classList.add('etapa-resultado')
  etapa2.secao.hidden = true
  const texto = criarElemento('textarea', 'ocr-texto')
  texto.spellcheck = false
  const copiar = criarBotao('Copiar texto', { icone: ICONES.copy })
  const baixarTxt = criarBotao('Baixar .txt', { icone: ICONES.download })
  etapa2.corpo.append(texto, criarBarraAcoes(copiar, baixarTxt))
  corpo.append(etapa1.secao, etapa2.secao)

  let nomeTxt = 'texto-reconhecido.txt'

  seletor.aoMudar((arquivos) => {
    botao.disabled = arquivos.length === 0
    mensagem.limpar()
    progresso.ocultar()
  })

  copiar.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(texto.value)
      const rotulo = copiar.querySelector('.btn-texto')
      if (rotulo) {
        rotulo.textContent = 'Copiado!'
        setTimeout(() => (rotulo.textContent = 'Copiar texto'), 1500)
      }
    } catch {
      texto.select()
    }
  })
  baixarTxt.addEventListener('click', () => baixarArquivo(texto.value, nomeTxt, 'text/plain;charset=utf-8'))

  botao.addEventListener('click', async () => {
    mensagem.limpar()
    const [arquivo] = seletor.obterArquivos()
    if (!arquivo) return
    nomeTxt = `${nomeBase(arquivo)}.txt`
    await comCarregando(botao, 'Reconhecendo...', async () => {
      try {
        const pdf = await abrirPdf(await lerBytes(arquivo))
        const total = pdf.numPages
        progresso.definir(0, 'Preparando o reconhecimento (na primeira vez baixa o modelo de português, pode demorar um pouco)...')

        let paginaAtual = 1
        const reconhecedor = await criarReconhecedorOcr((fracao) => {
          progresso.definir((paginaAtual - 1 + fracao) / total, `Página ${paginaAtual} de ${total} — ${Math.round(fracao * 100)}%`)
        })
        const textos: string[] = []
        try {
          for (; paginaAtual <= total; paginaAtual++) {
            progresso.definir((paginaAtual - 1) / total, `Página ${paginaAtual} de ${total} — preparando imagem`)
            textos.push(await reconhecedor.reconhecer(await paginaParaPng(pdf, paginaAtual)))
          }
        } finally {
          await reconhecedor.encerrar()
        }

        progresso.definir(1, `Concluído: ${total} página(s) reconhecida(s).`)
        texto.value = montarTextoPorPagina(textos)
        etapa2.secao.hidden = false
        etapa2.secao.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      } catch (error) {
        console.error('[SEIRMG] Falha no OCR:', error)
        progresso.ocultar()
        mensagem.mostrar('erro', 'Não foi possível reconhecer o texto. Veja o console (F12) pra detalhes.')
      }
    })
  })
}
