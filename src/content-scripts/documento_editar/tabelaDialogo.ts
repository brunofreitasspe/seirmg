import tableIconSvg from 'lucide-static/icons/table.svg?raw'
import paletteIconSvg from 'lucide-static/icons/palette.svg?raw'
import xIconSvg from 'lucide-static/icons/x.svg?raw'
import checkIconSvg from 'lucide-static/icons/check.svg?raw'
import { criarPainelFlutuante, criarBotaoDialogo, fecharPainel } from './dialogoFlutuante'
import {
  CORES_TABELA,
  PADROES_TABELA,
  calcularEstiloCelula,
  montarTabelaHtml,
  type PadraoTabelaId,
} from '../../features/formatacao-basica/tabelaRapida'
import type { EditorSEI } from './ponteEditor'

const COLUNAS_GRADE = 10
const LINHAS_GRADE = 8

function fecharAoClicarFora(painel: HTMLElement): void {
  const aoClicar = (evento: MouseEvent): void => {
    if (painel.contains(evento.target as Node)) return
    fecharPainel(painel)
    document.removeEventListener('click', aoClicar, true)
  }
  // Próximo tick -- evita que o mesmo clique que abriu o painel já o feche.
  setTimeout(() => document.addEventListener('click', aoClicar, true), 0)
}

function fecharPaineisAbertos(): void {
  document.querySelectorAll('.seirmg-painel-flutuante').forEach((elemento) => elemento.remove())
}

export function abrirGradeInsercao(editor: EditorSEI): void {
  fecharPaineisAbertos()

  const { painel, corpo } = criarPainelFlutuante('Inserir tabela', tableIconSvg)

  const info = document.createElement('div')
  info.style.cssText = 'font-size:12px;color:#667085;margin-bottom:8px;text-align:center;'
  info.textContent = '1 × 1'
  corpo.appendChild(info)

  const grade = document.createElement('div')
  grade.style.cssText = `display:grid;grid-template-columns:repeat(${COLUNAS_GRADE},18px);grid-template-rows:repeat(${LINHAS_GRADE},18px);gap:2px;`

  const celulas: HTMLDivElement[] = []
  for (let linha = 0; linha < LINHAS_GRADE; linha++) {
    for (let coluna = 0; coluna < COLUNAS_GRADE; coluna++) {
      const celula = document.createElement('div')
      celula.style.cssText =
        'width:18px;height:18px;border:1px solid #e2e7f0;border-radius:2px;background:#f4f7fb;cursor:pointer;'
      celula.dataset.linha = String(linha)
      celula.dataset.coluna = String(coluna)
      celulas.push(celula)
      grade.appendChild(celula)
    }
  }

  const atualizarDestaque = (linha: number, coluna: number): void => {
    celulas.forEach((celula) => {
      const ativa = Number(celula.dataset.linha) <= linha && Number(celula.dataset.coluna) <= coluna
      celula.style.background = ativa ? '#eaf3ff' : '#f4f7fb'
      celula.style.borderColor = ativa ? '#017fff' : '#e2e7f0'
    })
    info.textContent = `${linha + 1} × ${coluna + 1}`
  }

  grade.addEventListener('mouseover', (evento) => {
    const alvo = evento.target
    if (!(alvo instanceof HTMLElement) || alvo.dataset.linha === undefined) return
    atualizarDestaque(Number(alvo.dataset.linha), Number(alvo.dataset.coluna))
  })

  grade.addEventListener('click', (evento) => {
    const alvo = evento.target
    if (!(alvo instanceof HTMLElement) || alvo.dataset.linha === undefined) return
    const linhas = Number(alvo.dataset.linha) + 1
    const colunas = Number(alvo.dataset.coluna) + 1
    fecharPainel(painel)
    abrirDialogoEstilo(editor, linhas, colunas)
  })

  atualizarDestaque(0, 0)
  corpo.appendChild(grade)
  document.body.appendChild(painel)
  fecharAoClicarFora(painel)
}

function montarPreviewPadrao(padraoId: PadraoTabelaId, corHex: string): HTMLElement {
  const preview = document.createElement('div')
  preview.style.cssText =
    'width:100%;height:44px;border-radius:6px;border:1px solid #e2e7f0;overflow:hidden;display:flex;flex-direction:column;padding:3px;gap:2px;background:#fff;box-sizing:border-box;'
  for (let linha = 0; linha < 3; linha++) {
    const linhaEl = document.createElement('div')
    linhaEl.style.cssText = 'flex:1;display:flex;gap:2px;'
    const estilo = calcularEstiloCelula(padraoId, corHex, linha)
    for (let coluna = 0; coluna < 3; coluna++) {
      const celula = document.createElement('div')
      celula.style.cssText = `flex:1;border-radius:1px;${estilo}`
      linhaEl.appendChild(celula)
    }
    preview.appendChild(linhaEl)
  }
  return preview
}

function abrirDialogoEstilo(editor: EditorSEI, linhas: number, colunas: number): void {
  fecharPaineisAbertos()

  const { painel, corpo } = criarPainelFlutuante('Estilo da tabela', paletteIconSvg)
  painel.style.width = '380px'

  let padraoEscolhido: PadraoTabelaId = 'simples'
  let corEscolhida = CORES_TABELA[0]

  const rotuloEstilo =
    'font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#667085;margin-bottom:8px;'

  const rotuloCor = document.createElement('div')
  rotuloCor.textContent = 'Cor'
  rotuloCor.style.cssText = rotuloEstilo
  corpo.appendChild(rotuloCor)

  const linhaCores = document.createElement('div')
  linhaCores.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;'
  const botoesCor = CORES_TABELA.map((cor) => {
    const botao = document.createElement('button')
    botao.type = 'button'
    botao.title = cor.nome
    botao.style.cssText = `width:22px;height:22px;border-radius:999px;cursor:pointer;background:${cor.hex};box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);border:2px solid transparent;`
    botao.addEventListener('click', () => {
      corEscolhida = cor
      atualizarSelecaoCor()
      atualizarPreviews()
    })
    linhaCores.appendChild(botao)
    return botao
  })
  corpo.appendChild(linhaCores)

  const atualizarSelecaoCor = (): void => {
    botoesCor.forEach((botao, indice) => {
      botao.style.borderColor = CORES_TABELA[indice].id === corEscolhida.id ? '#1a2233' : 'transparent'
    })
  }

  const rotuloPadrao = document.createElement('div')
  rotuloPadrao.textContent = 'Padrão'
  rotuloPadrao.style.cssText = rotuloEstilo
  corpo.appendChild(rotuloPadrao)

  const gradePadroes = document.createElement('div')
  gradePadroes.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:10px;'
  const itensPadrao = PADROES_TABELA.map((padrao) => {
    const item = document.createElement('div')
    item.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;'
    const previewWrapper = document.createElement('div')
    previewWrapper.style.cssText = 'width:100%;border-radius:8px;'
    const nome = document.createElement('div')
    nome.textContent = padrao.nome
    nome.style.cssText = 'font-size:10px;color:#667085;text-align:center;'
    item.append(previewWrapper, nome)
    item.addEventListener('click', () => {
      padraoEscolhido = padrao.id
      atualizarSelecaoPadrao()
    })
    gradePadroes.appendChild(item)
    return { padrao, previewWrapper }
  })
  corpo.appendChild(gradePadroes)

  const atualizarSelecaoPadrao = (): void => {
    itensPadrao.forEach(({ previewWrapper }) => {
      previewWrapper.style.outline = ''
      previewWrapper.style.outlineOffset = ''
    })
    const selecionado = itensPadrao.find(({ padrao }) => padrao.id === padraoEscolhido)
    if (selecionado) {
      selecionado.previewWrapper.style.outline = '2px solid #017fff'
      selecionado.previewWrapper.style.outlineOffset = '2px'
    }
  }

  const atualizarPreviews = (): void => {
    itensPadrao.forEach(({ padrao, previewWrapper }) => {
      previewWrapper.innerHTML = ''
      previewWrapper.appendChild(montarPreviewPadrao(padrao.id, corEscolhida.hex))
    })
  }

  atualizarSelecaoCor()
  atualizarSelecaoPadrao()
  atualizarPreviews()

  const rodape = document.createElement('div')
  rodape.className = 'seirmg-painel-flutuante-rodape'
  const btnCancelar = criarBotaoDialogo('Cancelar', xIconSvg)
  const btnAplicar = criarBotaoDialogo('Aplicar', checkIconSvg, 'seirmg-btn-acao-primario')
  btnCancelar.addEventListener('click', () => fecharPainel(painel))
  btnAplicar.addEventListener('click', () => {
    const html = montarTabelaHtml(linhas, colunas, padraoEscolhido, corEscolhida.id)
    editor.inserirHtml(html).catch((erro) => console.error('[SEIRMG] Falha ao inserir tabela rápida:', erro))
    fecharPainel(painel)
  })
  rodape.append(btnCancelar, btnAplicar)
  corpo.appendChild(rodape)

  document.body.appendChild(painel)
  fecharAoClicarFora(painel)
}
