// Diálogo da referência interna e as operações no DOM do corpo do documento (âncoras nos
// parágrafos-alvo e atualização dos números das referências já inseridas).
import hashIconSvg from 'lucide-static/icons/hash.svg?raw'
import xIconSvg from 'lucide-static/icons/x.svg?raw'
import checkIconSvg from 'lucide-static/icons/check.svg?raw'
import { CLASSES_PARAGRAFO_NUMERADO, nivelDaClasse } from '../../features/formatacao-basica/numeracaoParagrafos'
import { montarReferenciaHtml, numerarParagrafos, PREFIXO_ANCORA } from '../../features/editor/referenciaInterna'
import { criarBotaoDialogo, criarPainelFlutuante, fecharPainel } from './dialogoFlutuante'
import type { EditorSEI } from './ponteEditor'

const SELETOR_NUMERADOS = CLASSES_PARAGRAFO_NUMERADO.map((classe) => `p.${classe}`).join(',')
const TAMANHO_RESUMO = 60

function nivelDoParagrafo(paragrafo: HTMLElement): number {
  for (const classe of CLASSES_PARAGRAFO_NUMERADO) {
    if (paragrafo.classList.contains(classe)) return nivelDaClasse(classe) ?? 1
  }
  return 1
}

export function listarParagrafosNumerados(corpo: HTMLElement): Array<{ elemento: HTMLElement; numero: string; resumo: string }> {
  const paragrafos = Array.from(corpo.querySelectorAll<HTMLElement>(SELETOR_NUMERADOS))
  const numeros = numerarParagrafos(paragrafos.map(nivelDoParagrafo))
  return paragrafos.map((elemento, i) => {
    const texto = (elemento.textContent ?? '').replace(/\s+/g, ' ').trim()
    return { elemento, numero: numeros[i], resumo: texto.length > TAMANHO_RESUMO ? `${texto.slice(0, TAMANHO_RESUMO)}…` : texto }
  })
}

export function garantirAncora(paragrafo: HTMLElement): string {
  const existente = paragrafo.querySelector<HTMLAnchorElement>(`a[name^="${PREFIXO_ANCORA}"]`)
  if (existente) return existente.name
  const id = `${PREFIXO_ANCORA}${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`
  const ancora = paragrafo.ownerDocument.createElement('a')
  ancora.name = id
  ancora.id = id
  paragrafo.prepend(ancora)
  return id
}

export function atualizarNumerosReferencias(corpo: HTMLElement): void {
  const numeroPorAncora = new Map<string, string>()
  listarParagrafosNumerados(corpo).forEach(({ elemento, numero }) => {
    const ancora = elemento.querySelector<HTMLAnchorElement>(`a[name^="${PREFIXO_ANCORA}"]`)
    if (ancora) numeroPorAncora.set(ancora.name, numero)
  })
  corpo.querySelectorAll<HTMLAnchorElement>('a.seirmg-ref-interna').forEach((link) => {
    const numero = numeroPorAncora.get((link.getAttribute('href') ?? '').replace(/^#/, ''))
    if (numero && link.textContent !== numero) link.textContent = numero
  })
}

export function abrirDialogoReferenciaInterna(editor: EditorSEI): void {
  document.querySelectorAll('.seirmg-painel-flutuante').forEach((elemento) => elemento.remove())
  const { painel, corpo } = criarPainelFlutuante('Referência interna', hashIconSvg)
  const paragrafos = listarParagrafosNumerados(editor.corpo)

  const rodape = document.createElement('div')
  rodape.className = 'seirmg-painel-flutuante-rodape'
  const cancelar = criarBotaoDialogo('Fechar', xIconSvg)
  cancelar.addEventListener('click', () => fecharPainel(painel))

  if (paragrafos.length === 0) {
    const aviso = document.createElement('p')
    aviso.textContent = 'Nenhum parágrafo numerado no documento. Use os estilos "Parágrafo Numerado" do SEI para poder referenciá-los.'
    rodape.append(cancelar)
    corpo.append(aviso, rodape)
    document.body.appendChild(painel)
    return
  }

  const prefixo = document.createElement('input')
  prefixo.type = 'text'
  prefixo.placeholder = 'Prefixo (ex.: item, art.) — opcional'
  prefixo.value = 'item'
  const lista = document.createElement('select')
  lista.multiple = true
  lista.size = Math.min(10, paragrafos.length)
  paragrafos.forEach((p, i) => lista.add(new Option(`${p.numero}. ${p.resumo}`, String(i))))
  const mensagem = document.createElement('div')
  mensagem.className = 'seirmg-painel-flutuante-mensagem'

  const inserir = criarBotaoDialogo('Inserir', checkIconSvg, 'seirmg-btn-acao-primario')
  inserir.addEventListener('click', () => {
    const escolhidos = Array.from(lista.selectedOptions).map((opcao) => paragrafos[Number(opcao.value)])
    if (escolhidos.length === 0) {
      mensagem.textContent = 'Escolha pelo menos um parágrafo.'
      return
    }
    const alvos = escolhidos.map((p) => ({ id: garantirAncora(p.elemento), numero: p.numero }))
    atualizarNumerosReferencias(editor.corpo)
    fecharPainel(painel)
    editor
      .registrarAlteracao()
      .then(() => editor.inserirHtml(montarReferenciaHtml(alvos, prefixo.value)))
      .catch((erro) => console.error('[SEIRMG] Falha ao inserir referência interna:', erro))
  })
  rodape.append(cancelar, inserir)
  corpo.append(prefixo, lista, mensagem, rodape)
  document.body.appendChild(painel)
  lista.focus()
}
