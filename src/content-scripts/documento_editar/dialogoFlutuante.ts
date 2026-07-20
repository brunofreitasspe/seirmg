export function criarPainelFlutuante(titulo: string, iconeSvg: string): { painel: HTMLDivElement; corpo: HTMLDivElement } {
  const painel = document.createElement('div')
  painel.className = 'seirmg-painel-flutuante'

  const cabecalho = document.createElement('div')
  cabecalho.className = 'seirmg-painel-flutuante-cabecalho'
  const icone = document.createElement('span')
  icone.innerHTML = iconeSvg
  const tituloSpan = document.createElement('span')
  tituloSpan.textContent = titulo
  cabecalho.append(icone, tituloSpan)

  const corpo = document.createElement('div')
  corpo.className = 'seirmg-painel-flutuante-corpo'

  painel.append(cabecalho, corpo)
  return { painel, corpo }
}

export function criarBotaoDialogo(texto: string, iconeSvg: string, classeExtra = ''): HTMLButtonElement {
  const botao = document.createElement('button')
  botao.type = 'button'
  botao.className = `seirmg-btn-acao ${classeExtra}`.trim()
  const icone = document.createElement('span')
  icone.className = 'seirmg-btn-acao-icone'
  icone.innerHTML = iconeSvg
  botao.append(icone, document.createTextNode(texto))
  return botao
}

export function fecharPainel(painel: HTMLElement): void {
  painel.remove()
}
