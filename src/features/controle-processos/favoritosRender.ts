import { calcularDiasAteVencimento, formatarDiasRestantes } from './prazos'
import { extrairNomeMarcador } from './agrupamento'
import flagIconSvg from 'lucide-static/icons/flag.svg?raw'
import clockIconSvg from 'lucide-static/icons/clock.svg?raw'
import userIconSvg from 'lucide-static/icons/user.svg?raw'

export function criarIcone(svg: string): HTMLElement {
  const icone = document.createElement('span')
  icone.className = 'seirmg-favoritos-icone'
  icone.innerHTML = svg
  return icone
}

export interface MarcadorFavorito {
  nome: string
  estilo: string | null
  iconeHtml: string
}

export function obterMarcadoresDaLinha(linha: Element): MarcadorFavorito[] {
  const marcadores = Array.from(
    linha.querySelectorAll<HTMLAnchorElement>("td > a[href*='acao=andamento_marcador_gerenciar']")
  )
  return marcadores
    .map((marcador) => {
      const onmouseover = marcador.getAttribute('onmouseover')
      return {
        nome: onmouseover ? extrairNomeMarcador(onmouseover) : '',
        estilo: marcador.getAttribute('style'),
        iconeHtml: marcador.innerHTML,
      }
    })
    .filter((item) => item.nome !== '')
}

export function montarCelulaMarcadoresCongelados(nomes: string[]): HTMLTableCellElement {
  const td = document.createElement('td')
  if (nomes.length === 0) {
    td.className = 'seirmg-favoritos-vazio'
    td.textContent = '—'
    return td
  }
  nomes.forEach((nome) => {
    const pill = document.createElement('span')
    pill.className = 'seirmg-favoritos-marcador'
    pill.appendChild(criarIcone(flagIconSvg))
    pill.appendChild(document.createTextNode(nome))
    td.appendChild(pill)
  })
  return td
}

export function montarCelulaPrazoCongelado(prazoDataTexto: string | null): HTMLTableCellElement {
  const td = document.createElement('td')
  if (!prazoDataTexto) {
    td.className = 'seirmg-favoritos-vazio'
    td.textContent = '—'
    return td
  }

  const linhaData = document.createElement('div')
  linhaData.className = 'seirmg-favoritos-prazo'
  linhaData.appendChild(criarIcone(clockIconSvg))
  linhaData.appendChild(document.createTextNode(prazoDataTexto))
  td.appendChild(linhaData)

  const dias = calcularDiasAteVencimento(prazoDataTexto, new Date())
  const linhaDias = document.createElement('div')
  linhaDias.className = 'seirmg-favoritos-prazo-data'
  linhaDias.textContent = dias === null ? '' : formatarDiasRestantes(dias)
  td.appendChild(linhaDias)

  return td
}

export function montarCelulaAtribuicao(atribuicao: string | null): HTMLTableCellElement {
  const td = document.createElement('td')
  if (!atribuicao) {
    td.className = 'seirmg-favoritos-vazio'
    td.textContent = '—'
    return td
  }
  td.appendChild(criarIcone(userIconSvg))
  td.appendChild(document.createTextNode(atribuicao))
  return td
}
