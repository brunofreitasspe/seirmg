import { describe, expect, it } from 'vitest'
import { lerContextoProcesso } from './contexto'

describe('lerContextoProcesso', () => {
  it('modo avulso (sem idProcedimento) devolve null', () => {
    expect(lerContextoProcesso('?ferramenta=juntar')).toBeNull()
  })

  it('lê id, url assinada e número do processo', () => {
    const busca = `?${new URLSearchParams({ idProcedimento: '1', urlIncluir: 'https://x/sei/controlador.php?a=1&b=2', numeroProcesso: '2026.0.000123-4' })}`
    expect(lerContextoProcesso(busca)).toEqual({
      idProcedimento: '1',
      urlIncluir: 'https://x/sei/controlador.php?a=1&b=2',
      numeroProcesso: '2026.0.000123-4',
    })
  })

  it('campos opcionais ausentes viram null', () => {
    expect(lerContextoProcesso('?idProcedimento=1')).toEqual({ idProcedimento: '1', urlIncluir: null, numeroProcesso: null })
  })
})
