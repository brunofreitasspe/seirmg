import { describe, expect, it } from 'vitest'
import { extrairDocumentosPendentes } from './detectarPendencias'

const ARVORE_HTML = `
<div id="divArvore">
  <span>
    <img src="svg/documento_interno.svg?11" id="icon100" title="Despacho">
    <a id="anchorUG100" href="#" class="infraArvoreInformacao"><span>HMMG-DIR ADM</span></a>
    <a id="anchor100" href="#">Despacho 1/2026</a>
    <a id="anchorA100" href="#" class="infraArvoreNoAcao"><img src="svg/assinatura2.svg?11" id="iconA100" title="Assinado por: FULANO"></a>
  </span>
  <span>
    <a id="anchorImg200" href="#"><img src="svg/documento_interno.svg?11" id="icon200" title="Menu cópia protocolo"></a>
    <a id="anchorUG200" href="#" class="infraArvoreInformacao"><span>HMMG-DIR ADM</span></a>
    <a id="anchor200" href="#">Ofício 2/2026</a>
  </span>
  <span>
    <a id="anchorImg300" href="#"><img src="svg/documento_interno.svg?11" id="icon300" title="Menu cópia protocolo"></a>
    <a id="anchorUG300" href="#" class="infraArvoreInformacao"><span>HMMG-DJUR</span></a>
    <a id="anchor300" href="#">Parecer 3/2026</a>
  </span>
  <span>
    <a id="anchorImg400" href="#"><img src="svg/documento_externo.svg?11" id="icon400" title="Menu cópia protocolo"></a>
    <a id="anchor400" href="#">Comprovante 4/2026</a>
  </span>
</div>
`

function parseArvore(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('extrairDocumentosPendentes', () => {
  it('retorna só o documento interno não assinado da unidade atual', () => {
    const doc = parseArvore(ARVORE_HTML)
    expect(extrairDocumentosPendentes(doc, 'HMMG-DIR ADM')).toEqual([{ id: '200', nome: 'Ofício 2/2026' }])
  })

  it('ignora documento assinado', () => {
    const doc = parseArvore(ARVORE_HTML)
    const pendentes = extrairDocumentosPendentes(doc, 'HMMG-DIR ADM')
    expect(pendentes.find((p) => p.id === '100')).toBeUndefined()
  })

  it('ignora documento interno de outra unidade', () => {
    const doc = parseArvore(ARVORE_HTML)
    const pendentes = extrairDocumentosPendentes(doc, 'HMMG-DIR ADM')
    expect(pendentes.find((p) => p.id === '300')).toBeUndefined()
  })

  it('ignora documento externo (sem anchorUG)', () => {
    const doc = parseArvore(ARVORE_HTML)
    const pendentes = extrairDocumentosPendentes(doc, 'HMMG-DIR ADM')
    expect(pendentes.find((p) => p.id === '400')).toBeUndefined()
  })

  it('retorna vazio quando não há documentos na árvore', () => {
    const doc = parseArvore('<div id="divArvore"></div>')
    expect(extrairDocumentosPendentes(doc, 'HMMG-DIR ADM')).toEqual([])
  })

  it('usa fallback de nome quando não encontra o anchor do número do documento', () => {
    const html = `<span>
      <a id="anchorImg500" href="#"><img src="svg/documento_interno.svg?11" id="icon500" title="Menu cópia protocolo"></a>
      <a id="anchorUG500" href="#" class="infraArvoreInformacao"><span>HMMG-DIR ADM</span></a>
    </span>`
    const doc = parseArvore(html)
    expect(extrairDocumentosPendentes(doc, 'HMMG-DIR ADM')).toEqual([{ id: '500', nome: 'Documento 500' }])
  })
})
