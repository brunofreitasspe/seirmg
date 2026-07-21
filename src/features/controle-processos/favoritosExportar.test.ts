import { describe, expect, it } from 'vitest'
import {
  escaparCampoCsv,
  favoritosImportadosParaAdicionar,
  montarExportacaoFavoritos,
  montarLinhaCsv,
  parseImportacaoFavoritos,
} from './favoritosExportar'
import type { FavoritoProcesso, SnapshotFavorito } from '../../lib/storage'

const snapshot: SnapshotFavorito = {
  prazoDataTexto: '15/08/2026',
  atribuicao: 'joao.silva',
  marcadoresNomes: ['Urgente'],
}

const favorito: FavoritoProcesso = {
  numero: 'HMMG.2026.00123-4',
  link: 'controlador.php?acao=x',
  adicionadoEm: '2026-07-01T10:00:00.000Z',
  especificacao: 'Aquisição de equipamentos',
  ultimoSnapshot: snapshot,
}

describe('montarExportacaoFavoritos', () => {
  it('monta o objeto de exportação com só os campos relevantes, incluindo ultimoSnapshot', () => {
    const agora = new Date('2026-07-21T10:00:00.000Z')
    const exportacao = montarExportacaoFavoritos([favorito], '5.0', agora)

    expect(exportacao).toEqual({
      versaoSeirmg: '5.0',
      exportadoEm: '2026-07-21T10:00:00.000Z',
      favoritos: [
        {
          numero: 'HMMG.2026.00123-4',
          link: 'controlador.php?acao=x',
          adicionadoEm: '2026-07-01T10:00:00.000Z',
          especificacao: 'Aquisição de equipamentos',
          ultimoSnapshot: snapshot,
        },
      ],
    })
  })

  it('mantém ultimoSnapshot undefined quando o favorito não tem', () => {
    const semSnapshot: FavoritoProcesso = { numero: 'HMMG.1', link: null, adicionadoEm: '2026-07-01T10:00:00.000Z' }
    const exportacao = montarExportacaoFavoritos([semSnapshot], '5.0', new Date('2026-07-21T10:00:00.000Z'))
    expect(exportacao.favoritos[0].ultimoSnapshot).toBeUndefined()
  })
})

describe('parseImportacaoFavoritos', () => {
  it('faz parse de um JSON válido', () => {
    const json = JSON.stringify({
      versaoSeirmg: '5.0',
      exportadoEm: '2026-07-21T10:00:00.000Z',
      favoritos: [favorito],
    })
    expect(parseImportacaoFavoritos(json)).toEqual({
      versaoSeirmg: '5.0',
      exportadoEm: '2026-07-21T10:00:00.000Z',
      favoritos: [favorito],
    })
  })

  it('retorna null pra JSON inválido (sintaxe)', () => {
    expect(parseImportacaoFavoritos('{ isso não é json')).toBeNull()
  })

  it('retorna null quando falta o campo favoritos', () => {
    expect(parseImportacaoFavoritos(JSON.stringify({ versaoSeirmg: '5.0' }))).toBeNull()
  })

  it('retorna null quando favoritos não é um array', () => {
    expect(parseImportacaoFavoritos(JSON.stringify({ favoritos: 'não é array' }))).toBeNull()
  })
})

describe('favoritosImportadosParaAdicionar', () => {
  const exportacao = (favoritos: FavoritoProcesso[]) => ({
    versaoSeirmg: '5.0',
    exportadoEm: '2026-07-21T10:00:00.000Z',
    favoritos,
  })

  it('retorna todos quando nenhum já existe', () => {
    const resultado = favoritosImportadosParaAdicionar(exportacao([favorito]), [])
    expect(resultado).toEqual([favorito])
  })

  it('ignora favoritos cujo número já existe na lista atual', () => {
    const existente: FavoritoProcesso = { numero: 'HMMG.2026.00123-4', link: null, adicionadoEm: '2026-01-01T00:00:00.000Z' }
    const resultado = favoritosImportadosParaAdicionar(exportacao([favorito]), [existente])
    expect(resultado).toEqual([])
  })

  it('mistura: só retorna os que ainda não existem', () => {
    const outro: FavoritoProcesso = { numero: 'HMMG.9', link: null, adicionadoEm: '2026-07-01T10:00:00.000Z' }
    const existente: FavoritoProcesso = { numero: 'HMMG.2026.00123-4', link: null, adicionadoEm: '2026-01-01T00:00:00.000Z' }
    const resultado = favoritosImportadosParaAdicionar(exportacao([favorito, outro]), [existente])
    expect(resultado).toEqual([outro])
  })
})

describe('escaparCampoCsv', () => {
  it('não mexe em texto sem caractere especial', () => {
    expect(escaparCampoCsv('HMMG.2026.00123-4')).toBe('HMMG.2026.00123-4')
  })

  it('envolve em aspas quando tem ponto-e-vírgula', () => {
    expect(escaparCampoCsv('a; b')).toBe('"a; b"')
  })

  it('envolve em aspas e dobra aspas internas', () => {
    expect(escaparCampoCsv('disse "oi"')).toBe('"disse ""oi"""')
  })

  it('envolve em aspas quando tem quebra de linha', () => {
    expect(escaparCampoCsv('linha1\nlinha2')).toBe('"linha1\nlinha2"')
  })
})

describe('montarLinhaCsv', () => {
  it('junta campos com ponto-e-vírgula', () => {
    expect(montarLinhaCsv(['a', 'b', 'c'])).toBe('a;b;c')
  })

  it('aplica escape em cada campo', () => {
    expect(montarLinhaCsv(['a;b', 'c'])).toBe('"a;b";c')
  })
})
