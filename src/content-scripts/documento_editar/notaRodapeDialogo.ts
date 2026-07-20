import superscriptIconSvg from 'lucide-static/icons/superscript.svg?raw'
import xIconSvg from 'lucide-static/icons/x.svg?raw'
import checkIconSvg from 'lucide-static/icons/check.svg?raw'
import { criarPainelFlutuante, criarBotaoDialogo, fecharPainel } from './dialogoFlutuante'

export function abrirDialogoNotaRodape(aoConfirmar: (texto: string) => void): void {
  document.querySelectorAll('.seirmg-painel-flutuante').forEach((elemento) => elemento.remove())

  const { painel, corpo } = criarPainelFlutuante('Nota de rodapé', superscriptIconSvg)

  const textarea = document.createElement('textarea')
  textarea.placeholder = 'Texto da nota...'
  corpo.appendChild(textarea)

  const rodape = document.createElement('div')
  rodape.className = 'seirmg-painel-flutuante-rodape'
  const btnCancelar = criarBotaoDialogo('Cancelar', xIconSvg)
  const btnInserir = criarBotaoDialogo('Inserir', checkIconSvg, 'seirmg-btn-acao-primario')
  btnCancelar.addEventListener('click', () => fecharPainel(painel))
  btnInserir.addEventListener('click', () => {
    const texto = textarea.value.trim()
    if (!texto) return
    fecharPainel(painel)
    aoConfirmar(texto)
  })
  rodape.append(btnCancelar, btnInserir)
  corpo.appendChild(rodape)

  document.body.appendChild(painel)
  textarea.focus()
}
