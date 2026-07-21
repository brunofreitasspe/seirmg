import { describe, expect, it } from 'vitest'
import { calcularDiasAteVencimento, classificarPrazo, extrairTextoMarcador, formatarDataBr, formatarDiasRestantes, isValidDate } from './prazos'

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

describe('calcularDiasAteVencimento', () => {
  const agora = new Date(2026, 0, 10)

  it('calcula dias restantes até uma data futura', () => {
    expect(calcularDiasAteVencimento('20/01/2026', agora)).toBe(11)
  })

  it('calcula dias já vencidos (negativo) para uma data passada', () => {
    expect(calcularDiasAteVencimento('01/01/2026', agora)).toBe(-8)
  })

  it('retorna 1 quando a data de vencimento é hoje', () => {
    expect(calcularDiasAteVencimento('10/01/2026', agora)).toBe(1)
  })

  it('retorna null para texto de data inválido', () => {
    expect(calcularDiasAteVencimento('31/02/2026', agora)).toBeNull()
  })

  it('retorna null para texto fora do formato dd/mm/yyyy', () => {
    expect(calcularDiasAteVencimento('2026-01-20', agora)).toBeNull()
  })
})

describe('classificarPrazo', () => {
  const config = { alerta: 10, critico: 5 }

  it('classifica alerta quando entre crítico (inclusive) e alerta (exclusive)', () => {
    expect(classificarPrazo(5, config)).toBe('alerta')
    expect(classificarPrazo(9, config)).toBe('alerta')
  })

  it('classifica crítico quando abaixo do crítico', () => {
    expect(classificarPrazo(4, config)).toBe('critico')
  })

  it('classifica crítico para valores bem negativos (vencido há dias)', () => {
    expect(classificarPrazo(-10, config)).toBe('critico')
  })

  it('não classifica quando dentro do normal (>= alerta)', () => {
    expect(classificarPrazo(10, config)).toBeNull()
  })
})

describe('formatarDataBr', () => {
  it('formata com zero à esquerda em dia e mês', () => {
    expect(formatarDataBr(new Date(2026, 0, 5))).toBe('05/01/2026')
  })

  it('formata corretamente dia e mês de dois dígitos', () => {
    expect(formatarDataBr(new Date(2026, 10, 25))).toBe('25/11/2026')
  })
})

describe('formatarDiasRestantes', () => {
  it('mostra "Vence hoje" quando dias é 1 (convenção de calcularDiasAteVencimento)', () => {
    expect(formatarDiasRestantes(1)).toBe('Vence hoje')
  })

  it('mostra "Vence em 1 dia" no singular', () => {
    expect(formatarDiasRestantes(2)).toBe('Vence em 1 dia')
  })

  it('mostra "Vence em N dias" no plural', () => {
    expect(formatarDiasRestantes(11)).toBe('Vence em 10 dias')
  })

  it('mostra "Venceu há 1 dia" no singular quando dias é 0', () => {
    expect(formatarDiasRestantes(0)).toBe('Venceu há 1 dia')
  })

  it('mostra "Venceu há N dias" no plural quando bem negativo', () => {
    expect(formatarDiasRestantes(-8)).toBe('Venceu há 9 dias')
  })
})
