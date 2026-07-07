import { describe, expect, it } from 'vitest'
import { detectarSeiVersaoMajor, detectarSeiVersionAtLeast4 } from './seiVersion'

function criarDocumentoComScript(src: string | null): Document {
  const doc = document.implementation.createHTMLDocument('teste')
  if (src) {
    const script = doc.createElement('script')
    script.setAttribute('src', src)
    doc.body.appendChild(script)
  }
  return doc
}

describe('detectarSeiVersionAtLeast4', () => {
  it('retorna true para versão 4.x', () => {
    expect(detectarSeiVersionAtLeast4(criarDocumentoComScript('js/sei.js?4.0.1'))).toBe(true)
  })

  it('retorna true para versão 5.x', () => {
    expect(detectarSeiVersionAtLeast4(criarDocumentoComScript('js/sei.js?5.0.0'))).toBe(true)
  })

  it('retorna false para versão 3.x', () => {
    expect(detectarSeiVersionAtLeast4(criarDocumentoComScript('js/sei.js?3.2.0'))).toBe(false)
  })

  it('assume true quando a versão não é detectável', () => {
    expect(detectarSeiVersionAtLeast4(criarDocumentoComScript(null))).toBe(true)
  })
})

describe('detectarSeiVersaoMajor', () => {
  it('retorna o primeiro dígito da versão para 4.x', () => {
    expect(detectarSeiVersaoMajor(criarDocumentoComScript('js/sei.js?4.0.1'))).toBe(4)
  })

  it('retorna o primeiro dígito da versão para 5.x', () => {
    expect(detectarSeiVersaoMajor(criarDocumentoComScript('js/sei.js?5.0.0'))).toBe(5)
  })

  it('retorna null quando a versão não é detectável', () => {
    expect(detectarSeiVersaoMajor(criarDocumentoComScript(null))).toBeNull()
  })
})
