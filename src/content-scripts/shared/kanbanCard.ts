import type { MarcadorFavorito } from '../../features/controle-processos/favoritosRender'

export interface DadosCardKanban {
  numero: string
  tipoProcesso: string | null
  especificacao: string | null
  marcadores: MarcadorFavorito[]
  atribuicao: string | null
  prazoTexto: string | null
  documentoAlterado: boolean
  naoRecebido: boolean
}

const ESTILO_KANBAN_CARD = `
  .seirmg-kanban-card-marcadores { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
  .seirmg-kanban-card-marcador { display: inline-flex; align-items: center; border-radius: 3px; padding: 1px 6px; font-size: 11px; }
  .seirmg-kanban-card-marcador-icone { display: inline-flex; margin-right: 3px; }
  .seirmg-kanban-card-marcador-icone svg, .seirmg-kanban-card-marcador-icone img { width: 12px; height: 12px; }
  .seirmg-kanban-card-tipo { font-size: 10px; color: #6c757d; margin-bottom: 4px; padding: 2px 6px; background: #f8f9fa; border-radius: 3px; border-left: 3px solid #6c757d; }
  .seirmg-kanban-card-especificacao { font-size: 12px; color: #333; line-height: 1.4; margin-bottom: 6px; font-weight: 500; }
  .seirmg-kanban-card-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
  .seirmg-kanban-card-badge { font-size: 10px; padding: 2px 6px; border-radius: 3px; font-weight: 500; }
  .seirmg-kanban-card-badge-alerta { background: #fff3cd; color: #856404; }
  .seirmg-kanban-card-badge-perigo { background: #f8d7da; color: #721c24; }
  .seirmg-kanban-card-meta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 10px; color: #6c757d; margin-bottom: 4px; }
  .seirmg-kanban-card-atribuicao { font-size: 10px; color: #555; background: #f8f9fa; padding: 3px 6px; border-radius: 3px; margin-top: 4px; border-left: 3px solid #017fff; }
`

export function montarEstiloKanbanCard(): void {
  if (document.getElementById('seirmg-estilo-kanban-card')) return
  const style = document.createElement('style')
  style.id = 'seirmg-estilo-kanban-card'
  style.textContent = ESTILO_KANBAN_CARD
  document.head.appendChild(style)
}

export function montarConteudoCardKanban(dados: DadosCardKanban): HTMLElement {
  const raiz = document.createElement('div')

  if (dados.marcadores.length > 0) {
    const linhaMarcadores = document.createElement('div')
    linhaMarcadores.className = 'seirmg-kanban-card-marcadores'
    dados.marcadores.forEach(({ nome, estilo, iconeHtml }) => {
      const pill = document.createElement('span')
      pill.className = 'seirmg-kanban-card-marcador'
      if (estilo) pill.setAttribute('style', estilo)
      if (iconeHtml.trim()) {
        const icone = document.createElement('span')
        icone.className = 'seirmg-kanban-card-marcador-icone'
        icone.innerHTML = iconeHtml
        pill.appendChild(icone)
      }
      pill.appendChild(document.createTextNode(nome))
      linhaMarcadores.appendChild(pill)
    })
    raiz.appendChild(linhaMarcadores)
  }

  if (dados.tipoProcesso) {
    const tipo = document.createElement('div')
    tipo.className = 'seirmg-kanban-card-tipo'
    tipo.textContent = dados.tipoProcesso
    raiz.appendChild(tipo)
  }

  if (dados.especificacao) {
    const especificacao = document.createElement('div')
    especificacao.className = 'seirmg-kanban-card-especificacao'
    especificacao.textContent = dados.especificacao
    raiz.appendChild(especificacao)
  }

  const badges: Array<{ texto: string; classe: string }> = []
  if (dados.naoRecebido) badges.push({ texto: 'Não recebido', classe: 'seirmg-kanban-card-badge-perigo' })
  if (dados.documentoAlterado) {
    badges.push({ texto: '⚠ Documento incluído/assinado', classe: 'seirmg-kanban-card-badge-alerta' })
  }
  if (badges.length > 0) {
    const linhaBadges = document.createElement('div')
    linhaBadges.className = 'seirmg-kanban-card-badges'
    badges.forEach(({ texto, classe }) => {
      const badge = document.createElement('span')
      badge.className = `seirmg-kanban-card-badge ${classe}`
      badge.textContent = texto
      linhaBadges.appendChild(badge)
    })
    raiz.appendChild(linhaBadges)
  }

  const metaPartes = [dados.prazoTexto].filter((parte): parte is string => !!parte)
  if (metaPartes.length > 0) {
    const meta = document.createElement('div')
    meta.className = 'seirmg-kanban-card-meta'
    metaPartes.forEach((parte) => {
      const span = document.createElement('span')
      span.textContent = parte
      meta.appendChild(span)
    })
    raiz.appendChild(meta)
  }

  if (dados.atribuicao) {
    const atribuicao = document.createElement('div')
    atribuicao.className = 'seirmg-kanban-card-atribuicao'
    atribuicao.textContent = dados.atribuicao
    raiz.appendChild(atribuicao)
  }

  return raiz
}
