import { nivelDaClasse } from './numeracaoParagrafos'

export interface ItemSumario {
  id: string
  texto: string
  nivel: number
}

export function extrairItensSumario(paragrafos: { classe: string; texto: string }[]): ItemSumario[] {
  let proximoId = 0
  const itens: ItemSumario[] = []
  for (const paragrafo of paragrafos) {
    const nivel = nivelDaClasse(paragrafo.classe)
    if (nivel === null) continue
    itens.push({ id: `seirmg-sumario-${proximoId++}`, texto: paragrafo.texto, nivel })
  }
  return itens
}

export function montarSumarioHtml(itens: ItemSumario[]): string {
  const linhas = itens
    .map((item) => `<p style="margin-left:${(item.nivel - 1) * 16}px"><a href="#${item.id}">${item.texto}</a></p>`)
    .join('')
  return `<div class="Sumario">${linhas}</div>`
}
