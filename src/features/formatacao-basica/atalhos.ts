import type { AtalhoParagrafo } from '../../lib/storage'

export function parsearAtalhos(texto: string): AtalhoParagrafo[] {
  return texto
    .split('\n')
    .map((linha) => linha.trim())
    .filter((linha) => linha !== '')
    .flatMap((linha) => {
      const [tecla, resto] = linha.split('=')
      if (!tecla || !resto) return []
      const [classe, rotulo] = resto.split(':')
      if (!classe) return []
      return [{ tecla: tecla.trim(), classe: classe.trim(), rotulo: (rotulo ?? classe).trim() }]
    })
}

export function formatarAtalhos(atalhos: AtalhoParagrafo[]): string {
  return atalhos.map((atalho) => `${atalho.tecla}=${atalho.classe}:${atalho.rotulo}`).join('\n')
}
