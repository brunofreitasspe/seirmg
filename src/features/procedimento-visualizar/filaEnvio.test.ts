import { describe, it, expect, vi } from 'vitest'
import { ordenarPorNomeNatural, moverItem, enviarEmSequencia, formatarMensagemProgresso } from './filaEnvio'

const arquivo = (name: string): { name: string } => ({ name })

describe('ordenarPorNomeNatural', () => {
  it('ordena números como números (2 antes de 10), sem diferenciar maiúsculas', () => {
    const ordenados = ordenarPorNomeNatural([arquivo('Anexo 10.pdf'), arquivo('anexo 2.pdf'), arquivo('Anexo 1.pdf')])
    expect(ordenados.map((a) => a.name)).toEqual(['Anexo 1.pdf', 'anexo 2.pdf', 'Anexo 10.pdf'])
  })

  it('respeita prefixos numéricos com zero à esquerda', () => {
    const ordenados = ordenarPorNomeNatural([arquivo('03 - Parecer.pdf'), arquivo('01 - Ofício.pdf'), arquivo('02 - Anexo.pdf')])
    expect(ordenados.map((a) => a.name)).toEqual(['01 - Ofício.pdf', '02 - Anexo.pdf', '03 - Parecer.pdf'])
  })

  it('não altera a lista original', () => {
    const original = [arquivo('b.pdf'), arquivo('a.pdf')]
    ordenarPorNomeNatural(original)
    expect(original.map((a) => a.name)).toEqual(['b.pdf', 'a.pdf'])
  })
})

describe('moverItem', () => {
  it('move um item pra outra posição', () => {
    expect(moverItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moverItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('destino fora da lista é limitado às pontas; origem inválida não muda nada', () => {
    expect(moverItem(['a', 'b', 'c'], 0, 99)).toEqual(['b', 'c', 'a'])
    expect(moverItem(['a', 'b', 'c'], 2, -5)).toEqual(['c', 'a', 'b'])
    expect(moverItem(['a', 'b'], 5, 0)).toEqual(['a', 'b'])
  })
})

describe('enviarEmSequencia', () => {
  it('envia um por vez, na ordem da lista (o próximo só começa quando o anterior termina)', async () => {
    const eventos: string[] = []
    const enviar = vi.fn(async (item: string) => {
      eventos.push(`inicio ${item}`)
      await new Promise((resolve) => setTimeout(resolve, item === 'a' ? 20 : 1))
      eventos.push(`fim ${item}`)
    })
    const resultado = await enviarEmSequencia(['a', 'b', 'c'], enviar)
    expect(eventos).toEqual(['inicio a', 'fim a', 'inicio b', 'fim b', 'inicio c', 'fim c'])
    expect(resultado).toEqual({ enviados: 3, falha: null, pendentes: [] })
  })

  it('para na primeira falha e devolve o que falhou e os seguintes como pendentes (pra manter a ordem ao tentar de novo)', async () => {
    const erro = new Error('HTTP 500')
    const enviar = vi.fn(async (item: string) => {
      if (item === 'b') throw erro
    })
    const resultado = await enviarEmSequencia(['a', 'b', 'c'], enviar)
    expect(enviar).toHaveBeenCalledTimes(2)
    expect(resultado).toEqual({ enviados: 1, falha: { item: 'b', motivo: erro }, pendentes: ['b', 'c'] })
  })

  it('avisa o início de cada envio com a posição', async () => {
    const aoIniciar = vi.fn()
    await enviarEmSequencia(['a', 'b'], async () => undefined, aoIniciar)
    expect(aoIniciar.mock.calls).toEqual([
      ['a', 0],
      ['b', 1],
    ])
  })
})

describe('formatarMensagemProgresso', () => {
  it('mostra posição, total e nome do arquivo', () => {
    expect(formatarMensagemProgresso(1, 3, 'Anexo I.pdf')).toBe('Enviando 2 de 3: Anexo I.pdf')
  })
})
