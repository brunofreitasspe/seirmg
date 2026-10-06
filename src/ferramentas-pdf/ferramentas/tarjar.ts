import { aplicarTarjas, type Tarja } from '../../features/ferramentas-pdf/tarjar'
import { encontrarCpfCnpj } from '../../features/ferramentas-pdf/cpfCnpj'
import { trechoHorizontal } from '../../features/ferramentas-pdf/trechoTexto'
import { ICONES } from '../ui/icones'
import { abrirPdf, escalaParaLargura, renderizarPagina, type PageViewport, type PDFPageProxy } from '../ui/pdfjs'
import { criarPainelResultado } from '../ui/resultado'
import {
  comCarregando,
  criarAviso,
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
// A posição horizontal do trecho é estimada (fonte de medição != fonte do PDF): folga extra.
const PADDING_HORIZONTAL_PT = 3
const LIMIAR_ARRASTO_PX = 4
const LARGURA_PAGINA_PX = 760
// pdf.js às vezes devolve altura 0 em itens de texto (fontes Type3/sem métricas); 10pt é a
// altura de um corpo de texto comum, suficiente pra tarja cobrir a linha.
const ALTURA_TEXTO_PADRAO_PT = 10

// Mede texto numa fonte sem serifa parecida com a da maioria dos PDFs -- só a proporção entre as
// partes importa (ver trechoHorizontal), não o tamanho absoluto.
let contextoMedicao: CanvasRenderingContext2D | null = null
function medirTexto(texto: string): number {
  contextoMedicao ??= document.createElement('canvas').getContext('2d')
  if (!contextoMedicao) return 0
  contextoMedicao.font = '100px Helvetica, Arial, sans-serif'
  return contextoMedicao.measureText(texto).width
}

async function sugerirCandidatos(pagina: PDFPageProxy, paginaIndex: number): Promise<Candidato[]> {
  const conteudo = await pagina.getTextContent()
  let texto = ''
  const limites: { inicio: number; fim: number; str: string; transform: number[]; largura: number; altura: number }[] = []

  for (const item of conteudo.items) {
    if (!('str' in item) || !('transform' in item)) continue // TextMarkedContent não tem posição
    const inicio = texto.length
    texto += item.str
    limites.push({
      inicio,
      fim: texto.length,
      str: item.str,
      transform: item.transform,
      largura: item.width,
      altura: item.height || ALTURA_TEXTO_PADRAO_PT,
    })
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
      // Só a parte do item que é o CPF/CNPJ -- não a linha inteira em que ele aparece.
      const trecho = trechoHorizontal(
        item.str,
        Math.max(achado.indice, item.inicio) - item.inicio,
        Math.min(fimAchado, item.fim) - item.inicio,
        item.largura,
        medirTexto
      )
      x0 = Math.min(x0, e + trecho.inicio)
      y0 = Math.min(y0, f)
      x1 = Math.max(x1, e + trecho.fim)
      y1 = Math.max(y1, f + item.altura)
    }

    candidatos.push({
      id: `sugestao-${paginaIndex}-${achado.indice}`,
      paginaIndex,
      xPdf: x0 - PADDING_HORIZONTAL_PT,
      yPdf: y0 - PADDING_SUGESTAO_PT,
      larguraPdf: x1 - x0 + PADDING_HORIZONTAL_PT * 2,
      alturaPdf: y1 - y0 + PADDING_SUGESTAO_PT * 2,
      origem: achado.tipo,
      valor: achado.valor,
      status: 'pendente',
    })
  }
  return candidatos
}

const ROTULO_ORIGEM: Record<Candidato['origem'], string> = { cpf: 'CPF', cnpj: 'CNPJ', manual: 'Manual' }
const ROTULO_STATUS: Record<Candidato['status'], string> = { pendente: 'Pendente', confirmada: 'Tarjada', descartada: 'Descartada' }

export function montar(container: HTMLElement): void {
  const corpo = montarEstruturaFerramenta(container, 'tarjar')

  const etapa1 = criarEtapa(1, 'Escolha o PDF')
  const aviso = criarElemento('div')
  aviso.append(
    criarElemento('p', undefined, 'A tarja cobre a área com um retângulo preto opaco: resolve pra visualização e impressão.'),
    criarElemento(
      'p',
      undefined,
      'Ela não apaga o texto original de dentro do arquivo: com outro editor de PDF ainda dá pra recuperá-lo. Se o sigilo precisa resistir a isso, depois de tarjar imprima ou capture as páginas como imagem e use "Imagem → PDF".'
    )
  )
  const seletor = criarSeletorArquivos({
    aceitar: 'application/pdf,.pdf',
    titulo: 'Clique pra escolher o PDF',
    dica: 'ou arraste o arquivo pra cá. CPFs e CNPJs são sugeridos automaticamente.',
  })
  const progresso = criarProgresso()
  const mensagemArquivo = criarMensagem()
  etapa1.corpo.append(criarAviso('aviso', aviso), seletor.elemento, progresso.elemento, mensagemArquivo.elemento)

  const etapa2 = criarEtapa(2, 'Revise as tarjas')
  etapa2.secao.hidden = true
  const instrucao = criarAviso(
    'info',
    'Clique numa sugestão amarela pra confirmar, ou arraste o mouse sobre a página pra marcar outra área. Só as tarjas confirmadas vão pro arquivo.'
  )
  const areaPaginas = criarElemento('div', 'tarjar-paginas')
  const barra = criarElemento('div', 'barra-fixa')
  const resumo = criarElemento('div', 'resumo-numeros')
  const acoesBarra = criarElemento('div', 'barra-acoes')
  const confirmarTodas = criarBotao('Confirmar todas as pendentes', { icone: ICONES.check })
  const aplicar = criarBotao('Aplicar tarjas', { variante: 'perigo' })
  acoesBarra.append(confirmarTodas, aplicar)
  barra.append(resumo, acoesBarra)
  const mensagem = criarMensagem()
  etapa2.corpo.append(instrucao, areaPaginas, mensagem.elemento, barra)

  const resultado = criarPainelResultado(3)
  corpo.append(etapa1.secao, etapa2.secao, resultado.elemento)

  let arquivoAtual: File | null = null
  let bytesOriginais: Uint8Array | null = null
  let candidatos: Candidato[] = []
  let proximoIdManual = 0

  // Por página: o viewport (pra converter pixel de canvas <-> ponto PDF) e os elementos onde
  // redesenhar() repinta as marcações -- nada aqui guarda estado de negócio, só referências DOM.
  const paginasInfo = new Map<number, { viewport: PageViewport; canvas: HTMLCanvasElement; overlay: HTMLDivElement; lista: HTMLUListElement }>()

  function atualizarResumo(): void {
    const confirmadas = candidatos.filter((c) => c.status === 'confirmada').length
    const pendentes = candidatos.filter((c) => c.status === 'pendente').length
    resumo.replaceChildren(
      criarElemento('strong', undefined, String(confirmadas)),
      confirmadas === 1 ? 'tarja confirmada' : 'tarjas confirmadas',
      criarElemento('span', 'separador', '·'),
      criarElemento('strong', undefined, String(pendentes)),
      pendentes === 1 ? 'pendente' : 'pendentes'
    )
    confirmarTodas.disabled = pendentes === 0
    aplicar.disabled = confirmadas === 0
  }

  function criarItemLista(candidato: Candidato): HTMLLIElement {
    const item = criarElemento('li', `candidato ${candidato.status}`)
    const topo = criarElemento('div', 'candidato-topo')
    topo.append(
      criarElemento('span', 'etiqueta', ROTULO_ORIGEM[candidato.origem]),
      criarElemento('span', 'candidato-valor', candidato.valor ?? 'Área desenhada'),
      criarElemento('span', `etiqueta etiqueta-${candidato.status}`, ROTULO_STATUS[candidato.status])
    )
    item.append(topo)

    if (candidato.status !== 'descartada') {
      const acoes = criarElemento('div', 'candidato-acoes')
      if (candidato.status === 'pendente') {
        const confirmar = criarBotao('Confirmar', { variante: 'perigo', icone: ICONES.check })
        confirmar.addEventListener('click', () => definirStatus(candidato.id, 'confirmada'))
        acoes.append(confirmar)
      }
      const descartar = criarBotao(candidato.status === 'confirmada' ? 'Remover tarja' : 'Descartar', { icone: ICONES.x })
      descartar.addEventListener('click', () => definirStatus(candidato.id, 'descartada'))
      acoes.append(descartar)
      item.append(acoes)
    }
    return item
  }

  function redesenharPagina(paginaIndex: number): void {
    const info = paginasInfo.get(paginaIndex)
    if (!info) return
    const { viewport, canvas, overlay, lista } = info
    const candidatosDaPagina = candidatos.filter((c) => c.paginaIndex === paginaIndex)

    overlay.querySelectorAll('[data-candidato]').forEach((el) => el.remove())
    lista.replaceChildren()

    for (const candidato of candidatosDaPagina) {
      if (candidato.status !== 'descartada') {
        const [vx0, vy0] = viewport.convertToViewportPoint(candidato.xPdf, candidato.yPdf)
        const [vx1, vy1] = viewport.convertToViewportPoint(candidato.xPdf + candidato.larguraPdf, candidato.yPdf + candidato.alturaPdf)
        // Em % do canvas: a marcação acompanha a página quando o CSS a redimensiona.
        const marca = criarElemento('div', `tarja-marca ${candidato.status}`)
        marca.dataset.candidato = candidato.id
        marca.style.left = `${(Math.min(vx0, vx1) / canvas.width) * 100}%`
        marca.style.top = `${(Math.min(vy0, vy1) / canvas.height) * 100}%`
        marca.style.width = `${(Math.abs(vx1 - vx0) / canvas.width) * 100}%`
        marca.style.height = `${(Math.abs(vy1 - vy0) / canvas.height) * 100}%`
        if (candidato.status === 'pendente') {
          marca.title = 'Clique pra confirmar esta tarja'
          marca.addEventListener('click', () => {
            // Defesa contra o bug "clique perdido revive descarte": só age se, no momento do
            // clique, o candidato ainda estiver pendente (elemento de descartada nem existe
            // mais no DOM, mas o guard fica aqui também pra não depender só disso).
            const atual = candidatos.find((c) => c.id === candidato.id)
            if (atual?.status === 'pendente') definirStatus(atual.id, 'confirmada')
          })
        }
        overlay.append(marca)
      }
      lista.append(criarItemLista(candidato))
    }

    if (candidatosDaPagina.length === 0) {
      lista.append(criarElemento('li', 'tarjar-lista-vazia', 'Nenhuma sugestão nesta página. Arraste sobre a página pra marcar uma área.'))
    }
    atualizarResumo()
  }

  function definirStatus(id: string, status: 'confirmada' | 'descartada'): void {
    const candidato = candidatos.find((c) => c.id === id)
    if (!candidato) return
    candidato.status = status
    resultado.limpar()
    redesenharPagina(candidato.paginaIndex)
  }

  confirmarTodas.addEventListener('click', () => {
    const paginas = new Set<number>()
    for (const candidato of candidatos) {
      if (candidato.status !== 'pendente') continue
      candidato.status = 'confirmada'
      paginas.add(candidato.paginaIndex)
    }
    resultado.limpar()
    paginas.forEach(redesenharPagina)
  })

  function configurarArrastoDeDesenho(canvas: HTMLCanvasElement, overlay: HTMLDivElement, viewport: PageViewport, paginaIndex: number): void {
    const rascunho = criarElemento('div', 'tarja-rascunho')
    rascunho.hidden = true
    overlay.append(rascunho)

    canvas.addEventListener('mousedown', (evento) => {
      evento.preventDefault()
      const rect = canvas.getBoundingClientRect()
      // Posições em px de tela (CSS) pro rascunho; convertidas pra px do canvas só no fim.
      const posicao = (e: MouseEvent): { x: number; y: number } => ({
        x: Math.min(Math.max(e.clientX - rect.left, 0), rect.width),
        y: Math.min(Math.max(e.clientY - rect.top, 0), rect.height),
      })
      const inicio = posicao(evento)
      rascunho.hidden = false

      const atualizarRascunho = (atual: { x: number; y: number }): void => {
        rascunho.style.left = `${Math.min(inicio.x, atual.x)}px`
        rascunho.style.top = `${Math.min(inicio.y, atual.y)}px`
        rascunho.style.width = `${Math.abs(atual.x - inicio.x)}px`
        rascunho.style.height = `${Math.abs(atual.y - inicio.y)}px`
      }
      atualizarRascunho(inicio)

      const mover = (e: MouseEvent): void => atualizarRascunho(posicao(e))
      const soltar = (e: MouseEvent): void => {
        document.removeEventListener('mousemove', mover)
        document.removeEventListener('mouseup', soltar)
        rascunho.hidden = true
        const fim = posicao(e)
        if (Math.abs(fim.x - inicio.x) < LIMIAR_ARRASTO_PX || Math.abs(fim.y - inicio.y) < LIMIAR_ARRASTO_PX) return // clique acidental

        const escalaX = canvas.width / rect.width
        const escalaY = canvas.height / rect.height
        const p1 = viewport.convertToPdfPoint(Math.min(inicio.x, fim.x) * escalaX, Math.min(inicio.y, fim.y) * escalaY)
        const p2 = viewport.convertToPdfPoint(Math.max(inicio.x, fim.x) * escalaX, Math.max(inicio.y, fim.y) * escalaY)
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
        resultado.limpar()
        redesenharPagina(paginaIndex)
      }
      document.addEventListener('mousemove', mover)
      document.addEventListener('mouseup', soltar)
    })
  }

  seletor.aoMudar(async ([arquivo]) => {
    mensagemArquivo.limpar()
    mensagem.limpar()
    resultado.limpar()
    etapa2.secao.hidden = true
    candidatos = []
    paginasInfo.clear()
    areaPaginas.replaceChildren()
    arquivoAtual = arquivo ?? null
    bytesOriginais = null
    if (!arquivo) return

    try {
      const bytes = await lerBytes(arquivo)
      const pdf = await abrirPdf(bytes)
      if (arquivoAtual !== arquivo) return
      bytesOriginais = bytes
      etapa2.secao.hidden = false

      for (let numero = 1; numero <= pdf.numPages; numero++) {
        if (arquivoAtual !== arquivo) return
        progresso.definir((numero - 1) / pdf.numPages, `Carregando página ${numero} de ${pdf.numPages}...`)
        const pagina = await pdf.getPage(numero)
        const paginaIndex = numero - 1
        const { canvas, viewport } = await renderizarPagina(pagina, escalaParaLargura(pagina, LARGURA_PAGINA_PX))
        canvas.style.width = `${LARGURA_PAGINA_PX}px`
        canvas.style.height = 'auto'

        const bloco = criarElemento('div', 'tarjar-pagina')
        const wrap = criarElemento('div', 'tarjar-canvas-wrap')
        const overlay = criarElemento('div', 'tarjar-overlay')
        wrap.append(canvas, overlay)
        const lista = criarElemento('ul', 'tarjar-lista')
        bloco.append(criarElemento('h3', 'tarjar-pagina-titulo', `Página ${numero} de ${pdf.numPages}`), wrap, lista)
        areaPaginas.append(bloco)

        paginasInfo.set(paginaIndex, { viewport, canvas, overlay, lista })
        configurarArrastoDeDesenho(canvas, overlay, viewport, paginaIndex)

        candidatos.push(...(await sugerirCandidatos(pagina, paginaIndex)))
        redesenharPagina(paginaIndex)
      }
      progresso.ocultar()
      atualizarResumo()
    } catch (error) {
      console.error('[SEIRMG] Falha ao carregar PDF para tarjar:', error)
      progresso.ocultar()
      etapa2.secao.hidden = true
      bytesOriginais = null
      mensagemArquivo.mostrar('erro', 'Não foi possível ler o arquivo. Confira se é um PDF válido e sem senha.')
    }
  })

  aplicar.addEventListener('click', async () => {
    mensagem.limpar()
    if (!bytesOriginais || !arquivoAtual) return
    const tarjasConfirmadas: Tarja[] = candidatos
      .filter((c) => c.status === 'confirmada')
      .map((c) => ({ pagina: c.paginaIndex, x: c.xPdf, y: c.yPdf, largura: c.larguraPdf, altura: c.alturaPdf }))
    if (tarjasConfirmadas.length === 0) {
      mensagem.mostrar('aviso', 'Nenhuma tarja confirmada ainda. Confirme pelo menos uma sugestão ou área desenhada.')
      return
    }

    const original = bytesOriginais
    const base = nomeBase(arquivoAtual)
    await comCarregando(aplicar, 'Aplicando...', async () => {
      try {
        const bytes = await aplicarTarjas(original, tarjasConfirmadas)
        const qtd = tarjasConfirmadas.length
        resultado.mostrar([{ nome: `${base}-tarjado.pdf`, bytes, detalhe: qtd === 1 ? '1 tarja' : `${qtd} tarjas` }])
      } catch (error) {
        console.error('[SEIRMG] Falha ao aplicar tarjas:', error)
        mensagem.mostrar('erro', 'Não foi possível aplicar as tarjas.')
      }
    })
    atualizarResumo()
  })
}
