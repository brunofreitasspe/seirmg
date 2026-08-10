import { describe, expect, it } from 'vitest'
import {
  montarCelulaMarcadoresCongelados,
  montarCelulaPrazoCongelado,
  montarCelulaAtribuicao,
  obterMarcadoresDaLinha,
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

function criarLinha(html: string): Element {
  const doc = new DOMParser().parseFromString(`<table><tbody><tr>${html}</tr></tbody></table>`, 'text/html')
  return doc.querySelector('tr') as Element
}

describe('obterMarcadoresDaLinha', () => {
  it('extrai nome, estilo e ícone de um marcador', () => {
    const linha = criarLinha(
      `<td><a href="controlador.php?acao=andamento_marcador_gerenciar" style="background:#dc3545" onmouseover="return infraTooltipMostrar('','Urgente')"><img class="imagemStatus"></a></td>`
    )
    const marcadores = obterMarcadoresDaLinha(linha)
    expect(marcadores).toEqual([
      { nome: 'Urgente', estilo: 'background:#dc3545', iconeHtml: '<img class="imagemStatus">' },
    ])
  })

  it('retorna array vazio quando não há marcador', () => {
    expect(obterMarcadoresDaLinha(criarLinha('<td>sem marcador</td>'))).toEqual([])
  })

  it('ignora marcador cujo onmouseover não tem segundo argumento (nome vazio)', () => {
    const linha = criarLinha(
      `<td><a href="controlador.php?acao=andamento_marcador_gerenciar" onmouseover="return infraTooltipMostrar('')"></a></td>`
    )
    expect(obterMarcadoresDaLinha(linha)).toEqual([])
  })

  it('extrai múltiplos marcadores na mesma linha', () => {
    const linha = criarLinha(
      `<td>
        <a href="controlador.php?acao=andamento_marcador_gerenciar" onmouseover="return infraTooltipMostrar('','Urgente')"></a>
        <a href="controlador.php?acao=andamento_marcador_gerenciar" onmouseover="return infraTooltipMostrar('','Jurídico')"></a>
      </td>`
    )
    expect(obterMarcadoresDaLinha(linha).map((m) => m.nome)).toEqual(['Urgente', 'Jurídico'])
  })
})
