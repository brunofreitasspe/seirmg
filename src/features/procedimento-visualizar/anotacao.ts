export interface AnotacaoDados {
  texto: string
  prioridade: boolean
  idProtocolo: string
  tipoPagina: string
  postUrl: string
}

export function parseAnotacaoDados(doc: Document): AnotacaoDados {
  return {
    texto: doc.getElementById('txaDescricao')?.textContent ?? '',
    prioridade: !!doc.querySelector('#chkSinPrioridade:checked'),
    idProtocolo: (doc.getElementById('hdnIdProtocolo') as HTMLInputElement | null)?.value ?? '',
    tipoPagina: (doc.getElementById('hdnInfraTipoPagina') as HTMLInputElement | null)?.value ?? '',
    postUrl: doc.getElementById('frmAnotacaoCadastro')?.getAttribute('action') ?? '',
  }
}

export function escapeComponentAnotacao(texto: string): string {
  return escape(texto).replace(/\+/g, '%2B')
}

export function montarCorpoSalvarAnotacao(dados: {
  texto: string
  prioridade: boolean
  idProtocolo: string
  tipoPagina: string
}): string {
  const txaDescricao = escapeComponentAnotacao(dados.texto.trim())
  const chkSinPrioridade = txaDescricao === '' ? 'off' : dados.prioridade ? 'on' : 'off'
  return `hdnInfraTipoPagina=${dados.tipoPagina}&sbmRegistrarAnotacao=Salvar&txaDescricao=${txaDescricao}&hdnIdProtocolo=${dados.idProtocolo}&chkSinPrioridade=${chkSinPrioridade}`
}
