import { describe, expect, it } from 'vitest'
import { atualizarSnapshotAlterados, type LinhaVisivelComAlterado } from './snapshotAlterados'
import type { SnapshotAlteradoProcesso } from '../../lib/storage'

const AGORA = '2026-08-24T10:00:00.000Z'

describe('atualizarSnapshotAlterados', () => {
  it('adiciona uma entrada nova quando a linha visível está alterada e não existe entrada anterior', () => {
    const linhas: LinhaVisivelComAlterado[] = [
      { numero: 'HMMG.1', alterado: true, especificacao: 'Aquisição', link: 'controlador.php?id=1' },
    ]
    const resultado = atualizarSnapshotAlterados([], linhas, AGORA)
    expect(resultado.mudou).toBe(true)
    expect(resultado.itens).toEqual([
      { numero: 'HMMG.1', especificacao: 'Aquisição', link: 'controlador.php?id=1', vistoEm: AGORA },
    ])
  })

  it('atualiza uma entrada existente quando os dados superficiais mudaram', () => {
    const atuais: SnapshotAlteradoProcesso[] = [
      { numero: 'HMMG.1', especificacao: 'Aquisição', link: 'controlador.php?id=1', vistoEm: '2026-08-01T10:00:00.000Z' },
    ]
    const linhas: LinhaVisivelComAlterado[] = [
      { numero: 'HMMG.1', alterado: true, especificacao: 'Compra', link: 'controlador.php?id=1' },
    ]
    const resultado = atualizarSnapshotAlterados(atuais, linhas, AGORA)
    expect(resultado.mudou).toBe(true)
    expect(resultado.itens).toEqual([
      { numero: 'HMMG.1', especificacao: 'Compra', link: 'controlador.php?id=1', vistoEm: AGORA },
    ])
  })

  it('não marca mudou quando a linha visível tem exatamente os mesmos dados já salvos', () => {
    const atuais: SnapshotAlteradoProcesso[] = [
      { numero: 'HMMG.1', especificacao: 'Aquisição', link: 'controlador.php?id=1', vistoEm: '2026-08-01T10:00:00.000Z' },
    ]
    const linhas: LinhaVisivelComAlterado[] = [
      { numero: 'HMMG.1', alterado: true, especificacao: 'Aquisição', link: 'controlador.php?id=1' },
    ]
    const resultado = atualizarSnapshotAlterados(atuais, linhas, AGORA)
    expect(resultado.mudou).toBe(false)
    expect(resultado.itens).toEqual(atuais)
  })

  it('remove a entrada quando a linha revisitada não está mais alterada', () => {
    const atuais: SnapshotAlteradoProcesso[] = [
      { numero: 'HMMG.1', especificacao: 'Aquisição', link: 'controlador.php?id=1', vistoEm: '2026-08-01T10:00:00.000Z' },
    ]
    const linhas: LinhaVisivelComAlterado[] = [
      { numero: 'HMMG.1', alterado: false, especificacao: 'Aquisição', link: 'controlador.php?id=1' },
    ]
    const resultado = atualizarSnapshotAlterados(atuais, linhas, AGORA)
    expect(resultado.mudou).toBe(true)
    expect(resultado.itens).toEqual([])
  })

  it('não mexe em uma entrada cujo processo não aparece nas linhas visíveis desta página', () => {
    const atuais: SnapshotAlteradoProcesso[] = [
      { numero: 'HMMG.1', especificacao: 'Aquisição', link: 'controlador.php?id=1', vistoEm: '2026-08-01T10:00:00.000Z' },
    ]
    const resultado = atualizarSnapshotAlterados(atuais, [], AGORA)
    expect(resultado.mudou).toBe(false)
    expect(resultado.itens).toEqual(atuais)
  })

  it('lida com lista de entradas atuais vazia e nenhuma linha visível sem quebrar', () => {
    const resultado = atualizarSnapshotAlterados([], [], AGORA)
    expect(resultado).toEqual({ itens: [], mudou: false })
  })

  it('mistura adição, atualização, remoção e entrada intocada numa única chamada', () => {
    const atuais: SnapshotAlteradoProcesso[] = [
      { numero: 'HMMG.1', link: null, vistoEm: '2026-08-01T10:00:00.000Z' },
      { numero: 'HMMG.2', link: null, vistoEm: '2026-08-01T10:00:00.000Z' },
      { numero: 'HMMG.3', link: null, vistoEm: '2026-08-01T10:00:00.000Z' },
    ]
    const linhas: LinhaVisivelComAlterado[] = [
      { numero: 'HMMG.1', alterado: true, link: null },
      { numero: 'HMMG.2', alterado: false, link: null },
      { numero: 'HMMG.4', alterado: true, link: null },
    ]
    const resultado = atualizarSnapshotAlterados(atuais, linhas, AGORA)
    expect(resultado.mudou).toBe(true)
    const porNumero = new Map(resultado.itens.map((item) => [item.numero, item]))
    expect(porNumero.get('HMMG.1')).toEqual(atuais[0])
    expect(porNumero.has('HMMG.2')).toBe(false)
    expect(porNumero.get('HMMG.3')).toEqual(atuais[2])
    expect(porNumero.get('HMMG.4')).toEqual({ numero: 'HMMG.4', link: null, vistoEm: AGORA })
  })
})
