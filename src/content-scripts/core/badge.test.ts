import { describe, expect, it } from 'vitest'
import { encontrarContainerBadge } from './badge'

describe('encontrarContainerBadge', () => {
  it('retorna o elemento pai do logo quando o logo existe', () => {
    document.body.innerHTML = '<div id="cabecalho"><a id="lnkInfraLogo"></a></div>'
    const container = encontrarContainerBadge(document)
    expect(container).toBe(document.getElementById('cabecalho'))
  })

  it('reconhece #divLogoSEI como alternativa', () => {
    document.body.innerHTML = '<div id="topo"><div id="divLogoSEI"></div></div>'
    expect(encontrarContainerBadge(document)).toBe(document.getElementById('topo'))
  })

  it('reconhece .infraLogo como alternativa', () => {
    document.body.innerHTML = '<div id="topo"><img class="infraLogo"></div>'
    expect(encontrarContainerBadge(document)).toBe(document.getElementById('topo'))
  })

  it('retorna null quando o logo não é encontrado, em vez de cair no body', () => {
    document.body.innerHTML = '<div>página sem nenhum dos seletores de logo</div>'
    expect(encontrarContainerBadge(document)).toBeNull()
  })
})
