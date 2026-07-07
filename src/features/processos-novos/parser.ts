import type { ProcessoItem } from './types'

export function parseProcessosControlarTable(root: ParentNode): ProcessoItem[] {
  const linhas = root.querySelectorAll('#tblProcessosDetalhado > tbody > tr[id]')

  return Array.from(linhas).flatMap((linha) => {
    const link = linha.querySelector('td:nth-child(3) > a')
    if (!link) return []

    return [
      {
        id: linha.id,
        numero: link.textContent?.trim() ?? '',
        visualizado: link.classList.contains('processoVisualizado'),
      },
    ]
  })
}
