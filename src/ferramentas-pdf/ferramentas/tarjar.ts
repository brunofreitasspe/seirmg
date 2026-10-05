import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import { aplicarTarjas, type Tarja } from '../../features/ferramentas-pdf/tarjar'
import { encontrarCpfCnpj } from '../../features/ferramentas-pdf/cpfCnpj'

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href

type PDFDocumentProxy = Awaited<ReturnType<typeof getDocument>['promise']>
type PDFPageProxy = Awaited<ReturnType<PDFDocumentProxy['getPage']>>
type PageViewport = ReturnType<PDFPageProxy['getViewport']>

// Cada candidato é uma tarja em potencial -- sugerida (CPF/CNPJ achado no texto) ou desenhada
// a mão pelo usuário -- que só entra em `tarjasConfirmadas` (e portanto no PDF final) depois
// de passar por confirmação explícita. Coordenadas sempre em pontos PDF (origem inferior-
// esquerda), já convertidas na criação -- a UI nunca guarda pixels de canvas como estado.
interface Candidato {
  id: string
  paginaIndex: number
  xPdf: number
  yPdf: number
  larguraPdf: number
  alturaPdf: number
  origem: 'cpf' | 'cnpj' | 'manual'
  valor?: string
  status: 'pendente' | 'confirmada' | 'descartada'
}

const PADDING_SUGESTAO_PT = 1.5
const LIMIAR_ARRASTO_PX = 4

async function sugerirCandidatos(pagina: PDFPageProxy, paginaIndex: number): Promise<Candidato[]> {
  const conteudo = await pagina.getTextContent()
  let texto = ''
  const limites: { inicio: number; fim: number; transform: number[]; largura: number; altura: number }[] = []

  for (const item of conteudo.items) {
    if (!('str' in item) || !('transform' in item)) continue // TextMarkedContent não tem posição
    const inicio = texto.length
    texto += item.str
    limites.push({ inicio, fim: texto.length, transform: item.transform, largura: item.width, altura: item.height || 10 })
  }

  const candidatos: Candidato[] = []
  for (const achado of encontrarCpfCnpj(texto)) {
    const fimAchado = achado.indice + achado.valor.length
    const itensDoAchado = limites.filter((l) => l.inicio < fimAchado && l.fim > achado.indice)
    if (itensDoAchado.length === 0) continue // não deveria acontecer, mas não quebra a UI se acontecer

    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const item of itensDoAchado) {
      const [, , , , e, f] = item.transform
      x0 = Math.min(x0, e)
      y0 = Math.min(y0, f)
      x1 = Math.max(x1, e + item.largura)
      y1 = Math.max(y1, f + item.altura)
    }

    candidatos.push({
      id: `sugestao-${paginaIndex}-${achado.indice}`,
      paginaIndex,
      xPdf: x0 - PADDING_SUGESTAO_PT,
      yPdf: y0 - PADDING_SUGESTAO_PT,
      larguraPdf: x1 - x0 + PADDING_SUGESTAO_PT * 2,
      alturaPdf: y1 - y0 + PADDING_SUGESTAO_PT * 2,
      origem: achado.tipo,
      valor: achado.valor,
      status: 'pendente',
    })
  }
  return candidatos
}

function rotuloOrigem(candidato: Candidato): string {
  if (candidato.origem === 'cpf') return `CPF sugerido: ${candidato.valor}`
  if (candidato.origem === 'cnpj') return `CNPJ sugerido: ${candidato.valor}`
  return 'Área desenhada manualmente'
}

export function montar(container: HTMLElement): void {
  container.innerHTML = `
    <h2>Tarjar (sigilo)</h2>
    <p style="color:#b5530a">
      Atenção: isto cobre a área com um retângulo preto opaco. É suficiente contra visualização e
      impressão normais, mas <strong>não</strong> remove o conteúdo original de dentro do arquivo —
      alguém com outra ferramenta de edição de PDF ainda pode recuperá-lo. Pra sigilo que precisa
      resistir a isso, use a opção "Imagem → PDF" depois de imprimir/capturar a página como imagem.
    </p>
    <input type="file" id="tarjar-arquivo" accept="application/pdf" />
    <p id="tarjar-status"></p>
    <div id="tarjar-paginas"></div>
    <button id="tarjar-aplicar" disabled>Aplicar tarjas confirmadas e baixar</button>
  `

  const input = document.getElementById('tarjar-arquivo') as HTMLInputElement
  const status = document.getElementById('tarjar-status') as HTMLParagraphElement
  const areaPaginas = document.getElementById('tarjar-paginas') as HTMLDivElement
  const botaoAplicar = document.getElementById('tarjar-aplicar') as HTMLButtonElement

  let bytesOriginais: Uint8Array | null = null
  let candidatos: Candidato[] = []
  let proximoIdManual = 0

  // Por página: o viewport (pra converter pixel de canvas <-> ponto PDF) e os elementos onde
  // redesenhar() repinta as marcações -- nada aqui guarda estado de negócio, só referências DOM.
  const paginasInfo = new Map<number, { viewport: PageViewport; overlay: HTMLDivElement; lista: HTMLUListElement }>()

  function atualizarResumo(): void {
    const confirmadas = candidatos.filter((c) => c.status === 'confirmada').length
    const pendentes = candidatos.filter((c) => c.status === 'pendente').length
    status.textContent = bytesOriginais
      ? `${confirmadas} tarja(s) confirmada(s), ${pendentes} sugestão/área pendente de confirmação.`
      : ''
  }

  function redesenharPagina(paginaIndex: number): void {
    const info = paginasInfo.get(paginaIndex)
    if (!info) return
    const { viewport, overlay, lista } = info
    const candidatosDaPagina = candidatos.filter((c) => c.paginaIndex === paginaIndex)

    overlay.querySelectorAll('[data-candidato]').forEach((el) => el.remove())
    lista.innerHTML = ''

    for (const candidato of candidatosDaPagina) {
      if (candidato.status !== 'descartada') {
        const [vx0, vy0] = viewport.convertToViewportPoint(candidato.xPdf, candidato.yPdf)
        const [vx1, vy1] = viewport.convertToViewportPoint(candidato.xPdf + candidato.larguraPdf, candidato.yPdf + candidato.alturaPdf)
        const div = document.createElement('div')
        div.dataset.candidato = candidato.id
        div.style.position = 'absolute'
        div.style.left = `${Math.min(vx0, vx1)}px`
        div.style.top = `${Math.min(vy0, vy1)}px`
        div.style.width = `${Math.abs(vx1 - vx0)}px`
        div.style.height = `${Math.abs(vy1 - vy0)}px`
        if (candidato.status === 'confirmada') {
          div.style.background = '#000'
          div.style.pointerEvents = 'none'
        } else {
          div.style.background = 'rgba(255, 193, 7, 0.4)'
          div.style.border = '2px solid #b5530a'
          div.style.cursor = 'pointer'
          div.title = 'Clique pra confirmar esta tarja'
          div.addEventListener('click', () => {
            // Defesa contra o bug "clique perdido revive descarte": só age se, no momento do
            // clique, o candidato ainda estiver pendente (elemento de descartada nem existe
            // mais no DOM, mas o guard fica aqui também pra não depender só disso).
            const atual = candidatos.find((c) => c.id === candidato.id)
            if (atual?.status === 'pendente') confirmar(atual.id)
          })
        }
        overlay.appendChild(div)
      }

      const li = document.createElement('li')
      const texto = document.createElement('span')
      texto.textContent = `${rotuloOrigem(candidato)} — ${candidato.status}`
      const botaoConfirmar = document.createElement('button')
      botaoConfirmar.textContent = 'Confirmar tarja'
      botaoConfirmar.disabled = candidato.status === 'confirmada'
      botaoConfirmar.addEventListener('click', () => confirmar(candidato.id))
      const botaoDescartar = document.createElement('button')
      botaoDescartar.textContent = 'Descartar'
      botaoDescartar.disabled = candidato.status === 'descartada'
      botaoDescartar.addEventListener('click', () => descartar(candidato.id))
      li.append(texto, botaoConfirmar, botaoDescartar)
      lista.appendChild(li)
    }

    atualizarResumo()
  }

  function confirmar(id: string): void {
    const candidato = candidatos.find((c) => c.id === id)
    if (!candidato) return
    candidato.status = 'confirmada'
    redesenharPagina(candidato.paginaIndex)
  }

  function descartar(id: string): void {
    const candidato = candidatos.find((c) => c.id === id)
    if (!candidato) return
    candidato.status = 'descartada'
    redesenharPagina(candidato.paginaIndex)
  }

  function configurarArrastoDeDesenho(canvas: HTMLCanvasElement, overlay: HTMLDivElement, viewport: PageViewport, paginaIndex: number): void {
    const rascunho = document.createElement('div')
    rascunho.style.position = 'absolute'
    rascunho.style.border = '2px dashed #0a7fb5'
    rascunho.style.background = 'rgba(10, 127, 181, 0.15)'
    rascunho.style.display = 'none'
    rascunho.style.pointerEvents = 'none'
    overlay.appendChild(rascunho)

    canvas.addEventListener('mousedown', (evento) => {
      const rect = canvas.getBoundingClientRect()
      const inicio = { x: evento.clientX - rect.left, y: evento.clientY - rect.top }
      rascunho.style.display = 'block'

      const atualizarRascunho = (atual: { x: number; y: number }): void => {
        rascunho.style.left = `${Math.min(inicio.x, atual.x)}px`
        rascunho.style.top = `${Math.min(inicio.y, atual.y)}px`
        rascunho.style.width = `${Math.abs(atual.x - inicio.x)}px`
        rascunho.style.height = `${Math.abs(atual.y - inicio.y)}px`
      }
      atualizarRascunho(inicio)

      const mover = (e: MouseEvent): void => {
        atualizarRascunho({ x: e.clientX - rect.left, y: e.clientY - rect.top })
      }
      const soltar = (e: MouseEvent): void => {
        document.removeEventListener('mousemove', mover)
        document.removeEventListener('mouseup', soltar)
        rascunho.style.display = 'none'
        const fim = { x: e.clientX - rect.left, y: e.clientY - rect.top }
        const larguraPx = Math.abs(fim.x - inicio.x)
        const alturaPx = Math.abs(fim.y - inicio.y)
        if (larguraPx < LIMIAR_ARRASTO_PX || alturaPx < LIMIAR_ARRASTO_PX) return // clique acidental

        const p1 = viewport.convertToPdfPoint(Math.min(inicio.x, fim.x), Math.min(inicio.y, fim.y))
        const p2 = viewport.convertToPdfPoint(Math.max(inicio.x, fim.x), Math.max(inicio.y, fim.y))
        candidatos.push({
          id: `manual-${paginaIndex}-${proximoIdManual++}`,
          paginaIndex,
          xPdf: Math.min(p1[0], p2[0]),
          yPdf: Math.min(p1[1], p2[1]),
          larguraPdf: Math.abs(p2[0] - p1[0]),
          alturaPdf: Math.abs(p2[1] - p1[1]),
          origem: 'manual',
          status: 'pendente',
        })
        redesenharPagina(paginaIndex)
      }
      document.addEventListener('mousemove', mover)
      document.addEventListener('mouseup', soltar)
    })
  }

  input.addEventListener('change', async () => {
    const arquivo = input.files?.[0]
    if (!arquivo) return
    try {
      botaoAplicar.disabled = true
      candidatos = []
      paginasInfo.clear()
      areaPaginas.innerHTML = ''
      status.textContent = 'Carregando páginas...'

      bytesOriginais = new Uint8Array(await arquivo.arrayBuffer())
      const pdf = await getDocument({ data: bytesOriginais.slice() }).promise

      for (let numero = 1; numero <= pdf.numPages; numero++) {
        const pagina = await pdf.getPage(numero)
        const paginaIndex = numero - 1
        const viewportBase = pagina.getViewport({ scale: 1 })
        const escala = Math.min(1.6, 900 / viewportBase.width)
        const viewport = pagina.getViewport({ scale: escala })

        const bloco = document.createElement('div')
        bloco.style.marginBottom = '1.5rem'
        const titulo = document.createElement('h3')
        titulo.textContent = `Página ${numero}`

        const wrap = document.createElement('div')
        wrap.style.position = 'relative'
        wrap.style.display = 'inline-block'
        wrap.style.border = '1px solid #ccc'
        wrap.style.lineHeight = '0'
        wrap.style.verticalAlign = 'top'

        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.style.display = 'block'
        canvas.style.cursor = 'crosshair'
        const contexto = canvas.getContext('2d')!
        await pagina.render({ canvas, canvasContext: contexto, viewport }).promise

        const overlay = document.createElement('div')
        overlay.style.position = 'absolute'
        overlay.style.inset = '0'

        wrap.append(canvas, overlay)

        const lista = document.createElement('ul')
        lista.style.display = 'inline-block'
        lista.style.verticalAlign = 'top'
        lista.style.marginLeft = '1rem'
        lista.style.maxWidth = '280px'

        bloco.append(titulo, wrap, lista)
        areaPaginas.appendChild(bloco)

        paginasInfo.set(paginaIndex, { viewport, overlay, lista })
        configurarArrastoDeDesenho(canvas, overlay, viewport, paginaIndex)

        const sugestoes = await sugerirCandidatos(pagina, paginaIndex)
        candidatos.push(...sugestoes)
        redesenharPagina(paginaIndex)
      }

      botaoAplicar.disabled = false
      atualizarResumo()
    } catch (error) {
      console.error('[SEIRMG] Falha ao carregar PDF para tarjar:', error)
      alert('Não foi possível ler o arquivo selecionado. Confira se é um PDF válido.')
      bytesOriginais = null
      botaoAplicar.disabled = true
    }
  })

  botaoAplicar.addEventListener('click', async () => {
    try {
      if (!bytesOriginais) return
      const tarjasConfirmadas: Tarja[] = candidatos
        .filter((c) => c.status === 'confirmada')
        .map((c) => ({ pagina: c.paginaIndex, x: c.xPdf, y: c.yPdf, largura: c.larguraPdf, altura: c.alturaPdf }))

      if (tarjasConfirmadas.length === 0) {
        alert('Nenhuma tarja foi confirmada ainda. Confirme pelo menos uma sugestão ou área desenhada antes de aplicar.')
        return
      }

      const resultado = await aplicarTarjas(bytesOriginais, tarjasConfirmadas)
      const blob = new Blob([resultado as BlobPart], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'pdf-tarjado.pdf'
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('[SEIRMG] Falha ao aplicar tarjas:', error)
      alert('Não foi possível aplicar as tarjas.')
    }
  })
}
