// Botões novos do editor (grupo Inserir e Referências e links). Cada task do plano acrescenta
// o seu ao mapa; a ordem na barra vem de features/editor/grupos.ts, não da ordem de inserção aqui.
import squareCheckIconSvg from 'lucide-static/icons/square-check.svg?raw'
import link2IconSvg from 'lucide-static/icons/link-2.svg?raw'
import hashIconSvg from 'lucide-static/icons/hash.svg?raw'
import qrCodeIconSvg from 'lucide-static/icons/qr-code.svg?raw'
import fileInputIconSvg from 'lucide-static/icons/file-input.svg?raw'
import fileWarningIconSvg from 'lucide-static/icons/file-warning.svg?raw'
import { alternarChecklist, CLASSE_CHECKLIST, montarChecklistHtml } from '../../features/editor/checklist'
import type { IdBotaoEditor } from '../../features/editor/grupos'
import { montarLinkHtml, validarUrlHttp } from '../../features/editor/linkCurto'
import { abrirDialogoLinkCurto } from './linkCurtoDialogo'
import { abrirDialogoReferenciaInterna } from './referenciaInternaDialogo'
import { escolherEImportarArquivo } from './importarArquivo'
import { abrirDialogoQrCode } from './qrCodeDialogo'
import { criarPainelFlutuante, fecharPainel } from './dialogoFlutuante'
import { criarBotaoToolbar } from './formatacaoBasica'
import type { EditorSEI } from './ponteEditor'

function tratarErro(contexto: string): (erro: unknown) => void {
  return (erro) => console.error(`[SEIRMG] ${contexto}:`, erro)
}

function mostrarErroImportacao(mensagem: string): void {
  document.querySelectorAll('.seirmg-painel-flutuante').forEach((elemento) => elemento.remove())
  const { painel, corpo } = criarPainelFlutuante('Importar Word/HTML', fileWarningIconSvg)
  const texto = document.createElement('p')
  texto.textContent = mensagem
  const fechar = document.createElement('button')
  fechar.type = 'button'
  fechar.className = 'seirmg-btn-acao'
  fechar.textContent = 'Fechar'
  fechar.addEventListener('click', () => fecharPainel(painel))
  corpo.append(texto, fechar)
  document.body.appendChild(painel)
}

// iniciarFormatacaoBasica pode rodar mais de uma vez na mesma página: um segundo listener no
// mesmo corpo faria cada clique alternar duas vezes (sem efeito visível).
const corposComChecklist = new WeakSet<HTMLElement>()

// Clique numa caixa dentro do corpo do documento alterna marcada/desmarcada.
export function ligarAlternanciaChecklist(editor: EditorSEI): void {
  if (corposComChecklist.has(editor.corpo)) return
  corposComChecklist.add(editor.corpo)
  editor.corpo.addEventListener('click', (evento) => {
    const alvo = evento.target instanceof Element ? evento.target.closest<HTMLElement>(`.${CLASSE_CHECKLIST}`) : null
    if (!alvo) return
    const proximo = alternarChecklist(alvo.dataset.marcado === 'sim')
    alvo.textContent = proximo.simbolo
    alvo.dataset.marcado = proximo.marcado ? 'sim' : 'nao'
    editor.registrarAlteracao().catch(tratarErro('Falha ao registrar alteração do checklist'))
  })
}

export function montarBotoesInserir(editor: EditorSEI): Map<IdBotaoEditor, HTMLElement> {
  const botoes = new Map<IdBotaoEditor, HTMLElement>()
  botoes.set(
    'checklist',
    criarBotaoToolbar('seirmg-cke-checklist', 'Inserir caixa de seleção (checklist)', squareCheckIconSvg, () => {
      editor.inserirHtml(montarChecklistHtml()).catch(tratarErro('Falha ao inserir checklist'))
    })
  )
  botoes.set(
    'link-curto',
    criarBotaoToolbar('seirmg-cke-link-curto', 'Gerar link curto (TinyURL)', link2IconSvg, () => {
      editor
        .obterTextoSelecionado()
        .then((selecao) => {
          const link = validarUrlHttp(selecao)
          // Seleção que não é link vira o texto do link curto; sem seleção, o próprio link curto.
          const textoDoLink = link.ok ? '' : selecao.trim()
          abrirDialogoLinkCurto(link.ok ? link.url : '', (linkCurto) => {
            editor.inserirHtml(montarLinkHtml(linkCurto, textoDoLink || linkCurto)).catch(tratarErro('Falha ao inserir link curto'))
          })
        })
        .catch(tratarErro('Falha ao abrir o link curto'))
    })
  )
  botoes.set(
    'referencia-interna',
    criarBotaoToolbar('seirmg-cke-referencia-interna', 'Inserir referência interna (parágrafo numerado)', hashIconSvg, () => {
      abrirDialogoReferenciaInterna(editor)
    })
  )
  botoes.set(
    'importar',
    criarBotaoToolbar('seirmg-cke-importar', 'Importar conteúdo de Word (.docx) ou HTML', fileInputIconSvg, () => {
      escolherEImportarArquivo((html) => {
        editor.inserirHtml(html).catch(tratarErro('Falha ao inserir conteúdo importado'))
      }, mostrarErroImportacao)
    })
  )
  botoes.set(
    'qrcode',
    criarBotaoToolbar('seirmg-cke-qrcode', 'Gerar QR Code', qrCodeIconSvg, () => {
      editor
        .obterTextoSelecionado()
        .then((selecao) => {
          // Pré-preenche só com um link válido; texto comum selecionado não vira conteúdo do QR.
          const link = validarUrlHttp(selecao)
          abrirDialogoQrCode(link.ok ? link.url : '', (html) => {
            editor.inserirHtml(html).catch(tratarErro('Falha ao inserir QR Code'))
          })
        })
        .catch(tratarErro('Falha ao abrir o QR Code'))
    })
  )
  return botoes
}
