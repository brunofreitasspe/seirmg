export interface RespostaConsultaPlanka {
  tipoProcesso: string | null
  localizacao: string | null
  ultimoComentario: string | null
}

const ESTILO_PLANKA = `
  .seirmg-planka-pills { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
  .seirmg-planka-pill { border-radius: 12px; padding: 3px 10px; font-size: 12px; }
  .seirmg-planka-pill-tipo { background: #e8f2ff; color: #017fff; font-weight: 600; }
  .seirmg-planka-pill-localizacao { background: #eee; color: #444; }
  .seirmg-planka-comentario { border-left: 3px solid #017fff; padding: 6px 10px; background: #fafafa; font-size: 13px; color: #555; font-style: italic; }
`

export function montarEstiloPlanka(): void {
  if (document.getElementById('seirmg-estilo-planka')) return
  const style = document.createElement('style')
  style.id = 'seirmg-estilo-planka'
  style.textContent = ESTILO_PLANKA
  document.head.appendChild(style)
}

export function montarConteudoCardPlanka(dados: RespostaConsultaPlanka): HTMLElement | null {
  const divConteudo = document.createElement('div')

  const pills = document.createElement('div')
  pills.className = 'seirmg-planka-pills'

  if (dados.tipoProcesso) {
    const pillTipo = document.createElement('span')
    pillTipo.className = 'seirmg-planka-pill seirmg-planka-pill-tipo'
    pillTipo.textContent = `📋 ${dados.tipoProcesso}`
    pills.appendChild(pillTipo)
  }

  if (dados.localizacao) {
    const pillLocalizacao = document.createElement('span')
    pillLocalizacao.className = 'seirmg-planka-pill seirmg-planka-pill-localizacao'
    pillLocalizacao.textContent = `📍 ${dados.localizacao}`
    pills.appendChild(pillLocalizacao)
  }

  if (pills.childElementCount > 0) divConteudo.appendChild(pills)

  if (dados.ultimoComentario) {
    const comentario = document.createElement('div')
    comentario.className = 'seirmg-planka-comentario'
    comentario.textContent = dados.ultimoComentario
    divConteudo.appendChild(comentario)
  }

  if (divConteudo.childElementCount === 0) return null

  return divConteudo
}
