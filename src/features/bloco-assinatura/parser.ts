import type { BlocoAssinaturaItem, BlocoAssinaturaResumo, EstadoBloco } from './types'

export interface ParseBlocoAssinaturaOptions {
  seiVersionAtLeast4: boolean
}

function classificarEstado(
  textoEstado: string,
  textoDisponibilizacao: string
): EstadoBloco | undefined {
  if (textoEstado === 'Disponibilizado') {
    return textoDisponibilizacao.trim() !== ''
      ? 'disponibilizado_pela_area'
      : 'disponibilizado_para_area'
  }
  if (textoEstado === 'Aberto' || textoEstado === 'Gerado') return 'aberto'
  if (textoEstado === 'Retornado') return 'retornado'
  if (textoEstado === 'Recebido') return 'disponibilizado_para_area'
  return undefined
}

function extrairIdEstavel(row: Element, numero: string, link: string): string {
  if (link) return link
  return `linha:${numero}:${row.textContent?.trim().slice(0, 80) ?? ''}`
}

export function parseBlocoAssinaturaTable(
  root: ParentNode,
  options: ParseBlocoAssinaturaOptions
): BlocoAssinaturaItem[] {
  const linhas = Array.from(root.querySelectorAll('#divInfraAreaTabela > table > tbody > tr'))
  const indiceEstado = options.seiVersionAtLeast4 ? 4 : 2
  const indiceDisponibilizacao = options.seiVersionAtLeast4 ? 6 : 4

  const itens: BlocoAssinaturaItem[] = []

  linhas.forEach((linha, index) => {
    if (index === 0) return // linha de cabeçalho

    const celulas = linha.children
    const celulaEstado = celulas.item(indiceEstado)
    if (!celulaEstado) return

    const celulaDisponibilizacao = celulas.item(indiceDisponibilizacao)
    const textoEstado = celulaEstado.textContent?.trim() ?? ''
    const textoDisponibilizacao = celulaDisponibilizacao?.textContent?.trim() ?? ''
    const estado = classificarEstado(textoEstado, textoDisponibilizacao)
    if (!estado) return

    const primeiraCelulaLink = linha.querySelector('a')
    const numero = primeiraCelulaLink?.textContent?.trim() ?? `linha-${index}`
    const link = primeiraCelulaLink?.getAttribute('href') ?? ''

    itens.push({
      id: extrairIdEstavel(linha, numero, link),
      numero,
      link,
      estado,
    })
  })

  return itens
}

export function resumirBlocos(itens: BlocoAssinaturaItem[]): BlocoAssinaturaResumo {
  return itens.reduce<BlocoAssinaturaResumo>(
    (resumo, item) => {
      switch (item.estado) {
        case 'disponibilizado_para_area':
          resumo.totalDisponibilizadoParaArea++
          break
        case 'disponibilizado_pela_area':
          resumo.totalDisponibilizadoPelaArea++
          break
        case 'aberto':
          resumo.totalAberto++
          break
        case 'retornado':
          resumo.totalRetornado++
          break
      }
      return resumo
    },
    {
      totalDisponibilizadoParaArea: 0,
      totalDisponibilizadoPelaArea: 0,
      totalAberto: 0,
      totalRetornado: 0,
    }
  )
}
