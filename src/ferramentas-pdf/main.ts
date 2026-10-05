import { listarFerramentasPdf } from '../features/ferramentas-pdf/catalogo'
import { montarUrlFerramenta } from '../features/ferramentas-pdf/catalogoUrl'

// Ícones próprios (traço simples, geométrico — círculos/retângulos/linhas) em vez de emoji,
// pra recolorir com --accent via `stroke="currentColor"` e casar com o resto da extensão.
const ICONES: Record<string, string> = {
  juntar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="7" width="11" height="14" rx="2"/>
    <rect x="10" y="3" width="11" height="14" rx="2"/>
  </svg>`,
  dividir: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="3" width="16" height="18" rx="2"/>
    <line x1="12" y1="3" x2="12" y2="21" stroke-dasharray="2.5 2.5"/>
  </svg>`,
  organizar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="11" height="4" rx="1"/>
    <rect x="3" y="10" width="11" height="4" rx="1"/>
    <rect x="3" y="16" width="11" height="4" rx="1"/>
    <line x1="19" y1="6" x2="19" y2="18"/>
    <path d="M16.5 9 L19 6 L21.5 9"/>
    <path d="M16.5 15 L19 18 L21.5 15"/>
  </svg>`,
  'numerar-paginas': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="5" y="3" width="14" height="18" rx="2"/>
    <line x1="8" y1="8" x2="15" y2="8"/>
    <line x1="8" y1="12" x2="15" y2="12"/>
    <circle cx="17" cy="18" r="3"/>
    <line x1="17" y1="16.8" x2="17" y2="19.2"/>
  </svg>`,
  'imagem-para-pdf': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2"/>
    <circle cx="9" cy="9" r="1.6"/>
    <path d="M5 17 L10 12 L13 15 L16 11 L20 16"/>
  </svg>`,
  comprimir: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <path d="M14 10 L18 6 M18 6 L14 6 M18 6 L18 10"/>
    <path d="M10 14 L6 18 M6 18 L10 18 M6 18 L6 14"/>
  </svg>`,
  ocr: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="14" height="18" rx="2"/>
    <line x1="6" y1="8" x2="14" y2="8"/>
    <line x1="6" y1="12" x2="14" y2="12"/>
    <line x1="6" y1="16" x2="11" y2="16"/>
    <circle cx="17" cy="17" r="3.2"/>
    <line x1="19.3" y1="19.3" x2="22" y2="22"/>
  </svg>`,
  pdfa: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="3" width="16" height="18" rx="2"/>
    <line x1="7" y1="8" x2="13" y2="8"/>
    <line x1="7" y1="12" x2="13" y2="12"/>
    <circle cx="16" cy="16" r="4"/>
    <path d="M14.3 16 L15.6 17.3 L18 14.7"/>
  </svg>`,
  tarjar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="3" width="16" height="18" rx="2"/>
    <line x1="7" y1="8" x2="17" y2="8"/>
    <rect x="7" y="11" width="10" height="3" fill="currentColor" stroke="none"/>
    <line x1="7" y1="17" x2="14" y2="17"/>
  </svg>`,
}

function obterFerramentaDaUrl(): string | null {
  return new URL(window.location.href).searchParams.get('ferramenta')
}

function obterIdProcedimentoDaUrl(): string | null {
  return new URL(window.location.href).searchParams.get('idProcedimento')
}

function renderizarCatalogo(container: HTMLElement): void {
  const idProcedimento = obterIdProcedimentoDaUrl()
  const lista = document.createElement('div')
  lista.className = 'catalogo'
  listarFerramentasPdf().forEach((ferramenta) => {
    const card = document.createElement('a')
    card.className = 'catalogo-card'
    card.href = montarUrlFerramenta(ferramenta.id, idProcedimento)

    const icone = document.createElement('div')
    icone.className = 'catalogo-card-icone'
    icone.innerHTML = ICONES[ferramenta.id] ?? ''

    const titulo = document.createElement('strong')
    titulo.textContent = ferramenta.nome
    const descricao = document.createElement('p')
    descricao.textContent = ferramenta.descricao
    card.append(icone, titulo, descricao)
    lista.appendChild(card)
  })
  container.appendChild(lista)
}

async function render(): Promise<void> {
  const container = document.getElementById('conteudo')
  if (!container) return

  const ferramentaId = obterFerramentaDaUrl()
  if (!ferramentaId) {
    renderizarCatalogo(container)
    return
  }

  // Cada ferramenta registra seu próprio módulo de UI em ferramentas/<id>.ts (Tasks 3-11),
  // carregado dinamicamente pra não inflar o bundle inicial do catálogo com todas as libs
  // (pdf-lib, pdfjs-dist, tesseract.js) de uma vez.
  try {
    const modulo = await import(`./ferramentas/${ferramentaId}.ts`)
    modulo.montar(container)
  } catch (error) {
    console.error('[SEIRMG] Ferramenta de PDF não encontrada:', ferramentaId, error)
    container.textContent = 'Ferramenta não encontrada.'
  }
}

render().catch((error) => console.error('[SEIRMG] Falha ao iniciar Ferramentas de PDF:', error))
