import katexCssBruto from 'katex/dist/katex.min.css?inline'
import { injetarEstiloSeAusente } from './dom'
import { renderizarLatexHtml } from '../../features/latex/renderizarLatex'
import { criarPainelFlutuante, criarBotaoDialogo, fecharPainel } from './dialogoFlutuante'
import type { EditorSEI } from './ponteEditor'
import sigmaIconSvg from 'lucide-static/icons/sigma.svg?raw'
import xIconSvg from 'lucide-static/icons/x.svg?raw'
import checkIconSvg from 'lucide-static/icons/check.svg?raw'

// O CSS do KaTeX importado com `?inline` já vem com os `url(...)` das fontes
// reescritos pelo Vite para o caminho final do bundle (ex.: `/assets/KaTeX_Main-Regular-HASH.woff2`),
// mas esse caminho é relativo à raiz do documento onde o <style> é injetado — e aqui o
// <style> é injetado dentro de páginas do SEI (`document`) ou do iframe do CKEditor
// (`editor.documento`), nunca numa página da própria extensão. Sem reescrever para uma
// URL absoluta `chrome-extension://<id>/...` via `chrome.runtime.getURL`, o navegador
// tentaria buscar as fontes no domínio do SEI (ex. `https://sei.exemplo.gov.br/assets/...`),
// que não existe, e as fontes falhariam do mesmo jeito que com `?raw`.
function resolverUrlsDeFonteParaExtensao(css: string): string {
  return css.replace(/url\((['"]?)(\/assets\/[^'")]+)\1\)/g, (_match, aspas: string, caminho: string) => {
    return `url(${aspas}${chrome.runtime.getURL(caminho)}${aspas})`
  })
}

const katexCss = resolverUrlsDeFonteParaExtensao(katexCssBruto)

export function abrirDialogoLatex(editor: EditorSEI): void {
  document.querySelectorAll('.seirmg-painel-flutuante').forEach((elemento) => elemento.remove())
  injetarEstiloSeAusente(document, 'seirmg-estilo-katex-dialogo', katexCss)
  injetarEstiloSeAusente(editor.documento, 'seirmg-estilo-katex-editor', katexCss)

  const { painel, corpo } = criarPainelFlutuante('Inserir equação (LaTeX)', sigmaIconSvg)

  const textarea = document.createElement('textarea')
  textarea.placeholder = 'ex.: x^2 + y^2 = z^2'
  textarea.style.fontFamily = 'monospace'
  corpo.appendChild(textarea)

  const preview = document.createElement('div')
  preview.style.cssText = 'margin:10px 0;min-height:40px;overflow-x:auto;'
  corpo.appendChild(preview)

  function atualizarPreview(): void {
    try {
      preview.innerHTML = textarea.value.trim() ? renderizarLatexHtml(textarea.value) : ''
      preview.style.color = ''
      preview.style.fontSize = ''
    } catch (erro) {
      preview.textContent = erro instanceof Error ? erro.message : String(erro)
      preview.style.color = '#c0392b'
      preview.style.fontSize = '12px'
    }
  }
  textarea.addEventListener('input', atualizarPreview)

  const rodape = document.createElement('div')
  rodape.className = 'seirmg-painel-flutuante-rodape'
  const btnCancelar = criarBotaoDialogo('Cancelar', xIconSvg)
  const btnInserir = criarBotaoDialogo('Inserir', checkIconSvg, 'seirmg-btn-acao-primario')
  btnCancelar.addEventListener('click', () => fecharPainel(painel))
  btnInserir.addEventListener('click', () => {
    if (!textarea.value.trim()) return
    try {
      const html = renderizarLatexHtml(textarea.value)
      editor.inserirHtml(html).catch((erro) => console.error('[SEIRMG] Falha ao inserir equação LaTeX:', erro))
      fecharPainel(painel)
    } catch {
      // Erro já está visível no preview, não faz nada.
    }
  })
  rodape.append(btnCancelar, btnInserir)
  corpo.appendChild(rodape)

  document.body.appendChild(painel)
  textarea.focus()
}
