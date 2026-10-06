// Conteúdo de Word (.docx, convertido pelo mammoth) ou HTML colocado no padrão do SEI: primeiro
// limpa (só estrutura permitida, nada executável), depois aplica as classes de estilo do SEI 4.1.

export function tipoArquivoImportavel(nome: string): 'docx' | 'html' | null {
  const extensao = nome.toLowerCase().split('.').pop()
  if (extensao === 'docx') return 'docx'
  if (extensao === 'html' || extensao === 'htm') return 'html'
  return null
}

const PERMITIDOS = new Set([
  'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'SUB', 'SUP', 'UL', 'OL', 'LI',
  'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'A', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'IMG',
])
const DESCARTADOS_COM_CONTEUDO = new Set(['SCRIPT', 'STYLE', 'HEAD', 'TITLE', 'META', 'LINK', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE'])
// O SEI recusa GIF ao salvar ("Imagem formato gif não permitida"); SVG pode conter script.
const IMAGEM_ACEITA = /^data:image\/(png|jpe?g);base64,/i

function limparNo(no: Node, doc: Document): Node[] {
  if (no.nodeType === Node.TEXT_NODE) return [doc.createTextNode(no.textContent ?? '')]
  if (no.nodeType !== Node.ELEMENT_NODE) return []
  const elemento = no as Element
  const tag = elemento.tagName
  if (DESCARTADOS_COM_CONTEUDO.has(tag)) return []
  const filhos = Array.from(elemento.childNodes).flatMap((filho) => limparNo(filho, doc))
  if (!PERMITIDOS.has(tag)) return filhos

  if (tag === 'IMG') {
    const src = elemento.getAttribute('src') ?? ''
    if (!IMAGEM_ACEITA.test(src)) return []
    const imagem = doc.createElement('img')
    imagem.setAttribute('src', src)
    const alt = elemento.getAttribute('alt')
    if (alt) imagem.setAttribute('alt', alt)
    return [imagem]
  }

  const novo = doc.createElement(tag.toLowerCase())
  if (tag === 'A') {
    const href = elemento.getAttribute('href') ?? ''
    if (!/^(https?:|mailto:)/i.test(href)) return filhos
    novo.setAttribute('href', href)
  }
  if (tag === 'TD' || tag === 'TH') {
    for (const atributo of ['colspan', 'rowspan']) {
      const valor = elemento.getAttribute(atributo)
      if (valor && /^\d+$/.test(valor)) novo.setAttribute(atributo, valor)
    }
  }
  novo.append(...filhos)
  return [novo]
}

export function limparHtmlImportado(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const saida = doc.createElement('div')
  saida.append(...Array.from(doc.body.childNodes).flatMap((no) => limparNo(no, doc)))
  return saida.innerHTML
}

function trocarPorParagrafo(elemento: Element, classe: string): void {
  const p = elemento.ownerDocument.createElement('p')
  p.className = classe
  p.append(...Array.from(elemento.childNodes))
  elemento.replaceWith(p)
}

export function aplicarEstilosSei(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const raiz = doc.body.firstElementChild as HTMLElement

  // Texto/inline solto no nível de cima entra num parágrafo justificado.
  Array.from(raiz.childNodes).forEach((no) => {
    const bloco = no.nodeType === Node.ELEMENT_NODE && /^(P|H[1-6]|UL|OL|TABLE|IMG)$/.test((no as Element).tagName)
    if (bloco || (no.nodeType === Node.TEXT_NODE && !(no.textContent ?? '').trim())) return
    const p = doc.createElement('p')
    no.replaceWith(p)
    p.append(no)
  })

  raiz.querySelectorAll('h1').forEach((h) => trocarPorParagrafo(h, 'Texto_Fundo_Cinza_Maiusculas_Negrito'))
  raiz.querySelectorAll('h2, h3, h4, h5, h6').forEach((h) => trocarPorParagrafo(h, 'Texto_Fundo_Cinza_Negrito'))
  raiz.querySelectorAll('table').forEach((tabela) => {
    tabela.className = 'Tabela'
    tabela.setAttribute('style', 'border-collapse:collapse;width:100%;')
  })
  raiz.querySelectorAll('td, th').forEach((celula) => {
    const paragrafos = celula.querySelectorAll('p')
    if (paragrafos.length > 0) {
      paragrafos.forEach((p) => (p.className = 'Tabela_Texto_Alinhado_Esquerda'))
      return
    }
    const p = doc.createElement('p')
    p.className = 'Tabela_Texto_Alinhado_Esquerda'
    p.append(...Array.from(celula.childNodes))
    celula.append(p)
  })
  raiz.querySelectorAll('p').forEach((p) => {
    if (!p.className) p.className = 'Texto_Justificado'
  })
  return raiz.innerHTML
}

export function prepararHtmlParaSei(html: string): string {
  return aplicarEstilosSei(limparHtmlImportado(html))
}
