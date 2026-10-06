import qrCodeIconSvg from 'lucide-static/icons/qr-code.svg?raw'
import xIconSvg from 'lucide-static/icons/x.svg?raw'
import checkIconSvg from 'lucide-static/icons/check.svg?raw'
import { gerarQrCodeDataUrl, montarQrCodeHtml, TAMANHOS_QR, type TamanhoQr } from '../../features/editor/qrCode'
import { criarBotaoDialogo, criarPainelFlutuante, fecharPainel } from './dialogoFlutuante'

const ROTULOS_TAMANHO: Record<TamanhoQr, string> = { pequeno: 'Pequeno', medio: 'Médio', grande: 'Grande' }

export function abrirDialogoQrCode(textoInicial: string, aoInserir: (html: string) => void): void {
  document.querySelectorAll('.seirmg-painel-flutuante').forEach((elemento) => elemento.remove())
  const { painel, corpo } = criarPainelFlutuante('Gerar QR Code', qrCodeIconSvg)

  const campo = document.createElement('textarea')
  campo.placeholder = 'Texto ou link'
  campo.value = textoInicial
  const tamanho = document.createElement('select')
  ;(Object.keys(TAMANHOS_QR) as TamanhoQr[]).forEach((chave) => tamanho.add(new Option(ROTULOS_TAMANHO[chave], chave)))
  tamanho.value = 'medio'
  const previa = document.createElement('img')
  previa.className = 'seirmg-qrcode-previa'
  previa.alt = ''
  previa.hidden = true
  const mensagem = document.createElement('div')
  mensagem.className = 'seirmg-painel-flutuante-mensagem'

  let ultimo: { dataUrl: string; px: number } | null = null
  let geracao = 0
  async function atualizar(): Promise<void> {
    const minhaGeracao = ++geracao
    const px = TAMANHOS_QR[tamanho.value as TamanhoQr]
    const resultado = await gerarQrCodeDataUrl(campo.value, px)
    // Digitação rápida: só a geração mais recente atualiza a prévia.
    if (minhaGeracao !== geracao) return
    if (resultado.ok) {
      ultimo = { dataUrl: resultado.dataUrl, px }
      previa.src = resultado.dataUrl
      previa.hidden = false
      mensagem.textContent = ''
    } else {
      ultimo = null
      previa.hidden = true
      mensagem.textContent = campo.value.trim() ? resultado.erro : ''
    }
  }
  campo.addEventListener('input', () => void atualizar())
  tamanho.addEventListener('change', () => void atualizar())

  const rodape = document.createElement('div')
  rodape.className = 'seirmg-painel-flutuante-rodape'
  const cancelar = criarBotaoDialogo('Cancelar', xIconSvg)
  const inserir = criarBotaoDialogo('Inserir', checkIconSvg, 'seirmg-btn-acao-primario')
  cancelar.addEventListener('click', () => fecharPainel(painel))
  inserir.addEventListener('click', () => {
    if (!ultimo) {
      mensagem.textContent = 'Informe o texto ou link do QR Code.'
      return
    }
    fecharPainel(painel)
    aoInserir(montarQrCodeHtml(campo.value, ultimo.dataUrl, ultimo.px))
  })
  rodape.append(cancelar, inserir)
  corpo.append(campo, tamanho, previa, mensagem, rodape)
  document.body.appendChild(painel)
  campo.focus()
  if (campo.value.trim()) void atualizar()
}
