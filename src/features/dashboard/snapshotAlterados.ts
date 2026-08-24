import type { SnapshotAlteradoProcesso } from '../../lib/storage'

export interface LinhaVisivelComAlterado {
  numero: string
  alterado: boolean
  especificacao?: string
  link: string | null
}

export function atualizarSnapshotAlterados(
  atuais: SnapshotAlteradoProcesso[],
  linhasVisiveis: LinhaVisivelComAlterado[],
  agoraIso: string
): { itens: SnapshotAlteradoProcesso[]; mudou: boolean } {
  const porNumero = new Map(atuais.map((item) => [item.numero, item]))
  let mudou = false

  linhasVisiveis.forEach((linha) => {
    if (linha.alterado) {
      const existente = porNumero.get(linha.numero)
      const igual =
        existente !== undefined &&
        existente.especificacao === linha.especificacao &&
        existente.link === linha.link
      if (igual) return

      mudou = true
      porNumero.set(linha.numero, {
        numero: linha.numero,
        especificacao: linha.especificacao,
        link: linha.link,
        vistoEm: agoraIso,
      })
    } else if (porNumero.has(linha.numero)) {
      porNumero.delete(linha.numero)
      mudou = true
    }
  })

  return { itens: Array.from(porNumero.values()), mudou }
}
