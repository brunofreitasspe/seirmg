// Utilitários de DOM compartilhados pela página do agente e pelo Estúdio de Fluxos.
export function criarElemento<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classe?: string,
  texto?: string
): HTMLElementTagNameMap[K] {
  const elemento = document.createElement(tag)
  if (classe) elemento.className = classe
  if (texto !== undefined) elemento.textContent = texto
  return elemento
}

export function criarIcone(svg: string, classe = 'icone'): HTMLSpanElement {
  const span = criarElemento('span', classe)
  span.setAttribute('aria-hidden', 'true')
  span.innerHTML = svg
  return span
}

export function criarBotao(texto: string, opcoes: { variante?: 'primario' | 'perigo' | 'fantasma'; icone?: string } = {}): HTMLButtonElement {
  const botao = criarElemento('button', `btn${opcoes.variante ? ` btn-${opcoes.variante}` : ''}`)
  botao.type = 'button'
  if (opcoes.icone) botao.append(criarIcone(opcoes.icone))
  botao.append(texto)
  return botao
}

export function criarBotaoIcone(icone: string, rotulo: string): HTMLButtonElement {
  const botao = criarElemento('button', 'btn-icone')
  botao.type = 'button'
  botao.title = rotulo
  botao.setAttribute('aria-label', rotulo)
  botao.append(criarIcone(icone))
  return botao
}
