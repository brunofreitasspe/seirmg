import type { SnapshotPrazoProcesso } from '../../lib/storage'

export interface LinhaVisivelComPrazo {
  numero: string
  prazoDataTexto: string | null
  especificacao?: string
  link: string | null
}

export function atualizarSnapshotPrazos(
  atuais: SnapshotPrazoProcesso[],
  linhasVisiveis: LinhaVisivelComPrazo[],
  agoraIso: string
): { itens: SnapshotPrazoProcesso[]; mudou: boolean } {
  const porNumero = new Map(atuais.map((item) => [item.numero, item]))
  let mudou = false

  linhasVisiveis.forEach((linha) => {
    if (linha.prazoDataTexto) {
      const existente = porNumero.get(linha.numero)
      const igual =
        existente !== undefined &&
        existente.prazoDataTexto === linha.prazoDataTexto &&
        existente.especificacao === linha.especificacao &&
        existente.link === linha.link
      if (igual) return

      mudou = true
      porNumero.set(linha.numero, {
        numero: linha.numero,
        especificacao: linha.especificacao,
        link: linha.link,
        prazoDataTexto: linha.prazoDataTexto,
        vistoEm: agoraIso,
      })
    } else if (porNumero.has(linha.numero)) {
      porNumero.delete(linha.numero)
      mudou = true
    }
  })

  return { itens: Array.from(porNumero.values()), mudou }
}
