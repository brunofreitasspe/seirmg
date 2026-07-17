import type { BlocoAssinaturaItem, BlocoAssinaturaResumo, EstadoBloco } from './types'

export interface ParseBlocoAssinaturaOptions {
  seiVersionAtLeast4: boolean
}

export interface BlocoListaItem {
  numero: string
  descricao: string
  href: string
  estado: EstadoBloco | undefined
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

const CLASSES_LINHA_VALIDA_BLOCOS = ['infraTrClara', 'infraTrEscura', 'trVermelha']

// Tela "Blocos de Assinatura" (acao=bloco_assinatura_listar) -- diferente da tela de conteúdo de UM
// bloco (#divInfraAreaTabela, que parseBlocoAssinaturaTable já lê). Índices de coluna confirmados com
// HTML real (Ver Código-Fonte) de uma instância SEI real, 2026-07-16: td[1]=número (link),
// td[4]=Estado, td[6]=Disponibilização, td[8]=Descrição.
export function parseListaBlocosAssinatura(root: ParentNode): BlocoListaItem[] {
  const tabela = root.querySelector('#tblBlocos')
  if (!tabela) return []

  const linhas = Array.from(tabela.querySelectorAll('tr')).filter((linha) =>
    CLASSES_LINHA_VALIDA_BLOCOS.some((classe) => linha.classList.contains(classe))
  )

  return linhas.map((linha) => {
    const celulas = linha.children
    const link = celulas.item(1)?.querySelector('a')
    const textoEstado = celulas.item(4)?.textContent?.trim() ?? ''
    const textoDisponibilizacao = celulas.item(6)?.textContent?.trim() ?? ''

    return {
      numero: link?.textContent?.trim() ?? '',
      descricao: celulas.item(8)?.textContent?.trim() ?? '',
      href: link?.getAttribute('href') ?? '',
      estado: classificarEstado(textoEstado, textoDisponibilizacao),
    }
  })
}

export function detectarTransicoesParaDisponibilizado(
  atuais: BlocoListaItem[],
  // `| undefined` de propósito: chrome.storage.local.get() de uma instalação já existente antes
  // desse campo existir retorna o LocalConfig salvo como está (createLocalConfigStore só cai no
  // default quando NÃO HÁ config salvo nenhum, não campo por campo) -- então este valor pode
  // chegar undefined na prática mesmo com o tipo de LocalConfig dizendo que não pode.
  conhecidos: Record<string, string> | undefined
): BlocoListaItem[] {
  const estadosConhecidos = conhecidos ?? {}
  return atuais.filter(
    (bloco) =>
      bloco.estado === 'disponibilizado_para_area' &&
      estadosConhecidos[bloco.numero] !== 'disponibilizado_para_area'
  )
}
