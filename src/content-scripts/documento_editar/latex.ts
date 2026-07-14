import katexCssBruto from 'katex/dist/katex.min.css?inline'
import { injetarEstiloSeAusente } from './dom'
import { renderizarLatexHtml } from '../../features/latex/renderizarLatex'
import type { EditorSEI } from './ponteEditor'

const ID_DIALOGO_LATEX = 'seirmg-dialogo-latex'

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

const ESTILO_DIALOGO = `
  #${ID_DIALOGO_LATEX} {
    position: fixed;
    top: 80px;
    right: 20px;
    width: 360px;
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, .2);
    z-index: 10000;
    font-family: Arial, Helvetica, sans-serif;
    padding: 14px;
  }
  #${ID_DIALOGO_LATEX} textarea {
    width: 100%;
    height: 60px;
    box-sizing: border-box;
    font-family: monospace;
  }
  #${ID_DIALOGO_LATEX} .seirmg-latex-preview {
    margin: 10px 0;
    min-height: 40px;
    overflow-x: auto;
  }
  #${ID_DIALOGO_LATEX} .seirmg-latex-erro {
    color: #c0392b;
    font-size: 12px;
  }
  #${ID_DIALOGO_LATEX} button {
    margin-right: 8px;
  }
`

function fecharDialogo(): void {
  document.getElementById(ID_DIALOGO_LATEX)?.remove()
}

export function abrirDialogoLatex(editor: EditorSEI): void {
  fecharDialogo()
  injetarEstiloSeAusente(document, 'seirmg-estilo-dialogo-latex', ESTILO_DIALOGO)
  injetarEstiloSeAusente(document, 'seirmg-estilo-katex-dialogo', katexCss)
  injetarEstiloSeAusente(editor.documento, 'seirmg-estilo-katex-editor', katexCss)

  const dialogo = document.createElement('div')
  dialogo.id = ID_DIALOGO_LATEX
  dialogo.innerHTML = `
    <div><strong>Inserir equação (LaTeX)</strong></div>
    <textarea placeholder="ex.: x^2 + y^2 = z^2"></textarea>
    <div class="seirmg-latex-preview"></div>
    <button type="button" data-acao="inserir">Inserir</button>
    <button type="button" data-acao="cancelar">Cancelar</button>
  `
  document.body.appendChild(dialogo)

  const textarea = dialogo.querySelector('textarea') as HTMLTextAreaElement
  const preview = dialogo.querySelector('.seirmg-latex-preview') as HTMLElement

  function atualizarPreview(): void {
    try {
      preview.innerHTML = textarea.value.trim() ? renderizarLatexHtml(textarea.value) : ''
      preview.classList.remove('seirmg-latex-erro')
    } catch (erro) {
      preview.textContent = erro instanceof Error ? erro.message : String(erro)
      preview.classList.add('seirmg-latex-erro')
    }
  }

  textarea.addEventListener('input', atualizarPreview)

  dialogo.addEventListener('click', (evento) => {
    const alvo = evento.target
    if (!(alvo instanceof HTMLElement)) return
    const acao = alvo.dataset.acao
    if (acao === 'cancelar') {
      fecharDialogo()
      return
    }
    if (acao === 'inserir') {
      if (!textarea.value.trim()) return
      try {
        const html = renderizarLatexHtml(textarea.value)
        editor.inserirHtml(html).catch((erro) => console.error('[SEIRMG] Falha ao inserir equação LaTeX:', erro))
        fecharDialogo()
      } catch {
        // Erro já está visível no preview, não faz nada.
      }
    }
  })
}
