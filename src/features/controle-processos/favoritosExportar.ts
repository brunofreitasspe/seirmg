import type { FavoritoProcesso } from '../../lib/storage'

export type FavoritoExportado = Pick<
  FavoritoProcesso,
  'numero' | 'link' | 'adicionadoEm' | 'especificacao' | 'ultimoSnapshot'
>

export interface ExportacaoFavoritos {
  versaoSeirmg: string
  exportadoEm: string
  favoritos: FavoritoExportado[]
}

export function montarExportacaoFavoritos(
  itens: FavoritoProcesso[],
  versaoSeirmg: string,
  agora: Date
): ExportacaoFavoritos {
  return {
    versaoSeirmg,
    exportadoEm: agora.toISOString(),
    favoritos: itens.map(({ numero, link, adicionadoEm, especificacao, ultimoSnapshot }) => ({
      numero,
      link,
      adicionadoEm,
      especificacao,
      ultimoSnapshot,
    })),
  }
}

export function parseImportacaoFavoritos(json: string): ExportacaoFavoritos | null {
  try {
    const dados: unknown = JSON.parse(json)
    if (
      typeof dados !== 'object' ||
      dados === null ||
      !Array.isArray((dados as { favoritos?: unknown }).favoritos)
    ) {
      return null
    }
    return dados as ExportacaoFavoritos
  } catch {
    return null
  }
}

export function favoritosImportadosParaAdicionar(
  exportacao: ExportacaoFavoritos,
  itensAtuais: FavoritoProcesso[]
): FavoritoProcesso[] {
  const numerosAtuais = new Set(itensAtuais.map((item) => item.numero))
  return exportacao.favoritos.filter((favorito) => !numerosAtuais.has(favorito.numero))
}

export function escaparCampoCsv(valor: string): string {
  if (/[;"\r\n]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`
  }
  return valor
}

export function montarLinhaCsv(campos: string[]): string {
  return campos.map(escaparCampoCsv).join(';')
}
