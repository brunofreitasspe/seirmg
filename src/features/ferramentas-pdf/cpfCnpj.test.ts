import { describe, it, expect } from 'vitest'
import { encontrarCpfCnpj } from './cpfCnpj'

describe('encontrarCpfCnpj', () => {
  it('encontra CPF formatado', () => {
    const achados = encontrarCpfCnpj('Requerente: João, CPF 123.456.789-09, residente...')
    expect(achados).toEqual([{ valor: '123.456.789-09', tipo: 'cpf', indice: 22 }])
  })

  it('encontra CNPJ formatado', () => {
    const achados = encontrarCpfCnpj('Empresa inscrita no CNPJ 12.345.678/0001-95.')
    expect(achados[0]).toMatchObject({ valor: '12.345.678/0001-95', tipo: 'cnpj' })
  })

  it('não encontra nada em texto sem CPF/CNPJ', () => {
    expect(encontrarCpfCnpj('Texto qualquer sem documento.')).toEqual([])
  })
})
