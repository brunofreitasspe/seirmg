import { describe, expect, it } from 'vitest'
import { atualizarSnapshotPrazos, type LinhaVisivelComPrazo } from './snapshotPrazos'
import type { SnapshotPrazoProcesso } from '../../lib/storage'

const AGORA = '2026-08-07T10:00:00.000Z'

describe('atualizarSnapshotPrazos', () => {
  it('adiciona uma entrada nova quando a linha visível tem prazo e não existe entrada anterior', () => {
    const linhas: LinhaVisivelComPrazo[] = [
      { numero: 'HMMG.1', prazoDataTexto: '15/08/2026', especificacao: 'Aquisição', link: 'controlador.php?id=1' },
    ]
    const resultado = atualizarSnapshotPrazos([], linhas, AGORA)
    expect(resultado.mudou).toBe(true)
    expect(resultado.itens).toEqual([
      { numero: 'HMMG.1', prazoDataTexto: '15/08/2026', especificacao: 'Aquisição', link: 'controlador.php?id=1', vistoEm: AGORA },
    ])
  })

  it('atualiza uma entrada existente quando o prazo mudou', () => {
    const atuais: SnapshotPrazoProcesso[] = [
      { numero: 'HMMG.1', prazoDataTexto: '15/08/2026', especificacao: 'Aquisição', link: 'controlador.php?id=1', vistoEm: '2026-08-01T10:00:00.000Z' },
    ]
    const linhas: LinhaVisivelComPrazo[] = [
      { numero: 'HMMG.1', prazoDataTexto: '20/08/2026', especificacao: 'Aquisição', link: 'controlador.php?id=1' },
    ]
    const resultado = atualizarSnapshotPrazos(atuais, linhas, AGORA)
    expect(resultado.mudou).toBe(true)
    expect(resultado.itens).toEqual([
      { numero: 'HMMG.1', prazoDataTexto: '20/08/2026', especificacao: 'Aquisição', link: 'controlador.php?id=1', vistoEm: AGORA },
    ])
  })

  it('não marca mudou quando a linha visível tem exatamente os mesmos dados já salvos', () => {
    const atuais: SnapshotPrazoProcesso[] = [
      { numero: 'HMMG.1', prazoDataTexto: '15/08/2026', especificacao: 'Aquisição', link: 'controlador.php?id=1', vistoEm: '2026-08-01T10:00:00.000Z' },
    ]
    const linhas: LinhaVisivelComPrazo[] = [
      { numero: 'HMMG.1', prazoDataTexto: '15/08/2026', especificacao: 'Aquisição', link: 'controlador.php?id=1' },
    ]
    const resultado = atualizarSnapshotPrazos(atuais, linhas, AGORA)
    expect(resultado.mudou).toBe(false)
    expect(resultado.itens).toEqual(atuais)
  })

  it('remove a entrada quando a linha revisitada não tem mais prazo', () => {
    const atuais: SnapshotPrazoProcesso[] = [
      { numero: 'HMMG.1', prazoDataTexto: '15/08/2026', especificacao: 'Aquisição', link: 'controlador.php?id=1', vistoEm: '2026-08-01T10:00:00.000Z' },
    ]
    const linhas: LinhaVisivelComPrazo[] = [{ numero: 'HMMG.1', prazoDataTexto: null, especificacao: 'Aquisição', link: 'controlador.php?id=1' }]
    const resultado = atualizarSnapshotPrazos(atuais, linhas, AGORA)
    expect(resultado.mudou).toBe(true)
    expect(resultado.itens).toEqual([])
  })

  it('não mexe em uma entrada cujo processo não aparece nas linhas visíveis desta página', () => {
    const atuais: SnapshotPrazoProcesso[] = [
      { numero: 'HMMG.1', prazoDataTexto: '15/08/2026', especificacao: 'Aquisição', link: 'controlador.php?id=1', vistoEm: '2026-08-01T10:00:00.000Z' },
    ]
    const resultado = atualizarSnapshotPrazos(atuais, [], AGORA)
    expect(resultado.mudou).toBe(false)
    expect(resultado.itens).toEqual(atuais)
  })

  it('lida com lista de entradas atuais vazia e nenhuma linha visível sem quebrar', () => {
    const resultado = atualizarSnapshotPrazos([], [], AGORA)
    expect(resultado).toEqual({ itens: [], mudou: false })
  })

  it('mistura adição, atualização, remoção e entrada intocada numa única chamada', () => {
    const atuais: SnapshotPrazoProcesso[] = [
      { numero: 'HMMG.1', prazoDataTexto: '15/08/2026', link: null, vistoEm: '2026-08-01T10:00:00.000Z' },
      { numero: 'HMMG.2', prazoDataTexto: '10/08/2026', link: null, vistoEm: '2026-08-01T10:00:00.000Z' },
      { numero: 'HMMG.3', prazoDataTexto: '01/08/2026', link: null, vistoEm: '2026-08-01T10:00:00.000Z' },
    ]
    const linhas: LinhaVisivelComPrazo[] = [
      { numero: 'HMMG.1', prazoDataTexto: '15/08/2026', link: null },
      { numero: 'HMMG.2', prazoDataTexto: null, link: null },
      { numero: 'HMMG.4', prazoDataTexto: '25/08/2026', link: null },
    ]
    const resultado = atualizarSnapshotPrazos(atuais, linhas, AGORA)
    expect(resultado.mudou).toBe(true)
    const porNumero = new Map(resultado.itens.map((item) => [item.numero, item]))
    expect(porNumero.get('HMMG.1')).toEqual(atuais[0])
    expect(porNumero.has('HMMG.2')).toBe(false)
    expect(porNumero.get('HMMG.3')).toEqual(atuais[2])
    expect(porNumero.get('HMMG.4')).toEqual({ numero: 'HMMG.4', prazoDataTexto: '25/08/2026', link: null, vistoEm: AGORA })
  })
})
