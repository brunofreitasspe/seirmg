import type { DocumentoPendente } from './detectarPendencias'

export function montarDialogoAviso(pendencias: DocumentoPendente[], unidadeAtual: string): HTMLDialogElement {
  const dialog = document.createElement('dialog')
  dialog.className = 'seirmg-alerta-nao-assinados'

  const header = document.createElement('div')
  header.className = 'seirmg-alerta-nao-assinados-header'

  const icone = document.createElement('div')
  icone.className = 'seirmg-alerta-nao-assinados-icone'
  icone.textContent = '!'
  header.appendChild(icone)

  const textos = document.createElement('div')
  const titulo = document.createElement('strong')
  titulo.textContent = 'Documentos pendentes de assinatura'
  const subtitulo = document.createElement('p')
  subtitulo.className = 'seirmg-alerta-nao-assinados-subtitulo'
  subtitulo.textContent = `Unidade atual: ${unidadeAtual}`
  textos.append(titulo, subtitulo)
  header.appendChild(textos)
  dialog.appendChild(header)

  const lista = document.createElement('div')
  lista.className = 'seirmg-alerta-nao-assinados-lista'
  pendencias.forEach((pendencia) => {
    const item = document.createElement('div')
    item.className = 'seirmg-alerta-nao-assinados-item'
    item.textContent = pendencia.nome
    lista.appendChild(item)
  })
  dialog.appendChild(lista)

  const rodape = document.createElement('div')
  rodape.className = 'seirmg-alerta-nao-assinados-rodape'
  const btnEntendi = document.createElement('button')
  btnEntendi.type = 'button'
  btnEntendi.className = 'seirmg-alerta-nao-assinados-confirmar'
  btnEntendi.textContent = 'Entendi'
  rodape.appendChild(btnEntendi)
  dialog.appendChild(rodape)

  return dialog
}
