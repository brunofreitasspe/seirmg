import { describe, expect, it } from 'vitest'
import {
  montarCelulaMarcadoresCongelados,
  montarCelulaPrazoCongelado,
  montarCelulaAtribuicao,
} from './favoritosRender'

describe('montarCelulaMarcadoresCongelados', () => {
  it('mostra "—" quando não há marcadores', () => {
    const td = montarCelulaMarcadoresCongelados([])
    expect(td.textContent).toBe('—')
    expect(td.className).toBe('seirmg-favoritos-vazio')
  })

  it('monta um pill por nome de marcador', () => {
    const td = montarCelulaMarcadoresCongelados(['Urgente', 'Prioridade'])
    expect(td.querySelectorAll('.seirmg-favoritos-marcador')).toHaveLength(2)
    expect(td.textContent).toContain('Urgente')
    expect(td.textContent).toContain('Prioridade')
  })
})

describe('montarCelulaPrazoCongelado', () => {
  it('mostra "—" quando não há data de prazo', () => {
    const td = montarCelulaPrazoCongelado(null)
    expect(td.textContent).toBe('—')
  })

  it('mostra a data e os dias restantes formatados', () => {
    const amanha = new Date()
    amanha.setDate(amanha.getDate() + 1)
    const dataTexto = `${String(amanha.getDate()).padStart(2, '0')}/${String(amanha.getMonth() + 1).padStart(2, '0')}/${amanha.getFullYear()}`
    const td = montarCelulaPrazoCongelado(dataTexto)
    expect(td.textContent).toContain(dataTexto)
  })
})

describe('montarCelulaAtribuicao', () => {
  it('mostra "—" quando não há atribuição', () => {
    const td = montarCelulaAtribuicao(null)
    expect(td.textContent).toBe('—')
  })

  it('mostra o nome do atribuído', () => {
    const td = montarCelulaAtribuicao('joao.silva')
    expect(td.textContent).toContain('joao.silva')
  })
})
