import { beforeEach, describe, expect, it } from 'vitest'
import { ativarAba, idPainelParaAba } from './tabs'

describe('idPainelParaAba', () => {
  it('monta o id do painel a partir do nome da aba', () => {
    expect(idPainelParaAba('geral')).toBe('painel-geral')
  })
})

describe('ativarAba', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button data-aba="geral" class="ativa"></button>
      <button data-aba="aparencia"></button>
      <section id="painel-geral" class="ativo"></section>
      <section id="painel-aparencia"></section>
    `
  })

  it('marca o botão e o painel correspondentes como ativos', () => {
    const botoes = document.querySelectorAll('button')
    const paineis = document.querySelectorAll('section')

    ativarAba(botoes, paineis, 'aparencia')

    expect(document.querySelector('[data-aba="geral"]')?.classList.contains('ativa')).toBe(false)
    expect(document.querySelector('[data-aba="aparencia"]')?.classList.contains('ativa')).toBe(true)
    expect(document.getElementById('painel-geral')?.classList.contains('ativo')).toBe(false)
    expect(document.getElementById('painel-aparencia')?.classList.contains('ativo')).toBe(true)
  })
})
