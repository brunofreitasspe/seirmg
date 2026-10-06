import { GRUPOS_FERRAMENTAS_PDF, listarFerramentasPdf } from '../features/ferramentas-pdf/catalogo'
import { montarUrlCatalogo, montarUrlFerramenta } from '../features/ferramentas-pdf/catalogoUrl'
import { lerContextoProcesso } from '../features/ferramentas-pdf/contexto'
import { ICONES, ICONES_FERRAMENTA } from './ui/icones'
import { criarElemento, criarIcone } from './ui/kit'

function obterFerramentaDaUrl(): string | null {
  return new URL(window.location.href).searchParams.get('ferramenta')
}

// Faixa logo abaixo do topo: diz se a página está vinculada a um processo (e portanto pode enviar
// resultados pra ele) ou em modo avulso -- ex.: aberta pelo popup, que não tem processo-alvo.
function renderizarContexto(alvo: HTMLElement): void {
  const contexto = lerContextoProcesso(window.location.search)
  const faixa = criarElemento('div', 'contexto')
  const textos = criarElemento('div', 'contexto-textos')

  if (contexto?.urlIncluir) {
    faixa.classList.add('contexto-vinculado')
    faixa.append(criarIcone(ICONES.link, 'contexto-icone'))
    const titulo = criarElemento('strong')
    titulo.append('Vinculado ao processo ')
    if (contexto.numeroProcesso) titulo.append(criarElemento('span', 'contexto-numero', contexto.numeroProcesso))
    else titulo.append('aberto no SEI')
    textos.append(titulo, criarElemento('span', undefined, 'Os resultados podem ser enviados direto ao processo como documento externo.'))
  } else if (contexto) {
    faixa.classList.add('contexto-alerta')
    faixa.append(criarIcone(ICONES.triangleAlert, 'contexto-icone'))
    textos.append(
      criarElemento('strong', undefined, 'Link do processo incompleto'),
      criarElemento('span', undefined, 'Recarregue a página do processo no SEI e abra de novo pelo atalho na árvore pra poder enviar resultados.')
    )
  } else {
    faixa.classList.add('contexto-avulso')
    faixa.append(criarIcone(ICONES.info, 'contexto-icone'))
    textos.append(
      criarElemento('strong', undefined, 'Modo avulso: os resultados só podem ser baixados'),
      criarElemento(
        'span',
        undefined,
        'Pra enviar direto a um processo, abra as Ferramentas de PDF pelo atalho "Ferramentas de PDF" na árvore do processo no SEI.'
      )
    )
  }
  faixa.append(textos)
  alvo.append(faixa)
}

function renderizarCatalogo(container: HTMLElement): void {
  const intro = criarElemento('div', 'catalogo-intro')
  intro.append(
    criarElemento('h1', undefined, 'O que você quer fazer com o PDF?'),
    criarElemento('p', undefined, 'Escolha uma ferramenta. Tudo roda aqui mesmo, sem enviar seus arquivos pra nenhum servidor.')
  )
  container.append(intro)

  const ferramentas = listarFerramentasPdf()
  for (const grupo of GRUPOS_FERRAMENTAS_PDF) {
    const secao = criarElemento('section', 'catalogo-grupo')
    secao.append(criarElemento('h2', 'catalogo-grupo-titulo', grupo.titulo))
    const grade = criarElemento('div', 'catalogo')
    for (const ferramenta of ferramentas.filter((f) => f.grupo === grupo.id)) {
      const card = criarElemento('a', 'catalogo-card')
      card.dataset.grupo = ferramenta.grupo
      card.href = montarUrlFerramenta(ferramenta.id, window.location.search)
      const textos = criarElemento('div', 'catalogo-card-textos')
      textos.append(criarElemento('strong', undefined, ferramenta.nome), criarElemento('p', undefined, ferramenta.descricao))
      card.append(
        criarIcone(ICONES_FERRAMENTA[ferramenta.id] ?? '', 'catalogo-card-icone'),
        textos,
        criarIcone(ICONES.chevronRight, 'catalogo-card-seta')
      )
      grade.append(card)
    }
    secao.append(grade)
    container.append(secao)
  }
}

async function render(): Promise<void> {
  const container = document.getElementById('conteudo')
  if (!container) return

  const marca = document.getElementById('marca') as HTMLAnchorElement | null
  if (marca) marca.href = montarUrlCatalogo(window.location.search)
  const alvoContexto = document.getElementById('contexto')
  if (alvoContexto) renderizarContexto(alvoContexto)

  const ferramentaId = obterFerramentaDaUrl()
  if (!ferramentaId) {
    renderizarCatalogo(container)
    return
  }

  // Cada ferramenta registra seu próprio módulo de UI em ferramentas/<id>.ts, carregado
  // dinamicamente pra não inflar o bundle inicial do catálogo com todas as libs (pdf-lib,
  // pdfjs-dist, tesseract.js) de uma vez.
  try {
    const modulo = await import(`./ferramentas/${ferramentaId}.ts`)
    modulo.montar(container)
  } catch (error) {
    console.error('[SEIRMG] Ferramenta de PDF não encontrada:', ferramentaId, error)
    container.textContent = 'Ferramenta não encontrada.'
  }
}

render().catch((error) => console.error('[SEIRMG] Falha ao iniciar Ferramentas de PDF:', error))
