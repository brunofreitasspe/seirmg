import { describe, expect, it, vi } from 'vitest'
import { abrirGradeInsercao } from './tabelaDialogo'
import type { EditorSEI } from './ponteEditor'

describe('grade de inserção de tabela', () => {
  it('tem botão Cancelar, como os outros diálogos, que fecha sem inserir nada', () => {
    const inserirHtml = vi.fn().mockResolvedValue(undefined)
    abrirGradeInsercao({ inserirHtml } as unknown as EditorSEI)
    const painel = document.querySelector('.seirmg-painel-flutuante') as HTMLElement
    const cancelar = [...painel.querySelectorAll('button')].find((botao) => botao.textContent?.includes('Cancelar'))
    expect(cancelar).toBeDefined()
    cancelar!.click()
    expect(document.querySelector('.seirmg-painel-flutuante')).toBeNull()
    expect(inserirHtml).not.toHaveBeenCalled()
  })
})
