import { fetchTextComGate as fetchTextReal } from '../sessionGate'
import type { Result } from '../../lib/result'
import { parseProcessosControlarTable } from '../../features/processos-novos/parser'
import type { ProcessoItem } from '../../features/processos-novos/types'

export interface InfoRedirecionamento {
  tipoVisualizacao?: string
  acaoRedirecionamento?: string | null
}

export function extrairInfoRedirecionamento(html: string): InfoRedirecionamento {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const form = doc.querySelector('#frmProcedimentoControlar')
  return {
    tipoVisualizacao: form?.querySelector<HTMLInputElement>('#hdnTipoVisualizacao')?.value,
    acaoRedirecionamento: form?.getAttribute('action'),
  }
}

function extrairProcessosPadrao(html: string): ProcessoItem[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return parseProcessosControlarTable(doc)
}

export interface FetchListaProcessosDeps {
  fetchText?: typeof fetchTextReal
  extrairInfoRedirecionamento?: (html: string) => InfoRedirecionamento | Promise<InfoRedirecionamento>
  extrairProcessos?: (html: string) => ProcessoItem[] | Promise<ProcessoItem[]>
}

export async function fetchListaProcessos(
  baseUrlSei: string,
  deps: FetchListaProcessosDeps = {}
): Promise<Result<ProcessoItem[]>> {
  const fetchTextFn = deps.fetchText ?? fetchTextReal
  const extrairInfo = deps.extrairInfoRedirecionamento ?? extrairInfoRedirecionamento
  const extrairProcessos = deps.extrairProcessos ?? extrairProcessosPadrao

  const url = `${baseUrlSei}/controlador.php?acao=procedimento_controlar`
  const corpo = new URLSearchParams()
  corpo.append('hdnTipoVisualizacao', 'D')

  const primeiraTentativa = await fetchTextFn(url, { method: 'POST', body: corpo })
  if (!primeiraTentativa.ok) return primeiraTentativa

  const info = await extrairInfo(primeiraTentativa.data)
  if (info.tipoVisualizacao === 'D') {
    return { ok: true, data: await extrairProcessos(primeiraTentativa.data) }
  }

  if (!info.acaoRedirecionamento) {
    return { ok: false, error: 'Formulário de redirecionamento sem action' }
  }

  const segundaTentativa = await fetchTextFn(`${baseUrlSei}${info.acaoRedirecionamento}`, {
    method: 'POST',
    body: corpo,
  })
  if (!segundaTentativa.ok) return segundaTentativa

  return { ok: true, data: await extrairProcessos(segundaTentativa.data) }
}
