import { describe, expect, it, vi } from 'vitest'
import { gerarQrCodeDataUrl, montarQrCodeHtml, TAMANHOS_QR } from './qrCode'

// jsdom não tem canvas: um canvas falso registra o desenho e devolve um PNG fixo.
function criarCanvasFalso(): { canvas: HTMLCanvasElement; fillRect: ReturnType<typeof vi.fn>; toDataURL: ReturnType<typeof vi.fn> } {
  const fillRect = vi.fn()
  const toDataURL = vi.fn().mockReturnValue('data:image/png;base64,UE5H')
  const contexto = { fillStyle: '', fillRect }
  const canvas = { width: 0, height: 0, getContext: () => contexto, toDataURL } as unknown as HTMLCanvasElement
  return { canvas, fillRect, toDataURL }
}

describe('gerarQrCodeDataUrl', () => {
  it('desenha o QR num canvas do tamanho pedido e devolve PNG (o SEI recusa GIF)', async () => {
    const falso = criarCanvasFalso()
    const resultado = await gerarQrCodeDataUrl('https://sei.campinas.sp.gov.br', TAMANHOS_QR.medio, () => falso.canvas)
    expect(resultado).toEqual({ ok: true, dataUrl: 'data:image/png;base64,UE5H' })
    expect(falso.toDataURL).toHaveBeenCalledWith('image/png')
    expect(falso.canvas.width).toBe(150)
    expect(falso.canvas.height).toBe(150)
    // fundo branco + pelo menos um módulo escuro
    expect(falso.fillRect.mock.calls.length).toBeGreaterThan(1)
  })

  it('texto vazio não gera', async () => {
    expect(await gerarQrCodeDataUrl('   ', 150, () => criarCanvasFalso().canvas)).toEqual({
      ok: false,
      erro: 'Informe o texto ou link do QR Code.',
    })
  })

  it('texto longo demais pra um QR Code não gera e explica', async () => {
    const resultado = await gerarQrCodeDataUrl('x'.repeat(5000), 150, () => criarCanvasFalso().canvas)
    expect(resultado).toEqual({ ok: false, erro: 'Texto longo demais para um QR Code. Use um link mais curto.' })
  })
})

describe('montarQrCodeHtml', () => {
  it('imagem com classe, tamanho e texto alternativo escapado (inclusive aspas, por estar num atributo)', () => {
    expect(montarQrCodeHtml('a<b "c"', 'data:image/png;base64,AAA', 100)).toBe(
      '<img class="seirmg-qrcode" src="data:image/png;base64,AAA" width="100" height="100" alt="QR Code: a&lt;b &quot;c&quot;">'
    )
  })
})
