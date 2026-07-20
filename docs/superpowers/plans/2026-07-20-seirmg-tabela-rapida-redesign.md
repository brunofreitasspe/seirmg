# Tabela Rápida (grade + catálogo de estilos) e diálogos do editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir os `window.prompt()` da Tabela Rápida e da Nota de Rodapé por diálogos de verdade no padrão visual da extensão, com uma grade de inserção (linhas×colunas) e um catálogo rico de estilos (9 cores × 7 padrões, desenho próprio) pra Tabela Rápida; e reestilizar o diálogo de Equação (LaTeX), que já existia mas com botões crus.

**Architecture:** Um helper compartilhado (`dialogoFlutuante.ts`) monta o "casco" visual (painel branco arredondado com sombra, cabeçalho com ícone, botões `seirmg-btn-acao`) reaproveitado pelos 3 diálogos novos (grade de inserção, estilo de tabela, nota de rodapé) e pelo de LaTeX (retrofit). O catálogo de estilos é puramente CSS/HTML (nenhum asset do Sei Pro reaproveitado — decisão explícita do usuário). O fluxo da tabela é único: grade → estilo → insere já formatada (sem reestilizar depois).

**Tech Stack:** TypeScript, Vite, Vitest, Bun.

## Global Constraints

- Nenhum asset (imagem/sprite) do Sei Pro reaproveitado — catálogo de estilos 100% HTML/CSS próprio.
- Todo diálogo remove qualquer outro `.seirmg-painel-flutuante` já aberto antes de se montar (nunca dois diálogos sobrepostos).
- QR Code e Hashcode explicitamente fora de escopo — não implementar nada relacionado a eles.
- Erros de storage/DOM seguem a política já estabelecida: `try/catch`/`.catch()` com `console.error('[SEIRMG] ...', error)`.
- Mockup aprovado: https://claude.ai/code/artifact/82020ae6-d7b1-409c-8cd3-ff73607a3816

---

### Task 1: Reescrever `tabelaRapida.ts` (catálogo de cores/padrões) + testes

**Files:**
- Modify: `src/features/formatacao-basica/tabelaRapida.ts`
- Modify: `src/features/formatacao-basica/tabelaRapida.test.ts`

**Interfaces:**
- Produces: `CorTabela`, `CORES_TABELA: CorTabela[]`, `PadraoTabelaId`, `PadraoTabela`, `PADROES_TABELA: PadraoTabela[]`, `clarearHex(hex: string, fator: number): string`, `calcularEstiloCelula(padraoId: PadraoTabelaId, corHex: string, indiceLinha: number): string`, `montarTabelaHtml(linhas: number, colunas: number, padraoId?: PadraoTabelaId, corId?: string): string`. Consumidas pelas Tasks 3 e 4.
- Remove: `CATALOGO_ESTILOS_TABELA`, `aplicarEstiloTabelaHtml`, `EstiloTabela` (assinatura antiga) — nenhum outro arquivo além deste os usa hoje (só `formatacaoBasica.ts`, atualizado na Task 3).

- [ ] **Step 1: Escrever os testes que falham**

Substituir `src/features/formatacao-basica/tabelaRapida.test.ts` inteiro:

```ts
import { describe, expect, it } from 'vitest'
import {
  calcularEstiloCelula,
  clarearHex,
  montarTabelaHtml,
  CORES_TABELA,
  PADROES_TABELA,
} from './tabelaRapida'

describe('clarearHex', () => {
  it('não muda a cor com fator 0', () => {
    expect(clarearHex('#017fff', 0)).toBe('#017fff')
  })

  it('vira branco com fator 1', () => {
    expect(clarearHex('#017fff', 1)).toBe('#ffffff')
  })

  it('mistura parcialmente com um fator intermediário', () => {
    expect(clarearHex('#000000', 0.5)).toBe('#808080')
  })
})

describe('calcularEstiloCelula', () => {
  it('simples: borda fina cinza clara, sem cor de fundo', () => {
    const estilo = calcularEstiloCelula('simples', '#017fff', 0)
    expect(estilo).toContain('border:1px solid #dbe1ea')
    expect(estilo).not.toContain('background')
  })

  it('bordas: borda preta', () => {
    expect(calcularEstiloCelula('bordas', '#017fff', 0)).toContain('border:1px solid #000')
  })

  it('bordas-grossas: borda de 2px na cor escolhida', () => {
    expect(calcularEstiloCelula('bordas-grossas', '#b3261e', 3)).toContain('border:2px solid #b3261e')
  })

  it('cabecalho-solido: linha 0 tem fundo sólido e texto branco, outras linhas não', () => {
    const cabecalho = calcularEstiloCelula('cabecalho-solido', '#17875a', 0)
    expect(cabecalho).toContain('background:#17875a')
    expect(cabecalho).toContain('color:#fff')

    const corpo = calcularEstiloCelula('cabecalho-solido', '#17875a', 1)
    expect(corpo).not.toContain('background')
  })

  it('cabecalho-leve: linha 0 tem fundo claro (mistura com branco), sem texto branco', () => {
    const cabecalho = calcularEstiloCelula('cabecalho-leve', '#000000', 0)
    expect(cabecalho).toContain('background:#d9d9d9')
    expect(cabecalho).not.toContain('color:#fff')
  })

  it('zebra: linhas ímpares (índice 1, 3...) têm fundo claro, pares não', () => {
    expect(calcularEstiloCelula('zebra', '#000000', 0)).not.toContain('background')
    expect(calcularEstiloCelula('zebra', '#000000', 1)).toContain('background:#d9d9d9')
    expect(calcularEstiloCelula('zebra', '#000000', 2)).not.toContain('background')
  })

  it('cabecalho-zebra: linha 0 sólida, linhas pares (>0) claras, ímpares sem fundo', () => {
    expect(calcularEstiloCelula('cabecalho-zebra', '#000000', 0)).toContain('color:#fff')
    expect(calcularEstiloCelula('cabecalho-zebra', '#000000', 1)).not.toContain('background')
    expect(calcularEstiloCelula('cabecalho-zebra', '#000000', 2)).toContain('background:#d9d9d9')
  })
})

describe('montarTabelaHtml', () => {
  it('monta uma tabela com o número certo de linhas e células', () => {
    const html = montarTabelaHtml(2, 3)
    expect((html.match(/<tr>/g) ?? []).length).toBe(2)
    expect((html.match(/<td/g) ?? []).length).toBe(6)
  })

  it('usa simples/cinza como padrão quando não informado', () => {
    const html = montarTabelaHtml(1, 1)
    expect(html).toContain('border:1px solid #dbe1ea')
  })

  it('aplica o padrão e a cor escolhidos', () => {
    const html = montarTabelaHtml(2, 1, 'cabecalho-solido', 'vermelho')
    expect(html).toContain('background:#b3261e')
  })
})

describe('CORES_TABELA / PADROES_TABELA', () => {
  it('tem 9 cores e 7 padrões', () => {
    expect(CORES_TABELA).toHaveLength(9)
    expect(PADROES_TABELA).toHaveLength(7)
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bun run test -- tabelaRapida` (a partir de `C:\sei\seirmg`)
Expected: FAIL — as novas exportações não existem ainda.

- [ ] **Step 3: Reescrever a implementação**

Substituir `src/features/formatacao-basica/tabelaRapida.ts` inteiro:

```ts
export interface CorTabela {
  id: string
  nome: string
  hex: string
}

export const CORES_TABELA: CorTabela[] = [
  { id: 'cinza', nome: 'Cinza', hex: '#94a3b8' },
  { id: 'azul', nome: 'Azul', hex: '#017fff' },
  { id: 'verde', nome: 'Verde', hex: '#17875a' },
  { id: 'laranja', nome: 'Laranja', hex: '#b5530a' },
  { id: 'vermelho', nome: 'Vermelho', hex: '#b3261e' },
  { id: 'roxo', nome: 'Roxo', hex: '#7c3aed' },
  { id: 'rosa', nome: 'Rosa', hex: '#c026a3' },
  { id: 'petroleo', nome: 'Petróleo', hex: '#0d9488' },
  { id: 'dourado', nome: 'Dourado', hex: '#ca8a04' },
]

export type PadraoTabelaId =
  | 'simples'
  | 'bordas'
  | 'bordas-grossas'
  | 'cabecalho-solido'
  | 'cabecalho-leve'
  | 'zebra'
  | 'cabecalho-zebra'

export interface PadraoTabela {
  id: PadraoTabelaId
  nome: string
  usaCor: boolean
}

export const PADROES_TABELA: PadraoTabela[] = [
  { id: 'simples', nome: 'Simples', usaCor: false },
  { id: 'bordas', nome: 'Com bordas', usaCor: false },
  { id: 'bordas-grossas', nome: 'Bordas grossas', usaCor: true },
  { id: 'cabecalho-solido', nome: 'Cabeçalho sólido', usaCor: true },
  { id: 'cabecalho-leve', nome: 'Cabeçalho leve', usaCor: true },
  { id: 'zebra', nome: 'Linhas alternadas', usaCor: true },
  { id: 'cabecalho-zebra', nome: 'Cabeçalho + zebra', usaCor: true },
]

export function clarearHex(hex: string, fator: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  const misturar = (canal: number): number => Math.round(canal + (255 - canal) * fator)
  const paraHex = (n: number): string => n.toString(16).padStart(2, '0')
  return `#${paraHex(misturar(r))}${paraHex(misturar(g))}${paraHex(misturar(b))}`
}

const ESTILO_BASE_CELULA = 'padding:4px 8px;'

export function calcularEstiloCelula(padraoId: PadraoTabelaId, corHex: string, indiceLinha: number): string {
  const corClara = clarearHex(corHex, 0.85)

  switch (padraoId) {
    case 'simples':
      return `${ESTILO_BASE_CELULA}border:1px solid #dbe1ea;`
    case 'bordas':
      return `${ESTILO_BASE_CELULA}border:1px solid #000;`
    case 'bordas-grossas':
      return `${ESTILO_BASE_CELULA}border:2px solid ${corHex};`
    case 'cabecalho-solido':
      return indiceLinha === 0
        ? `${ESTILO_BASE_CELULA}border:1px solid ${corHex};background:${corHex};color:#fff;font-weight:bold;`
        : `${ESTILO_BASE_CELULA}border:1px solid ${corHex};`
    case 'cabecalho-leve':
      return indiceLinha === 0
        ? `${ESTILO_BASE_CELULA}border:1px solid ${corHex};background:${corClara};font-weight:bold;`
        : `${ESTILO_BASE_CELULA}border:1px solid ${corHex};`
    case 'zebra':
      return indiceLinha % 2 === 1
        ? `${ESTILO_BASE_CELULA}border:1px solid ${corHex};background:${corClara};`
        : `${ESTILO_BASE_CELULA}border:1px solid ${corHex};`
    case 'cabecalho-zebra':
      if (indiceLinha === 0) {
        return `${ESTILO_BASE_CELULA}border:1px solid ${corHex};background:${corHex};color:#fff;font-weight:bold;`
      }
      return indiceLinha % 2 === 0
        ? `${ESTILO_BASE_CELULA}border:1px solid ${corHex};background:${corClara};`
        : `${ESTILO_BASE_CELULA}border:1px solid ${corHex};`
  }
}

export function montarTabelaHtml(
  linhas: number,
  colunas: number,
  padraoId: PadraoTabelaId = 'simples',
  corId = 'cinza'
): string {
  const cor = CORES_TABELA.find((item) => item.id === corId) ?? CORES_TABELA[0]
  const linhasHtml = Array.from({ length: linhas }, (_, indiceLinha) => {
    const estiloCelula = calcularEstiloCelula(padraoId, cor.hex, indiceLinha)
    const celulas = `<td style="${estiloCelula}">&nbsp;</td>`.repeat(colunas)
    return `<tr>${celulas}</tr>`
  }).join('')
  return `<table class="Tabela" style="border-collapse:collapse;width:100%;">${linhasHtml}</table>`
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bun run test -- tabelaRapida`
Expected: PASS, todos os casos.

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: erro esperado em `formatacaoBasica.ts` (ainda importa `CATALOGO_ESTILOS_TABELA`/`aplicarEstiloTabelaHtml`, removidos) — resolvido na Task 3. Se aparecer QUALQUER outro erro em outro arquivo, pare e investigue antes de continuar.

- [ ] **Step 6: Commit**

```bash
git add src/features/formatacao-basica/tabelaRapida.ts src/features/formatacao-basica/tabelaRapida.test.ts
git commit -m "feat: catálogo de 9 cores x 7 padrões pra estilo de tabela"
```

---

### Task 2: Helper compartilhado de diálogo flutuante + CSS

**Files:**
- Create: `src/content-scripts/documento_editar/dialogoFlutuante.ts`
- Modify: `src/content-scripts/core/theme.css`

**Interfaces:**
- Produces: `criarPainelFlutuante(titulo: string, iconeSvg: string): { painel: HTMLDivElement; corpo: HTMLDivElement }`, `criarBotaoDialogo(texto: string, iconeSvg: string, classeExtra?: string): HTMLButtonElement`, `fecharPainel(painel: HTMLElement): void`. Consumidas pelas Tasks 3, 4 e 5.

- [ ] **Step 1: Criar o helper**

Criar `src/content-scripts/documento_editar/dialogoFlutuante.ts`:

```ts
export function criarPainelFlutuante(titulo: string, iconeSvg: string): { painel: HTMLDivElement; corpo: HTMLDivElement } {
  const painel = document.createElement('div')
  painel.className = 'seirmg-painel-flutuante'

  const cabecalho = document.createElement('div')
  cabecalho.className = 'seirmg-painel-flutuante-cabecalho'
  const icone = document.createElement('span')
  icone.innerHTML = iconeSvg
  const tituloSpan = document.createElement('span')
  tituloSpan.textContent = titulo
  cabecalho.append(icone, tituloSpan)

  const corpo = document.createElement('div')
  corpo.className = 'seirmg-painel-flutuante-corpo'

  painel.append(cabecalho, corpo)
  return { painel, corpo }
}

export function criarBotaoDialogo(texto: string, iconeSvg: string, classeExtra = ''): HTMLButtonElement {
  const botao = document.createElement('button')
  botao.type = 'button'
  botao.className = `seirmg-btn-acao ${classeExtra}`.trim()
  const icone = document.createElement('span')
  icone.className = 'seirmg-btn-acao-icone'
  icone.innerHTML = iconeSvg
  botao.append(icone, document.createTextNode(texto))
  return botao
}

export function fecharPainel(painel: HTMLElement): void {
  painel.remove()
}
```

- [ ] **Step 2: Adicionar o CSS compartilhado em `theme.css`**

Esses diálogos são injetados no `document` de topo da página do editor (`acao=editor_montar`), onde
`theme.css` já é carregado automaticamente pelo manifest (`all_frames:true`, `matches: acao=*`) — não
precisa de `injetarEstiloSeAusente` própria. Inserir no final de `src/content-scripts/core/theme.css`:

```css

/* ===== Diálogos flutuantes do editor (Tabela Rápida, Nota de Rodapé, LaTeX) ===== */

.seirmg-painel-flutuante {
  position: fixed;
  top: 80px;
  right: 20px;
  width: 340px;
  background: #fff;
  border: 1px solid #e2e7f0;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(20, 30, 50, 0.18), 0 2px 6px rgba(20, 30, 50, 0.1);
  z-index: 10000;
  padding: 14px;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #1a2233;
  box-sizing: border-box;
}

.seirmg-painel-flutuante-cabecalho {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  font-weight: 700;
  margin-bottom: 12px;
}

.seirmg-painel-flutuante-cabecalho svg {
  width: 15px;
  height: 15px;
  color: var(--seirmg-accent-color);
  flex-shrink: 0;
  display: block;
}

.seirmg-painel-flutuante-corpo textarea {
  width: 100%;
  min-height: 64px;
  resize: vertical;
  border: 1px solid #e2e7f0;
  border-radius: 6px;
  padding: 7px 8px;
  font: inherit;
  font-size: 12.5px;
  color: inherit;
  background: #fff;
  box-sizing: border-box;
}

.seirmg-painel-flutuante-corpo textarea:focus {
  outline: none;
  border-color: var(--seirmg-accent-color);
}

.seirmg-painel-flutuante-rodape {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid #e2e7f0;
}
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: mesmo erro esperado da Task 1 (não resolvido ainda), nenhum erro novo.

- [ ] **Step 4: Commit**

```bash
git add src/content-scripts/documento_editar/dialogoFlutuante.ts src/content-scripts/core/theme.css
git commit -m "feat: helper compartilhado de diálogo flutuante pro editor de documentos"
```

---

### Task 3: Grade de inserção + diálogo de estilo, substituindo os prompts da Tabela Rápida

**Files:**
- Create: `src/content-scripts/documento_editar/tabelaDialogo.ts`
- Modify: `src/content-scripts/documento_editar/formatacaoBasica.ts`
- Modify: `src/content-scripts/documento_editar/formatacaoBasica.test.ts`

**Interfaces:**
- Consumes: `criarPainelFlutuante`, `criarBotaoDialogo`, `fecharPainel` (Task 2), `CORES_TABELA`, `PADROES_TABELA`, `calcularEstiloCelula`, `montarTabelaHtml`, `type PadraoTabelaId` (Task 1), `type EditorSEI` (`./ponteEditor`, já existe).
- Produces: `abrirGradeInsercao(editor: EditorSEI): void`. Consumida por `formatacaoBasica.ts`.

- [ ] **Step 1: Criar `tabelaDialogo.ts`**

Criar `src/content-scripts/documento_editar/tabelaDialogo.ts`:

```ts
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

  const rotuloEstilo = 'font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#667085;margin-bottom:8px;'

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
```

- [ ] **Step 2: Atualizar `montarBotaoTabelaRapida` em `formatacaoBasica.ts`**

Substituir o import:

```ts
import { CATALOGO_ESTILOS_TABELA, aplicarEstiloTabelaHtml, montarTabelaHtml } from '../../features/formatacao-basica/tabelaRapida'
```

por:

```ts
import { abrirGradeInsercao } from './tabelaDialogo'
```

Substituir a função inteira:

```ts
function montarBotaoTabelaRapida(editor: EditorSEI): HTMLElement {
  return criarBotaoToolbar('seirmg-cke-tabela', 'Inserir tabela rápida', tableIconSvg, () => {
    const linhas = Number.parseInt(window.prompt('Quantas linhas?', '2') ?? '', 10)
    const colunas = Number.parseInt(window.prompt('Quantas colunas?', '2') ?? '', 10)
    if (!Number.isInteger(linhas) || !Number.isInteger(colunas) || linhas < 1 || colunas < 1) return

    const idsValidos = CATALOGO_ESTILOS_TABELA.map((estilo) => estilo.id).join('/')
    const idEstilo = window.prompt(`Estilo (${idsValidos}) ou deixe em branco pro padrão:`, '') ?? ''
    const estilo = CATALOGO_ESTILOS_TABELA.find((item) => item.id === idEstilo.trim())

    const tabelaHtml = montarTabelaHtml(linhas, colunas)
    const htmlFinal = estilo ? aplicarEstiloTabelaHtml(tabelaHtml, estilo) : tabelaHtml
    editor.inserirHtml(htmlFinal).catch(tratarErro('Falha ao inserir tabela rápida'))
  })
}
```

por:

```ts
function montarBotaoTabelaRapida(editor: EditorSEI): HTMLElement {
  return criarBotaoToolbar('seirmg-cke-tabela', 'Inserir tabela rápida', tableIconSvg, () => {
    abrirGradeInsercao(editor)
  })
}
```

- [ ] **Step 3: Substituir os 2 testes antigos de Tabela Rápida em `formatacaoBasica.test.ts`**

Substituir:

```ts
  it('tabela rápida: pede linhas/colunas/estilo via prompt e insere a tabela já com o estilo escolhido', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)
    const promptOriginal = window.prompt
    window.prompt = vi.fn().mockReturnValueOnce('2').mockReturnValueOnce('3').mockReturnValueOnce('bordas')

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })
    const botao = toolbox.querySelector('#seirmg-cke-tabela') as HTMLElement
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(editor.inserirHtml).toHaveBeenCalledWith(
      expect.stringContaining('<table class="Tabela" style="border-collapse:collapse;width:100%;border:1px solid #000">')
    )
    window.prompt = promptOriginal
  })

  it('tabela rápida: estilo inválido ou vazio cai no padrão (tabela sem style extra)', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)
    const promptOriginal = window.prompt
    window.prompt = vi.fn().mockReturnValueOnce('1').mockReturnValueOnce('1').mockReturnValueOnce('')

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })
    const botao = toolbox.querySelector('#seirmg-cke-tabela') as HTMLElement
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(editor.inserirHtml).toHaveBeenCalledWith(expect.stringContaining('<table class="Tabela">'))
    window.prompt = promptOriginal
  })
```

por:

```ts
  it('tabela rápida: clicar na grade avança pro diálogo de estilo, Aplicar insere a tabela com as dimensões escolhidas', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })
    const botao = toolbox.querySelector('#seirmg-cke-tabela') as HTMLElement
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    const celula = document.querySelector('[data-linha="1"][data-coluna="2"]') as HTMLElement
    celula.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    const btnAplicar = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Aplicar')
    ) as HTMLButtonElement
    btnAplicar.click()

    expect(editor.inserirHtml).toHaveBeenCalledWith(expect.stringContaining('<table class="Tabela"'))
    const htmlInserido = (editor.inserirHtml as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect((htmlInserido.match(/<tr>/g) ?? []).length).toBe(2)
    expect((htmlInserido.match(/<td/g) ?? []).length).toBe(6)
  })

  it('tabela rápida: Cancelar no diálogo de estilo não insere nada', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })
    const botao = toolbox.querySelector('#seirmg-cke-tabela') as HTMLElement
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    const celula = document.querySelector('[data-linha="0"][data-coluna="0"]') as HTMLElement
    celula.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    const btnCancelar = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Cancelar')
    ) as HTMLButtonElement
    btnCancelar.click()

    expect(editor.inserirHtml).not.toHaveBeenCalled()
  })
```

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Rodar a suíte de testes inteira**

Run: `bun run test`
Expected: PASS.

- [ ] **Step 6: Rodar o build**

Run: `bun run build`
Expected: build conclui sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/content-scripts/documento_editar/tabelaDialogo.ts src/content-scripts/documento_editar/formatacaoBasica.ts src/content-scripts/documento_editar/formatacaoBasica.test.ts
git commit -m "feat: grade visual + diálogo de estilo pra Tabela Rápida (substitui os prompts)"
```

---

### Task 4: Diálogo de Nota de Rodapé, substituindo o prompt

**Files:**
- Create: `src/content-scripts/documento_editar/notaRodapeDialogo.ts`
- Modify: `src/content-scripts/documento_editar/formatacaoBasica.ts`
- Modify: `src/content-scripts/documento_editar/formatacaoBasica.test.ts`

**Interfaces:**
- Consumes: `criarPainelFlutuante`, `criarBotaoDialogo`, `fecharPainel` (Task 2).
- Produces: `abrirDialogoNotaRodape(aoConfirmar: (texto: string) => void): void`. Consumida por `formatacaoBasica.ts`.

- [ ] **Step 1: Criar `notaRodapeDialogo.ts`**

Criar `src/content-scripts/documento_editar/notaRodapeDialogo.ts`:

```ts
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
```

- [ ] **Step 2: Atualizar `montarBotaoNotaRodape` em `formatacaoBasica.ts`**

Adicionar ao bloco de imports:

```ts
import { abrirDialogoNotaRodape } from './notaRodapeDialogo'
```

Substituir a função inteira:

```ts
function montarBotaoNotaRodape(editor: EditorSEI): HTMLElement {
  // O número é reservado de forma síncrona (fora do .then()) porque inserirHtml faz um
  // round-trip assíncrono real pela ponte: se o usuário inserir uma segunda nota antes da
  // primeira resolver, ler a contagem do DOM nesse momento repetiria o mesmo número (o DOM
  // só ganha a entrada da primeira nota depois que sua Promise resolve). O contador abaixo
  // evita essa corrida sem mudar o escopo documentado (sem renumeração ao excluir).
  let proximoNumero: number | null = null

  return criarBotaoToolbar('seirmg-cke-nota-rodape', 'Inserir nota de rodapé', superscriptIconSvg, () => {
    const texto = window.prompt('Texto da nota de rodapé:')
    if (!texto) return

    if (proximoNumero === null) {
      proximoNumero = proximoNumeroNota(editor.corpo)
    }
    const numero = proximoNumero
    proximoNumero += 1

    const id = `n${Date.now()}`
    editor
      .inserirHtml(montarChamadaHtml(id, numero))
      .then(() => {
        // Entrada é anexada direto no DOM (não passa pela ponte): é bookkeeping
        // estrutural do documento (lista de notas), não texto novo digitado pelo
        // usuário no ponto do cursor — mesma exceção documentada na spec.
        editor.corpo.insertAdjacentHTML('beforeend', montarEntradaHtml(id, numero, texto))
      })
      .catch(tratarErro('Falha ao inserir nota de rodapé'))
  })
}
```

por:

```ts
function montarBotaoNotaRodape(editor: EditorSEI): HTMLElement {
  // O número é reservado de forma síncrona (fora do .then()) porque inserirHtml faz um
  // round-trip assíncrono real pela ponte: se o usuário inserir uma segunda nota antes da
  // primeira resolver, ler a contagem do DOM nesse momento repetiria o mesmo número (o DOM
  // só ganha a entrada da primeira nota depois que sua Promise resolve). O contador abaixo
  // evita essa corrida sem mudar o escopo documentado (sem renumeração ao excluir).
  let proximoNumero: number | null = null

  return criarBotaoToolbar('seirmg-cke-nota-rodape', 'Inserir nota de rodapé', superscriptIconSvg, () => {
    abrirDialogoNotaRodape((texto) => {
      if (proximoNumero === null) {
        proximoNumero = proximoNumeroNota(editor.corpo)
      }
      const numero = proximoNumero
      proximoNumero += 1

      const id = `n${Date.now()}`
      editor
        .inserirHtml(montarChamadaHtml(id, numero))
        .then(() => {
          editor.corpo.insertAdjacentHTML('beforeend', montarEntradaHtml(id, numero, texto))
        })
        .catch(tratarErro('Falha ao inserir nota de rodapé'))
    })
  })
}
```

- [ ] **Step 3: Substituir os 2 testes antigos de Nota de Rodapé em `formatacaoBasica.test.ts`**

Substituir:

```ts
  it('nota de rodapé: pede o texto via prompt, insere a chamada e anexa a entrada no fim do corpo', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)
    const promptOriginal = window.prompt
    window.prompt = vi.fn().mockReturnValue('Texto da nota')

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })
    const botao = toolbox.querySelector('#seirmg-cke-nota-rodape') as HTMLElement
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await Promise.resolve()

    expect(editor.inserirHtml).toHaveBeenCalledWith(expect.stringContaining('<sup id="chamada-'))
    expect(editor.corpo.querySelector('.Nota_Rodape')?.textContent).toContain('Texto da nota')
    window.prompt = promptOriginal
  })

  it('nota de rodapé: duas notas clicadas em sequência, sem esperar a primeira resolver, recebem números 1 e 2 (não repetem)', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)
    const promptOriginal = window.prompt
    window.prompt = vi.fn().mockReturnValue('Nota Y')

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })
    const botao = toolbox.querySelector('#seirmg-cke-nota-rodape') as HTMLElement
    // Dispara os dois cliques antes de aguardar qualquer resolução: reproduz o cenário real
    // em que inserirHtml faz um round-trip assíncrono pela ponte e o DOM só reflete a
    // primeira nota depois que sua Promise resolve.
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    const entradas = Array.from(editor.corpo.querySelectorAll('.Nota_Rodape')).map((e) => e.textContent)
    expect(entradas).toEqual(['1. Nota Y ↑', '2. Nota Y ↑'])
    window.prompt = promptOriginal
  })
```

por:

```ts
  it('nota de rodapé: abre diálogo, digita o texto, Inserir insere a chamada e anexa a entrada no fim do corpo', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })
    const botao = toolbox.querySelector('#seirmg-cke-nota-rodape') as HTMLElement
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    const textarea = document.querySelector('textarea') as HTMLTextAreaElement
    textarea.value = 'Texto da nota'
    const btnInserir = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Inserir')
    ) as HTMLButtonElement
    btnInserir.click()
    await Promise.resolve()

    expect(editor.inserirHtml).toHaveBeenCalledWith(expect.stringContaining('<sup id="chamada-'))
    expect(editor.corpo.querySelector('.Nota_Rodape')?.textContent).toContain('Texto da nota')
  })

  it('nota de rodapé: duas notas em sequência, sem esperar a primeira resolver, recebem números 1 e 2 (não repetem)', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })
    const botao = toolbox.querySelector('#seirmg-cke-nota-rodape') as HTMLElement

    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    let textarea = document.querySelector('textarea') as HTMLTextAreaElement
    textarea.value = 'Nota Y'
    let btnInserir = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Inserir')
    ) as HTMLButtonElement
    btnInserir.click()

    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    textarea = document.querySelector('textarea') as HTMLTextAreaElement
    textarea.value = 'Nota Y'
    btnInserir = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Inserir')
    ) as HTMLButtonElement
    btnInserir.click()

    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    const entradas = Array.from(editor.corpo.querySelectorAll('.Nota_Rodape')).map((e) => e.textContent)
    expect(entradas).toEqual(['1. Nota Y ↑', '2. Nota Y ↑'])
  })
```

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Rodar a suíte de testes inteira**

Run: `bun run test`
Expected: PASS.

- [ ] **Step 6: Rodar o build**

Run: `bun run build`
Expected: build conclui sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/content-scripts/documento_editar/notaRodapeDialogo.ts src/content-scripts/documento_editar/formatacaoBasica.ts src/content-scripts/documento_editar/formatacaoBasica.test.ts
git commit -m "feat: diálogo de verdade pra Nota de Rodapé (substitui o prompt)"
```

---

### Task 5: Reestilizar o diálogo de Equação (LaTeX)

**Files:**
- Modify: `src/content-scripts/documento_editar/latex.ts`

**Interfaces:**
- Consumes: `criarPainelFlutuante`, `criarBotaoDialogo`, `fecharPainel` (Task 2).
- Produces: nenhuma mudança de interface — `abrirDialogoLatex(editor: EditorSEI): void` continua com a mesma assinatura.

- [ ] **Step 1: Reescrever `latex.ts` inteiro**

Substituir `src/content-scripts/documento_editar/latex.ts` inteiro:

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Rodar a suíte de testes inteira**

Run: `bun run test`
Expected: PASS (verificar especificamente se existe algum teste de `latex.ts`/diálogo de equação hoje — se existir e quebrar por causa da mudança de marcação HTML, ajustar o teste pra continuar verificando comportamento, não estrutura interna específica removida).

- [ ] **Step 4: Rodar o build**

Run: `bun run build`
Expected: build conclui sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/content-scripts/documento_editar/latex.ts
git commit -m "style: reestiliza o diálogo de Equação (LaTeX) no padrão novo"
```

---

## Verificação manual pendente (fora do escopo de teste automatizado)

Numa instância SEI real, na tela de editar documento: clicar no botão "Tabela" da barra do editor,
passar o mouse pela grade (confirmar que destaca e mostra "R × C"), clicar numa célula, confirmar que
o diálogo de estilo abre com cores e padrões navegáveis, clicar num padrão e numa cor diferentes,
clicar Aplicar e confirmar que a tabela aparece no documento já com o estilo escolhido. Confirmar que
Cancelar (tanto na grade quanto no estilo) não insere nada. Testar o botão de Nota de Rodapé (digitar
texto, Inserir, confirmar chamada + entrada no rodapé) e o de Equação (fórmula LaTeX, preview ao vivo,
Inserir). Conferir visualmente que os 4 diálogos batem com o mockup aprovado
(https://claude.ai/code/artifact/82020ae6-d7b1-409c-8cd3-ff73607a3816).
