import { fetchText as fetchTextReal } from '../../lib/result'
import type { Result } from '../../lib/result'

export interface FetchListaProcessosDeps {
  fetchText?: typeof fetchTextReal
}

export async function fetchListaProcessos(
  baseUrlSei: string,
  deps: FetchListaProcessosDeps = {}
): Promise<Result<Document>> {
  const fetchTextFn = deps.fetchText ?? fetchTextReal
  const url = `${baseUrlSei}/controlador.php?acao=procedimento_controlar`
  const corpo = new URLSearchParams()
  corpo.append('hdnTipoVisualizacao', 'D')

  const primeiraTentativa = await fetchTextFn(url, { method: 'POST', body: corpo })
  if (!primeiraTentativa.ok) return primeiraTentativa

  const doc = new DOMParser().parseFromString(primeiraTentativa.data, 'text/html')
  const form = doc.querySelector('#frmProcedimentoControlar')
  const tipoVisualizacao = form?.querySelector<HTMLInputElement>('#hdnTipoVisualizacao')?.value

  if (tipoVisualizacao === 'D') return { ok: true, data: doc }

  const acaoRedirecionamento = form?.getAttribute('action')
  if (!acaoRedirecionamento) {
    return { ok: false, error: 'Formulário de redirecionamento sem action' }
  }

  const segundaTentativa = await fetchTextFn(`${baseUrlSei}${acaoRedirecionamento}`, {
    method: 'POST',
    body: corpo,
  })
  if (!segundaTentativa.ok) return segundaTentativa

  return { ok: true, data: new DOMParser().parseFromString(segundaTentativa.data, 'text/html') }
}
