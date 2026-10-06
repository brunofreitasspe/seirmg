import { describe, it, expect } from 'vitest'
import { proximoPasso } from './fluxos'
import type { FluxoAgenteIA } from '../../lib/storage'

const fluxo: FluxoAgenteIA = {
  id: '1',
  nome: 'Analisar e resumir',
  passos: [{ instrucao: 'Liste os favoritos' }, { instrucao: '   ' }, { instrucao: 'Resuma o que encontrou' }],
}

describe('proximoPasso', () => {
  it('devolve o passo pelo índice, marcando se é o último', () => {
    expect(proximoPasso(fluxo, 0)).toEqual({ indice: 0, instrucao: 'Liste os favoritos', ultimo: false })
    expect(proximoPasso(fluxo, 2)).toEqual({ indice: 2, instrucao: 'Resuma o que encontrou', ultimo: true })
  })

  it('pula passos em branco (ainda não preenchidos no Estúdio)', () => {
    expect(proximoPasso(fluxo, 1)).toEqual({ indice: 2, instrucao: 'Resuma o que encontrou', ultimo: true })
  })

  it('índice fora do fluxo devolve null (fluxo encerrado)', () => {
    expect(proximoPasso(fluxo, 3)).toBeNull()
  })
})
