import { describe, expect, it } from 'vitest'
import { calcularDiasDoMarcador, classificarPrazo, extrairTextoMarcador, isValidDate } from './prazos'

describe('extrairTextoMarcador', () => {
  it('extrai o texto entre as duas primeiras aspas simples', () => {
    expect(extrairTextoMarcador("mostrarDica(this,'Concluído em 01/01/2026')")).toBe(
      'Concluído em 01/01/2026'
    )
  })

  it('retorna string vazia quando não há aspas suficientes', () => {
    expect(extrairTextoMarcador('semAspas')).toBe('')
  })
})

describe('isValidDate', () => {
  it('aceita datas válidas no formato dd/mm/yyyy', () => {
    expect(isValidDate('01/01/2026')).toBe(true)
  })

  it('rejeita datas com dia inválido', () => {
    expect(isValidDate('31/02/2026')).toBe(false)
  })

  it('rejeita strings fora do formato', () => {
    expect(isValidDate('2026-01-01')).toBe(false)
  })

  it('rejeita string vazia', () => {
    expect(isValidDate('')).toBe(false)
  })
})

describe('calcularDiasDoMarcador', () => {
  const agora = new Date(2026, 0, 10)

  it('calcula dias corridos (qtddias) desde a data do marcador', () => {
    expect(calcularDiasDoMarcador(['01/01/2026 - aberto'], 'qtddias', agora)).toBe(9)
  })

  it('calcula dias restantes (prazo) até a data do marcador, exigindo prefixo "ate "', () => {
    expect(calcularDiasDoMarcador(['ate 20/01/2026'], 'prazo', agora)).toBe(11)
  })

  it('ignora marcador de prazo sem o prefixo "ate "', () => {
    expect(calcularDiasDoMarcador(['aberto em 20/01/2026'], 'prazo', agora)).toBeNull()
  })

  it('usa o primeiro marcador válido e ignora os inválidos anteriores', () => {
    expect(calcularDiasDoMarcador(['texto sem data', 'ate 20/01/2026'], 'prazo', agora)).toBe(11)
  })

  it('retorna null quando nenhum marcador tem data válida', () => {
    expect(calcularDiasDoMarcador(['sem data aqui'], 'qtddias', agora)).toBeNull()
  })

  it('normaliza acento e caixa antes de interpretar o prefixo', () => {
    expect(calcularDiasDoMarcador(['ATÉ 20/01/2026'], 'prazo', agora)).toBe(11)
  })
})

describe('classificarPrazo', () => {
  const configDias = { alerta: 30, critico: 60 }
  const configPrazo = { alerta: 10, critico: 5 }

  it('qtddias: classifica alerta quando entre alerta (exclusive) e crítico (inclusive)', () => {
    expect(classificarPrazo(31, 'qtddias', configDias)).toBe('alerta')
    expect(classificarPrazo(60, 'qtddias', configDias)).toBe('alerta')
  })

  it('qtddias: classifica crítico quando acima do crítico', () => {
    expect(classificarPrazo(61, 'qtddias', configDias)).toBe('critico')
  })

  it('qtddias: não classifica quando dentro do normal', () => {
    expect(classificarPrazo(30, 'qtddias', configDias)).toBeNull()
  })

  it('prazo: classifica alerta quando entre crítico (inclusive) e alerta (exclusive)', () => {
    expect(classificarPrazo(5, 'prazo', configPrazo)).toBe('alerta')
    expect(classificarPrazo(9, 'prazo', configPrazo)).toBe('alerta')
  })

  it('prazo: classifica crítico quando abaixo do crítico', () => {
    expect(classificarPrazo(4, 'prazo', configPrazo)).toBe('critico')
  })

  it('prazo: não classifica quando dentro do normal', () => {
    expect(classificarPrazo(10, 'prazo', configPrazo)).toBeNull()
  })
})
