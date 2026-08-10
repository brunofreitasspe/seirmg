import type { KanbanCardPosicao, KanbanLista } from '../../lib/storage'

export type OrigemAutomatica = 'recebidos' | 'gerados'

export type ColunaKanban =
  | { tipo: 'automatica'; chave: OrigemAutomatica | 'favoritos' }
  | { tipo: 'lista'; id: string }

// Pertencimento exclusivo: card nasce na origem (fato do SEI); favoritar (feature já existente,
// Lote L) sobrepõe; posição manual (arrastar pra uma lista sua) sobrepõe tudo. Nunca combina.
export function calcularColuna(
  origem: OrigemAutomatica,
  favoritado: boolean,
  listaIdManual: string | null
): ColunaKanban {
  if (listaIdManual !== null) return { tipo: 'lista', id: listaIdManual }
  if (favoritado) return { tipo: 'automatica', chave: 'favoritos' }
  return { tipo: 'automatica', chave: origem }
}

export function montarPosicoesAtualizadas(
  posicoes: KanbanCardPosicao[],
  numero: string,
  listaId: string | null
): KanbanCardPosicao[] {
  const semEsseNumero = posicoes.filter((posicao) => posicao.numero !== numero)
  if (listaId === null) return semEsseNumero
  return [...semEsseNumero, { numero, listaId }]
}

export function criarLista(
  listasAtuais: KanbanLista[],
  nome: string
): { lista: KanbanLista; listas: KanbanLista[] } {
  const maiorOrdem = listasAtuais.reduce((maior, lista) => Math.max(maior, lista.ordem), -1)
  const lista: KanbanLista = { id: crypto.randomUUID(), nome, ordem: maiorOrdem + 1 }
  return { lista, listas: [...listasAtuais, lista] }
}

export function renomearLista(listas: KanbanLista[], id: string, novoNome: string): KanbanLista[] {
  return listas.map((lista) => (lista.id === id ? { ...lista, nome: novoNome } : lista))
}

export function removerLista(
  listas: KanbanLista[],
  posicoes: KanbanCardPosicao[],
  id: string
): { listas: KanbanLista[]; posicoes: KanbanCardPosicao[] } {
  return {
    listas: listas.filter((lista) => lista.id !== id),
    posicoes: posicoes.filter((posicao) => posicao.listaId !== id),
  }
}

export function ordenarListas(listas: KanbanLista[]): KanbanLista[] {
  return [...listas].sort((a, b) => a.ordem - b.ordem)
}

export function linhaNaoRecebida(linha: Element): boolean {
  return !!linha.querySelector('.processoNaoVisualizado')
}

export function linhaTemDocumentoAlterado(linha: Element): boolean {
  return !!linha.querySelector('img[src*="exclamacao.svg"]')
}

export function extrairNivelAcessoLinha(linha: Element): string | null {
  const imagens = Array.from(linha.querySelectorAll('img'))
  for (const img of imagens) {
    const src = img.getAttribute('src') ?? ''
    const title = img.getAttribute('title') ?? ''
    const alt = img.getAttribute('alt') ?? ''
    if (src.includes('restrito') || title.includes('Restrito') || alt.includes('Restrito')) return 'Restrito'
    if (src.includes('sigiloso') || title.includes('Sigiloso') || alt.includes('Sigiloso')) return 'Sigiloso'
    if (src.includes('publico') || title.includes('Público') || alt.includes('Público')) return 'Público'
  }
  return null
}

export function extrairDataHoraLinha(linha: Element): string | null {
  const celulas = Array.from(linha.querySelectorAll('td'))
  for (const celula of celulas) {
    const texto = celula.textContent?.trim() ?? ''
    if (/\d{2}\/\d{2}\/\d{4}/.test(texto)) return texto
  }
  return null
}

export function extrairUnidadeGeradoraLinha(linha: Element): string | null {
  const celulas = Array.from(linha.querySelectorAll('td'))
  for (let i = 1; i < celulas.length - 1; i++) {
    const texto = celulas[i].textContent?.trim() ?? ''
    if (texto.length > 2 && texto.length < 100 && !texto.includes('http') && !/\d{4}\.\d/.test(texto)) {
      return texto
    }
  }
  return null
}

// Padrão: 0021.042267/2024-10 — ano vem depois da barra, antes do hífen. Usado pelo filtro de
// ano da toolbar (Task 11), mesma extração que a referência já usa.
export function extrairAnoProcesso(numero: string): string | null {
  return numero.match(/\/(\d{4})-/)?.[1] ?? null
}
