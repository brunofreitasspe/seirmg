// QR Code gerado no próprio navegador (qrcode-generator, sem rede), desenhado num canvas e
// exportado como PNG -- o SEI recusa GIF ao salvar ("Imagem formato gif não permitida"), que é o
// único formato do createDataURL da biblioteca. Biblioteca carregada só no clique (import dinâmico).
import { escaparAtributo } from '../../content-scripts/documento_editar/dom'

export const TAMANHOS_QR = { pequeno: 100, medio: 150, grande: 200 } as const
export type TamanhoQr = keyof typeof TAMANHOS_QR

const MARGEM_MODULOS = 2

export async function gerarQrCodeDataUrl(
  texto: string,
  tamanhoPx: number,
  criarCanvas: () => HTMLCanvasElement = () => document.createElement('canvas')
): Promise<{ ok: true; dataUrl: string } | { ok: false; erro: string }> {
  const conteudo = texto.trim()
  if (!conteudo) return { ok: false, erro: 'Informe o texto ou link do QR Code.' }
  const { default: qrcode } = await import('qrcode-generator')
  const qr = qrcode(0, 'M')
  try {
    qr.addData(conteudo)
    qr.make()
  } catch {
    // A biblioteca lança "code length overflow" quando o texto não cabe em nenhuma versão de QR.
    return { ok: false, erro: 'Texto longo demais para um QR Code. Use um link mais curto.' }
  }

  const modulos = qr.getModuleCount()
  const canvas = criarCanvas()
  canvas.width = tamanhoPx
  canvas.height = tamanhoPx
  const contexto = canvas.getContext('2d')
  if (!contexto) return { ok: false, erro: 'Não foi possível desenhar o QR Code neste navegador.' }
  const celula = tamanhoPx / (modulos + MARGEM_MODULOS * 2)
  contexto.fillStyle = '#ffffff'
  contexto.fillRect(0, 0, tamanhoPx, tamanhoPx)
  contexto.fillStyle = '#000000'
  for (let linha = 0; linha < modulos; linha++) {
    for (let coluna = 0; coluna < modulos; coluna++) {
      if (!qr.isDark(linha, coluna)) continue
      // Arredonda as bordas de cada célula pra não deixar fresta clara entre módulos vizinhos.
      const x = Math.floor((coluna + MARGEM_MODULOS) * celula)
      const y = Math.floor((linha + MARGEM_MODULOS) * celula)
      contexto.fillRect(x, y, Math.ceil((coluna + MARGEM_MODULOS + 1) * celula) - x, Math.ceil((linha + MARGEM_MODULOS + 1) * celula) - y)
    }
  }
  return { ok: true, dataUrl: canvas.toDataURL('image/png') }
}

export function montarQrCodeHtml(texto: string, dataUrl: string, tamanhoPx: number): string {
  return `<img class="seirmg-qrcode" src="${dataUrl}" width="${tamanhoPx}" height="${tamanhoPx}" alt="QR Code: ${escaparAtributo(texto.trim())}">`
}
