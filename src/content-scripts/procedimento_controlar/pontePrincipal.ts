import { EVENTO_CLIQUE_MARCADOR_RAPIDO } from './protocoloMarcadorRapido'
import type { ChaveAcaoMarcadorRapido, DetalheCliqueMarcadorRapido } from './protocoloMarcadorRapido'

const IDS_TABELAS = ['#tblProcessosDetalhado', '#tblProcessosGerados', '#tblProcessosRecebidos']

function contarCheckboxesMarcados(documentoGlobal: Document): number {
  return IDS_TABELAS.reduce((total, idTabela) => {
    const tabela = documentoGlobal.querySelector(idTabela)
    return total + (tabela ? tabela.querySelectorAll('tbody input[type="checkbox"]:checked').length : 0)
  }, 0)
}

export interface PonteMarcadorRapidoMainWorld {
  destruir: () => void
}

// Confirmado ao vivo nesta sessão: o mesmo listener (capturing + stopImmediatePropagation)
// bloqueia a navegação nativa quando registrado a partir do main world, mas não tem nenhum
// efeito quando registrado pelo content script isolado -- o onclick inline do link é
// compilado/executado no realm da própria página, e stopImmediatePropagation() chamado por um
// listener do isolated world não impede esse handler de rodar (mesma classe de armadilha já
// vista no CKEditor, ver documento_editar/pontePrincipal.ts). Por isso a decisão de
// interceptar (contagem de selecionados) e o preventDefault/stopImmediatePropagation
// precisam acontecer aqui, no main world; o isolated world só recebe o aviso via CustomEvent
// e faz o trabalho de verdade (fetch/popup), que não precisa nem consegue rodar no main world
// (sem acesso às APIs da extensão).
export function criarPonteMarcadorRapidoMainWorld(
  documentoGlobal: Document,
  janelaGlobal: Window
): PonteMarcadorRapidoMainWorld {
  function tratarClique(evento: Event): void {
    const alvo = (evento as MouseEvent).target
    if (!(alvo instanceof Element)) return

    const link = alvo.closest<HTMLAnchorElement>(
      '#divComandos a[onclick*="andamento_marcador_cadastrar"], #divComandos a[onclick*="andamento_marcador_remover"]'
    )
    if (!link) return

    if (contarCheckboxesMarcados(documentoGlobal) !== 1) return

    evento.preventDefault()
    evento.stopImmediatePropagation()

    const onclick = link.getAttribute('onclick') ?? ''
    const chave: ChaveAcaoMarcadorRapido = onclick.includes('andamento_marcador_cadastrar') ? 'adicionar' : 'remover'

    const detalhe: DetalheCliqueMarcadorRapido = { chave }
    janelaGlobal.dispatchEvent(new CustomEvent(EVENTO_CLIQUE_MARCADOR_RAPIDO, { detail: detalhe }))
  }

  documentoGlobal.addEventListener('click', tratarClique, true)

  return {
    destruir(): void {
      documentoGlobal.removeEventListener('click', tratarClique, true)
    },
  }
}
