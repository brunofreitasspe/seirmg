# SEIRMG — Lote E: Controle de Processos — Núcleo de Filtros e Seleção Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir a estrutura das tabelas nativas (thead), portar o motor de filtro genérico + busca rápida "OU", seleção múltipla via Shift+clique e confirmação antes de concluir em lote, todos do Sei++, estendendo o content script `procedimento_controlar` já entregue no Lote D.

**Architecture:** Ver `docs/superpowers/specs/2026-07-07-seirmg-lote-e-filtros-selecao-design.md`. Lógica pura testável em `features/controle-processos/`, wiring fino não-testado estendendo `content-scripts/procedimento_controlar/index.ts` (mesmo arquivo do Lote D, não um content script novo — ordem de execução importa).

**Tech Stack:** TypeScript, Vite, `@crxjs/vite-plugin`, Bun, Vitest — mesma infraestrutura já existente. Nenhuma dependência nova.

## Global Constraints

- Nenhuma permissão nova, nenhum host novo, nenhum bloco de `content_scripts` novo no manifest — tudo estende o bloco `procedimento_controlar` já registrado.
- Nenhuma feature flag nova em `lib/storage.ts` — estas 4 features ficam sempre ativas quando o content script roda, mesmo tratamento de `core`/`tema` (sem toggle na aba Processos).
- `corrigirTabelasNativas()` roda **antes** de tudo no bootstrap — corrige um bug latente do Lote D (cabeçalho "Dias"/"Prazo" nunca aparecia porque as tabelas nativas não têm `<thead>`).
- Cada nova etapa do bootstrap (`corrigirTabelasNativas`, `montarBuscaRapida`, `montarSelecaoMultipla`, `montarConfirmarAntesDeConcluir`) roda isolada em seu próprio `try/catch`, loga via `console.error('[SEIRMG] ...', error)` — falha numa não impede as demais.
- Adaptação em relação ao original: `confirmarAntesConcluir.js` também chama `acaoPendenciaMultipla(true)` (função nativa do SEI) dentro da condição do `confirm` — omitida aqui por não haver garantia de que essa função existe em todas as versões do SEI; o `confirm()` sozinho já cobre o requisito principal (evitar conclusão acidental em lote).

---

## Mapa de arquivos (visão geral)

```
seirmg/
├── src/
│   ├── features/controle-processos/
│   │   ├── filtroTabela.ts (+ .test.ts, novo)
│   │   ├── buscaRapida.ts (+ .test.ts, novo)
│   │   └── selecaoMultipla.ts (+ .test.ts, novo)
│   └── content-scripts/procedimento_controlar/index.ts (modificado)
```

---

### Task 1: `features/controle-processos/filtroTabela.ts`

**Files:**
- Create: `C:\sei\seirmg\src\features\controle-processos\filtroTabela.ts`
- Test: `C:\sei\seirmg\src\features\controle-processos\filtroTabela.test.ts`

**Contexto**: reimplementação pura da semântica de `C:\sei\seiplus\cs_modules\lib\filtra_processos\index.js` — motor de filtro composto (múltiplos filtros nomeados, AND entre eles), decoupled de jQuery/atributos DOM para ser testável e reaproveitável pelo Lote E2 (filtro por atribuição/bloco).

**Interfaces:**
- Consumes: nenhuma
- Produces: `type EstadoFiltros = Record<string, Record<string, boolean>>`; `registrarFiltro(estado: EstadoFiltros, sufixo: string, resultadoPorLinha: Record<string, boolean>): EstadoFiltros`; `removerFiltro(estado: EstadoFiltros, sufixo: string): EstadoFiltros`; `calcularVisibilidade(estado: EstadoFiltros, linhaIds: string[]): Record<string, boolean>`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/features/controle-processos/filtroTabela.test.ts
import { describe, expect, it } from 'vitest'
import { calcularVisibilidade, registrarFiltro, removerFiltro } from './filtroTabela'

describe('registrarFiltro', () => {
  it('adiciona um filtro nomeado ao estado', () => {
    const estado = registrarFiltro({}, 'busca', { l1: true, l2: false })
    expect(estado).toEqual({ busca: { l1: true, l2: false } })
  })

  it('substitui o resultado de um filtro já registrado com o mesmo sufixo', () => {
    const estado = registrarFiltro({ busca: { l1: true } }, 'busca', { l1: false, l2: true })
    expect(estado).toEqual({ busca: { l1: false, l2: true } })
  })
})

describe('removerFiltro', () => {
  it('remove o filtro do estado', () => {
    const estado = removerFiltro({ busca: { l1: true }, atribuicao: { l1: false } }, 'busca')
    expect(estado).toEqual({ atribuicao: { l1: false } })
  })

  it('não faz nada quando o filtro não existe', () => {
    const estado = removerFiltro({ atribuicao: { l1: true } }, 'busca')
    expect(estado).toEqual({ atribuicao: { l1: true } })
  })
})

describe('calcularVisibilidade', () => {
  it('sem nenhum filtro ativo, todas as linhas ficam visíveis', () => {
    expect(calcularVisibilidade({}, ['l1', 'l2'])).toEqual({ l1: true, l2: true })
  })

  it('uma linha só fica visível se passar em todos os filtros ativos (AND)', () => {
    const estado = { busca: { l1: true, l2: true }, atribuicao: { l1: true, l2: false } }
    expect(calcularVisibilidade(estado, ['l1', 'l2'])).toEqual({ l1: true, l2: false })
  })

  it('remover um filtro restaura a visibilidade das linhas que só falhavam nele', () => {
    let estado = registrarFiltro({}, 'busca', { l1: true, l2: false })
    expect(calcularVisibilidade(estado, ['l1', 'l2'])).toEqual({ l1: true, l2: false })
    estado = removerFiltro(estado, 'busca')
    expect(calcularVisibilidade(estado, ['l1', 'l2'])).toEqual({ l1: true, l2: true })
  })

  it('trata linha ausente no resultado de um filtro como reprovada', () => {
    const estado = { busca: { l1: true } }
    expect(calcularVisibilidade(estado, ['l1', 'l2'])).toEqual({ l1: true, l2: false })
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/features/controle-processos/filtroTabela.test.ts`
Expected: FAIL — `Cannot find module './filtroTabela'`

- [ ] **Step 3: Implementar `src/features/controle-processos/filtroTabela.ts`**

```ts
export type EstadoFiltros = Record<string, Record<string, boolean>>

export function registrarFiltro(
  estado: EstadoFiltros,
  sufixo: string,
  resultadoPorLinha: Record<string, boolean>
): EstadoFiltros {
  return { ...estado, [sufixo]: resultadoPorLinha }
}

export function removerFiltro(estado: EstadoFiltros, sufixo: string): EstadoFiltros {
  const resto = { ...estado }
  delete resto[sufixo]
  return resto
}

export function calcularVisibilidade(
  estado: EstadoFiltros,
  linhaIds: string[]
): Record<string, boolean> {
  const sufixosAtivos = Object.keys(estado)
  const resultado: Record<string, boolean> = {}
  linhaIds.forEach((id) => {
    resultado[id] = sufixosAtivos.every((sufixo) => estado[sufixo]?.[id] === true)
  })
  return resultado
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/features/controle-processos/filtroTabela.test.ts`
Expected: PASS (9 testes)

- [ ] **Step 5: Commit**

```bash
git add src/features/controle-processos/filtroTabela.ts src/features/controle-processos/filtroTabela.test.ts
git commit -m "feat(controle-processos): add composable table filter engine"
```

---

### Task 2: `features/controle-processos/buscaRapida.ts`

**Files:**
- Create: `C:\sei\seirmg\src\features\controle-processos\buscaRapida.ts`
- Test: `C:\sei\seirmg\src\features\controle-processos\buscaRapida.test.ts`

**Contexto**: porte de `C:\sei\seiplus\cs_modules\lib\filtra_processos\pesquisarInformacoes.js`.

**Interfaces:**
- Consumes: nenhuma
- Produces: `parseTermosBusca(textoOriginal: string): string[]`; `linhaCasaBusca(textoLinha: string, termos: string[]): boolean`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/features/controle-processos/buscaRapida.test.ts
import { describe, expect, it } from 'vitest'
import { linhaCasaBusca, parseTermosBusca } from './buscaRapida'

describe('parseTermosBusca', () => {
  it('retorna lista vazia para texto vazio', () => {
    expect(parseTermosBusca('')).toEqual([])
  })

  it('retorna um único termo em minúsculo para texto simples', () => {
    expect(parseTermosBusca('Processo')).toEqual(['processo'])
  })

  it('divide em múltiplos termos no formato "[termo1 termo2]" (busca OU)', () => {
    expect(parseTermosBusca('[Urgente Recurso]')).toEqual(['urgente', 'recurso'])
  })

  it('trata espaços múltiplos entre termos dentro dos colchetes', () => {
    expect(parseTermosBusca('[a   b]')).toEqual(['a', 'b'])
  })
})

describe('linhaCasaBusca', () => {
  it('casa quando o texto da linha contém o termo (case-insensitive)', () => {
    expect(linhaCasaBusca('Processo URGENTE aberto', ['urgente'])).toBe(true)
  })

  it('casa quando qualquer um dos termos aparece (OU)', () => {
    expect(linhaCasaBusca('Processo de recurso', ['urgente', 'recurso'])).toBe(true)
  })

  it('não casa quando nenhum termo aparece', () => {
    expect(linhaCasaBusca('Processo comum', ['urgente', 'recurso'])).toBe(false)
  })

  it('não casa quando a lista de termos está vazia', () => {
    expect(linhaCasaBusca('qualquer texto', [])).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/features/controle-processos/buscaRapida.test.ts`
Expected: FAIL — `Cannot find module './buscaRapida'`

- [ ] **Step 3: Implementar `src/features/controle-processos/buscaRapida.ts`**

```ts
export function parseTermosBusca(textoOriginal: string): string[] {
  const texto = textoOriginal.toLowerCase()
  if (!texto) return []

  const match = texto.match(/^\[(.+)\]$/)
  if (match) return match[1].match(/\S+/g) ?? []

  return [texto]
}

export function linhaCasaBusca(textoLinha: string, termos: string[]): boolean {
  const texto = textoLinha.toLowerCase()
  return termos.some((termo) => texto.includes(termo))
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/features/controle-processos/buscaRapida.test.ts`
Expected: PASS (8 testes)

- [ ] **Step 5: Commit**

```bash
git add src/features/controle-processos/buscaRapida.ts src/features/controle-processos/buscaRapida.test.ts
git commit -m "feat(controle-processos): add quick search parsing (OR syntax)"
```

---

### Task 3: `features/controle-processos/selecaoMultipla.ts`

**Files:**
- Create: `C:\sei\seirmg\src\features\controle-processos\selecaoMultipla.ts`
- Test: `C:\sei\seirmg\src\features\controle-processos\selecaoMultipla.test.ts`

**Contexto**: porte de `C:\sei\seiplus\cs_modules\lib\selecionarMultiplosProcessos.js`.

**Interfaces:**
- Consumes: nenhuma
- Produces: `calcularIndicesParaClicar(indiceInicial: number, indiceFinal: number): number[]`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/features/controle-processos/selecaoMultipla.test.ts
import { describe, expect, it } from 'vitest'
import { calcularIndicesParaClicar } from './selecaoMultipla'

describe('calcularIndicesParaClicar', () => {
  it('retorna os índices estritamente entre início e fim', () => {
    expect(calcularIndicesParaClicar(2, 5)).toEqual([3, 4])
  })

  it('funciona com os índices invertidos', () => {
    expect(calcularIndicesParaClicar(5, 2)).toEqual([3, 4])
  })

  it('retorna vazio quando os índices são adjacentes', () => {
    expect(calcularIndicesParaClicar(2, 3)).toEqual([])
  })

  it('retorna vazio quando os índices são iguais', () => {
    expect(calcularIndicesParaClicar(4, 4)).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/features/controle-processos/selecaoMultipla.test.ts`
Expected: FAIL — `Cannot find module './selecaoMultipla'`

- [ ] **Step 3: Implementar `src/features/controle-processos/selecaoMultipla.ts`**

```ts
export function calcularIndicesParaClicar(indiceInicial: number, indiceFinal: number): number[] {
  const menor = Math.min(indiceInicial, indiceFinal)
  const maior = Math.max(indiceInicial, indiceFinal)
  const indices: number[] = []
  for (let i = menor + 1; i < maior; i++) indices.push(i)
  return indices
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/features/controle-processos/selecaoMultipla.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add src/features/controle-processos/selecaoMultipla.ts src/features/controle-processos/selecaoMultipla.test.ts
git commit -m "feat(controle-processos): add shift-click range selection helper"
```

---

### Task 4: `content-scripts/procedimento_controlar/index.ts` — wiring completo

**Files:**
- Modify: `C:\sei\seirmg\src\content-scripts\procedimento_controlar\index.ts`

**Contexto**: esta camada só conecta DOM (`document.querySelector`, listeners) à lógica já testada. Não é coberta por TDD (mesmo padrão já estabelecido) — verificada via build. `corrigirTabelasNativas()` roda primeiro, antes de qualquer outra etapa (inclusive as 3 já existentes do Lote D), porque `aplicarPrazos` depende de `thead > tr` existir para inserir o cabeçalho.

**Interfaces:**
- Consumes: `registrarFiltro`, `removerFiltro`, `calcularVisibilidade`, `type EstadoFiltros` (Task 1); `parseTermosBusca`, `linhaCasaBusca` (Task 2); `calcularIndicesParaClicar` (Task 3)

- [ ] **Step 1: Substituir `src/content-scripts/procedimento_controlar/index.ts`**

Arquivo atual (do Lote D, sem mudanças desde então):

```ts
import {
  calcularDiasDoMarcador,
  classificarPrazo,
  extrairTextoMarcador,
  type TipoCalculoPrazo,
} from '../../features/controle-processos/prazos'
import { escolherCorProcesso, extrairEspecificacaoParaCor } from '../../features/controle-processos/corProcesso'
import {
  extrairEspecificacaoParaExibicao,
  extrairEspecificacaoParaLista,
} from '../../features/controle-processos/especificacao'
import { createSyncConfigStore } from '../../lib/storage'
import type { ControleProcessosConfig } from '../../lib/storage'

const IDS_TABELAS = ['#tblProcessosDetalhado', '#tblProcessosGerados', '#tblProcessosRecebidos']

function linhasDaTabela(idTabela: string): Element[] {
  const tabela = document.querySelector(idTabela)
  if (!tabela) return []
  return Array.from(tabela.querySelectorAll('tbody > tr'))
}

function aplicarPrazos(config: ControleProcessosConfig['prazos']): void {
  if (!config.ativo) return

  const tipos: Array<{
    tipo: TipoCalculoPrazo
    exibir: boolean
    rotulo: string
    limites: { alerta: number; critico: number }
  }> = [
    {
      tipo: 'qtddias',
      exibir: config.exibirDias,
      rotulo: 'Dias',
      limites: { alerta: config.alertaDias, critico: config.criticoDias },
    },
    {
      tipo: 'prazo',
      exibir: config.exibirPrazo,
      rotulo: 'Prazo',
      limites: { alerta: config.alertaPrazo, critico: config.criticoPrazo },
    },
  ]

  IDS_TABELAS.forEach((idTabela) => {
    const tabela = document.querySelector(idTabela)
    if (!tabela) return

    tipos.forEach(({ tipo, exibir, rotulo, limites }) => {
      if (!exibir) return

      const theadRow = tabela.querySelector('thead > tr')
      if (theadRow) {
        const th = document.createElement('th')
        th.className = 'infraTh'
        th.textContent = rotulo
        theadRow.appendChild(th)
      }

      linhasDaTabela(idTabela).forEach((linha) => {
        const marcadores = Array.from(
          linha.querySelectorAll<HTMLAnchorElement>("td > a[href*='acao=andamento_marcador_gerenciar']")
        )
        const textos = marcadores
          .map((marcador) => marcador.getAttribute('onmouseover'))
          .filter((texto): texto is string => texto !== null)
          .map(extrairTextoMarcador)

        const valor = calcularDiasDoMarcador(textos, tipo, new Date())

        const td = document.createElement('td')
        td.setAttribute('valign', 'top')
        td.setAttribute('align', 'center')
        td.textContent = valor === null ? '' : String(valor)
        linha.appendChild(td)

        if (valor !== null) {
          const classificacao = classificarPrazo(valor, tipo, limites)
          if (classificacao === 'alerta') linha.classList.add('infraTrseippalerta')
          if (classificacao === 'critico') linha.classList.add('infraTrseippcritico')
        }
      })
    })
  })
}

function aplicarCorProcesso(config: ControleProcessosConfig['coresProcesso']): void {
  if (!config.ativo || config.regras.length === 0) return

  IDS_TABELAS.forEach((idTabela) => {
    linhasDaTabela(idTabela).forEach((linha) => {
      const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
      const onmouseover = processo?.getAttribute('onmouseover')
      if (!processo || !onmouseover) return

      const especificacao = extrairEspecificacaoParaCor(onmouseover)
      const cor = escolherCorProcesso(especificacao, config.regras)
      if (cor) {
        processo.setAttribute('style', `background-color: ${cor}; padding: 0 1em 0 1em`)
      }
    })
  })
}

function aplicarEspecificacao(config: ControleProcessosConfig['especificacao']): void {
  if (!config.ativo) return

  IDS_TABELAS.forEach((idTabela) => {
    linhasDaTabela(idTabela).forEach((linha) => {
      const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
      const onmouseover = processo?.getAttribute('onmouseover')
      if (!processo || !onmouseover) return

      if (config.modo === 'mostrar') {
        const especificacao = extrairEspecificacaoParaExibicao(onmouseover)
        const span = document.createElement('span')
        span.textContent = especificacao
        span.style.cssText = 'font-size:.9em;color:darkblue;display:block;'
        span.title = 'Especificação'
        processo.insertAdjacentElement('afterend', span)
      } else {
        const especificacao = extrairEspecificacaoParaLista(onmouseover)
        processo.textContent = especificacao || `${processo.textContent} (sem especificação)`
      }
    })
  })
}

async function bootstrap(): Promise<void> {
  try {
    const config = await createSyncConfigStore().get()
    aplicarPrazos(config.controleProcessos.prazos)
    aplicarCorProcesso(config.controleProcessos.coresProcesso)
    aplicarEspecificacao(config.controleProcessos.especificacao)
  } catch (error) {
    console.error('[SEIRMG] Falha ao aplicar recursos de Controle de Processos:', error)
  }
}

bootstrap()
```

Substituir por (mantém `linhasDaTabela`/`aplicarPrazos`/`aplicarCorProcesso`/`aplicarEspecificacao` idênticos; adiciona `corrigirTabelasNativas`, `montarBuscaRapida`, `montarSelecaoMultipla`, `montarConfirmarAntesDeConcluir`, e atualiza `bootstrap`):

```ts
import {
  calcularDiasDoMarcador,
  classificarPrazo,
  extrairTextoMarcador,
  type TipoCalculoPrazo,
} from '../../features/controle-processos/prazos'
import { escolherCorProcesso, extrairEspecificacaoParaCor } from '../../features/controle-processos/corProcesso'
import {
  extrairEspecificacaoParaExibicao,
  extrairEspecificacaoParaLista,
} from '../../features/controle-processos/especificacao'
import {
  calcularVisibilidade,
  registrarFiltro,
  removerFiltro,
  type EstadoFiltros,
} from '../../features/controle-processos/filtroTabela'
import { linhaCasaBusca, parseTermosBusca } from '../../features/controle-processos/buscaRapida'
import { calcularIndicesParaClicar } from '../../features/controle-processos/selecaoMultipla'
import { createSyncConfigStore } from '../../lib/storage'
import type { ControleProcessosConfig } from '../../lib/storage'

const IDS_TABELAS = ['#tblProcessosDetalhado', '#tblProcessosGerados', '#tblProcessosRecebidos']

function linhasDaTabela(idTabela: string): Element[] {
  const tabela = document.querySelector(idTabela)
  if (!tabela) return []
  return Array.from(tabela.querySelectorAll('tbody > tr'))
}

function aplicarPrazos(config: ControleProcessosConfig['prazos']): void {
  if (!config.ativo) return

  const tipos: Array<{
    tipo: TipoCalculoPrazo
    exibir: boolean
    rotulo: string
    limites: { alerta: number; critico: number }
  }> = [
    {
      tipo: 'qtddias',
      exibir: config.exibirDias,
      rotulo: 'Dias',
      limites: { alerta: config.alertaDias, critico: config.criticoDias },
    },
    {
      tipo: 'prazo',
      exibir: config.exibirPrazo,
      rotulo: 'Prazo',
      limites: { alerta: config.alertaPrazo, critico: config.criticoPrazo },
    },
  ]

  IDS_TABELAS.forEach((idTabela) => {
    const tabela = document.querySelector(idTabela)
    if (!tabela) return

    tipos.forEach(({ tipo, exibir, rotulo, limites }) => {
      if (!exibir) return

      const theadRow = tabela.querySelector('thead > tr')
      if (theadRow) {
        const th = document.createElement('th')
        th.className = 'infraTh'
        th.textContent = rotulo
        theadRow.appendChild(th)
      }

      linhasDaTabela(idTabela).forEach((linha) => {
        const marcadores = Array.from(
          linha.querySelectorAll<HTMLAnchorElement>("td > a[href*='acao=andamento_marcador_gerenciar']")
        )
        const textos = marcadores
          .map((marcador) => marcador.getAttribute('onmouseover'))
          .filter((texto): texto is string => texto !== null)
          .map(extrairTextoMarcador)

        const valor = calcularDiasDoMarcador(textos, tipo, new Date())

        const td = document.createElement('td')
        td.setAttribute('valign', 'top')
        td.setAttribute('align', 'center')
        td.textContent = valor === null ? '' : String(valor)
        linha.appendChild(td)

        if (valor !== null) {
          const classificacao = classificarPrazo(valor, tipo, limites)
          if (classificacao === 'alerta') linha.classList.add('infraTrseippalerta')
          if (classificacao === 'critico') linha.classList.add('infraTrseippcritico')
        }
      })
    })
  })
}

function aplicarCorProcesso(config: ControleProcessosConfig['coresProcesso']): void {
  if (!config.ativo || config.regras.length === 0) return

  IDS_TABELAS.forEach((idTabela) => {
    linhasDaTabela(idTabela).forEach((linha) => {
      const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
      const onmouseover = processo?.getAttribute('onmouseover')
      if (!processo || !onmouseover) return

      const especificacao = extrairEspecificacaoParaCor(onmouseover)
      const cor = escolherCorProcesso(especificacao, config.regras)
      if (cor) {
        processo.setAttribute('style', `background-color: ${cor}; padding: 0 1em 0 1em`)
      }
    })
  })
}

function aplicarEspecificacao(config: ControleProcessosConfig['especificacao']): void {
  if (!config.ativo) return

  IDS_TABELAS.forEach((idTabela) => {
    linhasDaTabela(idTabela).forEach((linha) => {
      const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
      const onmouseover = processo?.getAttribute('onmouseover')
      if (!processo || !onmouseover) return

      if (config.modo === 'mostrar') {
        const especificacao = extrairEspecificacaoParaExibicao(onmouseover)
        const span = document.createElement('span')
        span.textContent = especificacao
        span.style.cssText = 'font-size:.9em;color:darkblue;display:block;'
        span.title = 'Especificação'
        processo.insertAdjacentElement('afterend', span)
      } else {
        const especificacao = extrairEspecificacaoParaLista(onmouseover)
        processo.textContent = especificacao || `${processo.textContent} (sem especificação)`
      }
    })
  })
}

function corrigirTabelasNativas(): void {
  IDS_TABELAS.forEach((idTabela) => {
    try {
      const tabela = document.querySelector(idTabela)
      if (!tabela || tabela.querySelector('thead')) return

      const primeiraLinha = tabela.querySelector('tbody > tr:first-child')
      const caption = tabela.querySelector('caption')
      if (!primeiraLinha || !caption) return

      const thead = document.createElement('thead')
      thead.appendChild(primeiraLinha)
      caption.insertAdjacentElement('afterend', thead)
    } catch (error) {
      console.error(`[SEIRMG] Falha ao corrigir estrutura da tabela ${idTabela}:`, error)
    }
  })
}

const estadoFiltrosPorTabela = new Map<string, EstadoFiltros>()

function atualizarCaption(tabela: Element, totalVisivel: number): void {
  const caption = tabela.querySelector('caption')
  if (!caption) return
  caption.textContent = `${totalVisivel} registro${totalVisivel === 1 ? '' : 's'}:`
}

function aplicarVisibilidade(idTabela: string, visibilidade: Record<string, boolean>): void {
  const tabela = document.querySelector(idTabela)
  if (!tabela) return

  let totalVisivel = 0
  linhasDaTabela(idTabela).forEach((linha, index) => {
    const id = linha.id || String(index)
    const visivel = visibilidade[id] ?? true
    const checkbox = linha.querySelector<HTMLInputElement>('input[type="checkbox"]')
    const linhaEl = linha as HTMLElement

    if (visivel) {
      linhaEl.style.display = 'table-row'
      totalVisivel++
    } else {
      linhaEl.style.display = 'none'
      if (checkbox?.checked) checkbox.click()
    }
    if (checkbox) checkbox.disabled = !visivel
  })

  atualizarCaption(tabela, totalVisivel)
}

function montarBuscaRapida(): void {
  try {
    const inputBusca = document.getElementById('txtPesquisaRapida') as HTMLInputElement | null
    if (!inputBusca) return

    const atualizar = (): void => {
      try {
        const termos = parseTermosBusca(inputBusca.value)

        IDS_TABELAS.forEach((idTabela) => {
          const linhas = linhasDaTabela(idTabela)
          let estado = estadoFiltrosPorTabela.get(idTabela) ?? {}

          if (termos.length === 0) {
            estado = removerFiltro(estado, 'PorPesquisa')
          } else {
            const resultado: Record<string, boolean> = {}
            linhas.forEach((linha, index) => {
              const id = linha.id || String(index)
              resultado[id] = linhaCasaBusca(linha.textContent ?? '', termos)
            })
            estado = registrarFiltro(estado, 'PorPesquisa', resultado)
          }

          estadoFiltrosPorTabela.set(idTabela, estado)
          const ids = linhas.map((linha, index) => linha.id || String(index))
          aplicarVisibilidade(idTabela, calcularVisibilidade(estado, ids))
        })
      } catch (error) {
        console.error('[SEIRMG] Falha ao aplicar busca rápida:', error)
      }
    }

    inputBusca.addEventListener('input', atualizar)
    inputBusca.addEventListener('change', atualizar)
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar busca rápida:', error)
  }
}

let shiftPressionado = false
const ultimoIndicePorTabela = new Map<string, number>()
let cliqueSinteticoEmAndamento = false

function montarSelecaoMultipla(): void {
  try {
    document.addEventListener('keydown', (evento) => {
      shiftPressionado = evento.shiftKey
    })
    document.addEventListener('keyup', (evento) => {
      shiftPressionado = evento.shiftKey
    })

    IDS_TABELAS.forEach((idTabela) => {
      const tabela = document.querySelector(idTabela)
      if (!tabela) return

      tabela.addEventListener('click', (evento) => {
        if (cliqueSinteticoEmAndamento) return
        const alvo = evento.target
        if (!(alvo instanceof HTMLInputElement) || alvo.type !== 'checkbox') return

        const checkboxes = Array.from(tabela.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
        const indiceAtual = checkboxes.indexOf(alvo)
        if (indiceAtual === -1) return

        if (shiftPressionado && ultimoIndicePorTabela.has(idTabela)) {
          const indiceAnterior = ultimoIndicePorTabela.get(idTabela) as number
          const indices = calcularIndicesParaClicar(indiceAnterior, indiceAtual)

          cliqueSinteticoEmAndamento = true
          indices.forEach((indice) => {
            const checkbox = checkboxes[indice]
            if (checkbox && checkbox.offsetParent !== null) checkbox.click()
          })
          cliqueSinteticoEmAndamento = false
        }

        ultimoIndicePorTabela.set(idTabela, indiceAtual)
      })
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar seleção múltipla:', error)
  }
}

function montarConfirmarAntesDeConcluir(): void {
  try {
    const botao = document.querySelector<HTMLAnchorElement>(
      '#divComandos > a[onclick*="acao=procedimento_concluir"]'
    )
    if (!botao) return

    const acaoOriginal = botao.getAttribute('onclick')
    if (!acaoOriginal) return

    botao.setAttribute(
      'onclick',
      `if (confirm('Deseja mesmo concluir os processos selecionados?')) { ${acaoOriginal} }`
    )
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar confirmação antes de concluir:', error)
  }
}

async function bootstrap(): Promise<void> {
  try {
    corrigirTabelasNativas()
    montarBuscaRapida()
    montarSelecaoMultipla()
    montarConfirmarAntesDeConcluir()

    const config = await createSyncConfigStore().get()
    aplicarPrazos(config.controleProcessos.prazos)
    aplicarCorProcesso(config.controleProcessos.coresProcesso)
    aplicarEspecificacao(config.controleProcessos.especificacao)
  } catch (error) {
    console.error('[SEIRMG] Falha ao aplicar recursos de Controle de Processos:', error)
  }
}

bootstrap()
```

- [ ] **Step 2: Rodar toda a suíte de testes para confirmar que nada quebrou**

Run: `cd C:\sei\seirmg && bunx vitest run`
Expected: todos os testes continuam passando (169 testes no total — 148 antes deste plano + 9 (Task 1) + 8 (Task 2) + 4 (Task 3) = 169)

- [ ] **Step 3: Rodar o build**

Run: `bun run build`
Expected: sucesso, sem erros de tipo. Se houver erro, rode `bun run typecheck`.

- [ ] **Step 4: Commit**

```bash
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "feat(controle-processos): wire table fix, quick search, multi-select and confirm-before-conclude"
```

---

### Task 5: Checagem final (typecheck/lint/test/build/manifest)

**Files:** nenhum arquivo novo — checklist de verificação, mesmo padrão dos planos anteriores.

- [ ] **Step 1: Rodar a checagem completa**

Run:
```bash
cd C:\sei\seirmg
bun run typecheck
bun run lint
bun run test
bun run build
```
Expected: os 4 comandos terminam com código de saída 0. `bun run test` reporta 169 testes, todos passando.

- [ ] **Step 2: Validar o `manifest.json` gerado e confirmar que as permissões não mudaram**

Run: `node -e "const m = JSON.parse(require('fs').readFileSync('dist/manifest.json', 'utf8')); console.log('manifest.json válido'); console.log(JSON.stringify(m.permissions))"`
Expected: `manifest.json válido` seguido de `["storage","notifications","alarms","tabs"]` — exatamente as mesmas permissões de antes.

---

## Self-Review (checklist do autor do plano)

1. **Cobertura da spec**: `filtroTabela.ts` (Task 1), `buscaRapida.ts` (Task 2), `selecaoMultipla.ts` (Task 3), wiring completo com `corrigirTabelasNativas` rodando primeiro (Task 4). Todas as seções da spec têm task correspondente.
2. **Placeholders**: nenhum "TBD"/"TODO"; todo código de teste e implementação está completo e literal.
3. **Consistência de tipos**: `EstadoFiltros` (Task 1) usado identicamente no content script (Task 4, `Map<string, EstadoFiltros>`). `parseTermosBusca`/`linhaCasaBusca` (Task 2) e `calcularIndicesParaClicar` (Task 3) consumidos identicamente pelo wiring (Task 4).
4. **Contagem de testes**: 148 (baseline antes deste plano) + 9 (Task 1) + 8 (Task 2) + 4 (Task 3) = 169 testes esperados ao final da Task 4 em diante.
