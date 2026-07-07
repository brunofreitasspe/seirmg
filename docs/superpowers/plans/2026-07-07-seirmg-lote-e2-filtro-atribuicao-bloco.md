# SEIRMG — Lote E2: Filtro por Atribuição + Filtro por Bloco Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar `filtraPorAtribuicao.js` e `carregaInformacaoBlocos.js` do Sei++, reaproveitando o motor de filtro (`filtroTabela.ts`) e a infraestrutura de visibilidade (`aplicarVisibilidade`/`estadoFiltrosPorTabela`) já entregues no Lote E.

**Architecture:** Ver `docs/superpowers/specs/2026-07-07-seirmg-lote-e2-filtro-atribuicao-bloco-design.md`. Lógica pura testável em `features/controle-processos/`, wiring fino não-testado estendendo (mais uma vez) `content-scripts/procedimento_controlar/index.ts`.

**Tech Stack:** TypeScript, Vite, `@crxjs/vite-plugin`, Bun, Vitest — mesma infraestrutura já existente. Nenhuma dependência nova.

## Global Constraints

- Nenhuma permissão nova, nenhum host novo, nenhum bloco de `content_scripts` novo — o `fetch` das telas de bloco roda dentro dos `host_permissions` já concedidos, direto no content script (sem round-trip pelo background).
- URLs de bloco resolvidas via `.href` do link nativo já presente na página (propriedade IDL, já absoluta) — **não** reconstruídas manualmente com um caminho fixo tipo `/sei/`, que quebraria em instalações do SEI com outro caminho base.
- Sem a opção `filtraporatribuicao === 'nome'` do original (modo alternativo de exibição) — sempre usa o texto do link como identificador/rótulo.
- Nenhuma feature flag nova em `lib/storage.ts` — mesmo tratamento das demais features desta tela (sempre ativas).
- Cada nova etapa do bootstrap roda isolada em `try/catch`, loga via `console.error('[SEIRMG] ...', error)` — falha numa não impede as demais.

---

## Mapa de arquivos (visão geral)

```
seirmg/
├── src/
│   ├── lib/storage.ts (modificado)
│   ├── features/controle-processos/
│   │   ├── filtroAtribuicao.ts (+ .test.ts, novo)
│   │   └── filtroBloco.ts (+ .test.ts, novo)
│   └── content-scripts/procedimento_controlar/index.ts (modificado)
```

---

### Task 1: `lib/storage.ts` — `LocalConfig.atribuicaoSelecionada`

**Files:**
- Modify: `C:\sei\seirmg\src\lib\storage.ts`
- Modify: `C:\sei\seirmg\src\lib\storage.test.ts`

**Interfaces:**
- Consumes: nenhuma
- Produces: `LocalConfig.atribuicaoSelecionada?: string`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final do `describe('createLocalConfigStore', ...)` já existente em `src/lib/storage.test.ts`:

```ts
  it('persiste atribuicaoSelecionada', async () => {
    const area = criarAreaFalsa()
    const store = createLocalConfigStore(area)
    const atualizado = { ...DEFAULT_LOCAL_CONFIG, atribuicaoSelecionada: 'joao.silva' }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/lib/storage.test.ts`
Expected: FAIL — erro de tipo, `atribuicaoSelecionada` não existe em `LocalConfig`

- [ ] **Step 3: Implementar em `src/lib/storage.ts`**

Modificar `LocalConfig` (adicionar o campo depois de `seiVersionAtLeast4`):

```ts
export interface LocalConfig {
  schemaVersion: 1
  blocoAssinaturaNotificado: NotificadoState
  blocoAssinaturaPendenteAtual: string[]
  ultimaVerificacaoImediata?: string
  processosNovosNotificado: NotificadoState
  processosNovosBadgeCount: number
  baseUrlSei?: string
  seiVersionAtLeast4?: boolean
  atribuicaoSelecionada?: string
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/lib/storage.test.ts`
Expected: PASS (17 testes — 16 já existentes + 1 novo)

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "feat(storage): add atribuicaoSelecionada persisted preference"
```

---

### Task 2: `features/controle-processos/filtroAtribuicao.ts`

**Files:**
- Create: `C:\sei\seirmg\src\features\controle-processos\filtroAtribuicao.ts`
- Test: `C:\sei\seirmg\src\features\controle-processos\filtroAtribuicao.test.ts`

**Contexto**: porte de `C:\sei\seiplus\cs_modules\procedimento_controlar\filtra_processos\filtraPorAtribuicao.js`.

**Interfaces:**
- Consumes: nenhuma
- Produces: `extrairNomesAtribuidos(textos: string[]): string[]`; `linhaCasaAtribuicao(textoAtribuido: string | null, valorSelecionado: string): boolean`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/features/controle-processos/filtroAtribuicao.test.ts
import { describe, expect, it } from 'vitest'
import { extrairNomesAtribuidos, linhaCasaAtribuicao } from './filtroAtribuicao'

describe('extrairNomesAtribuidos', () => {
  it('retorna nomes únicos e ordenados', () => {
    expect(extrairNomesAtribuidos(['Maria', 'João', 'Maria'])).toEqual(['João', 'Maria'])
  })

  it('ignora textos vazios', () => {
    expect(extrairNomesAtribuidos(['Maria', '', '  '])).toEqual(['Maria'])
  })

  it('retorna lista vazia quando não há nomes', () => {
    expect(extrairNomesAtribuidos([])).toEqual([])
  })
})

describe('linhaCasaAtribuicao', () => {
  it('"*" sempre casa', () => {
    expect(linhaCasaAtribuicao('Maria', '*')).toBe(true)
    expect(linhaCasaAtribuicao(null, '*')).toBe(true)
  })

  it('"" casa só quando não há atribuído', () => {
    expect(linhaCasaAtribuicao(null, '')).toBe(true)
    expect(linhaCasaAtribuicao('', '')).toBe(true)
    expect(linhaCasaAtribuicao('Maria', '')).toBe(false)
  })

  it('valor específico casa por texto exato', () => {
    expect(linhaCasaAtribuicao('Maria', 'Maria')).toBe(true)
    expect(linhaCasaAtribuicao('João', 'Maria')).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/features/controle-processos/filtroAtribuicao.test.ts`
Expected: FAIL — `Cannot find module './filtroAtribuicao'`

- [ ] **Step 3: Implementar `src/features/controle-processos/filtroAtribuicao.ts`**

```ts
export function extrairNomesAtribuidos(textos: string[]): string[] {
  const unicos = new Set(textos.map((texto) => texto.trim()).filter((texto) => texto !== ''))
  return Array.from(unicos).sort()
}

export function linhaCasaAtribuicao(textoAtribuido: string | null, valorSelecionado: string): boolean {
  if (valorSelecionado === '*') return true

  const texto = textoAtribuido?.trim() ?? ''
  if (valorSelecionado === '') return texto === ''

  return texto === valorSelecionado
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/features/controle-processos/filtroAtribuicao.test.ts`
Expected: PASS (6 testes)

- [ ] **Step 5: Commit**

```bash
git add src/features/controle-processos/filtroAtribuicao.ts src/features/controle-processos/filtroAtribuicao.test.ts
git commit -m "feat(controle-processos): add atribuição filter predicate helpers"
```

---

### Task 3: `features/controle-processos/filtroBloco.ts`

**Files:**
- Create: `C:\sei\seirmg\src\features\controle-processos\filtroBloco.ts`
- Test: `C:\sei\seirmg\src\features\controle-processos\filtroBloco.test.ts`

**Contexto**: porte de `C:\sei\seiplus\cs_modules\procedimento_controlar\filtra_processos\carregaInformacaoBlocos.js`.

**Interfaces:**
- Consumes: nenhuma
- Produces: `interface BlocoItem { numero: string; href: string; descricao: string }`; `parseListaBlocos(root: ParentNode): BlocoItem[]`; `parseProcessosDoBloco(root: ParentNode): string[]`; `linhaCasaBloco(numeroProcesso: string, numerosDoBloco: string[]): boolean`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/features/controle-processos/filtroBloco.test.ts
import { describe, expect, it } from 'vitest'
import { linhaCasaBloco, parseListaBlocos, parseProcessosDoBloco } from './filtroBloco'

function montarDocumento(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('parseListaBlocos', () => {
  it('extrai número, href e descrição de cada bloco', () => {
    const doc = montarDocumento(`
      <div class="infraAreaTabela">
        <table><tbody>
          <tr class="infraTrClara">
            <td>x</td>
            <td><a href="controlador.php?acao=bloco_visualizar&id=1">123</a></td>
            <td>y</td>
            <td>Descrição do bloco</td>
            <td>z</td>
          </tr>
        </tbody></table>
      </div>
    `)
    expect(parseListaBlocos(doc)).toEqual([
      { numero: '123', href: 'controlador.php?acao=bloco_visualizar&id=1', descricao: 'Descrição do bloco' },
    ])
  })

  it('ignora linhas sem a classe de linha de dados', () => {
    const doc = montarDocumento(`
      <div class="infraAreaTabela">
        <table><tbody>
          <tr class="infraTh"><td>Cabeçalho</td></tr>
        </tbody></table>
      </div>
    `)
    expect(parseListaBlocos(doc)).toEqual([])
  })

  it('retorna lista vazia quando não há tabela', () => {
    expect(parseListaBlocos(montarDocumento('<div></div>'))).toEqual([])
  })
})

describe('parseProcessosDoBloco', () => {
  it('extrai o número de processo da 3ª célula', () => {
    const doc = montarDocumento(`
      <div class="infraAreaTabela">
        <table><tbody>
          <tr class="infraTrEscura">
            <td>x</td>
            <td>y</td>
            <td><a href="#">00001.000001/2026-01</a></td>
          </tr>
        </tbody></table>
      </div>
    `)
    expect(parseProcessosDoBloco(doc)).toEqual(['00001.000001/2026-01'])
  })

  it('retorna lista vazia quando a linha não tem link na 3ª célula', () => {
    const doc = montarDocumento(`
      <div class="infraAreaTabela">
        <table><tbody>
          <tr class="trVermelha"><td>x</td><td>y</td><td>sem link</td></tr>
        </tbody></table>
      </div>
    `)
    expect(parseProcessosDoBloco(doc)).toEqual([])
  })
})

describe('linhaCasaBloco', () => {
  it('casa quando o número está na lista', () => {
    expect(linhaCasaBloco('123', ['123', '456'])).toBe(true)
  })

  it('não casa quando o número não está na lista', () => {
    expect(linhaCasaBloco('789', ['123', '456'])).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/features/controle-processos/filtroBloco.test.ts`
Expected: FAIL — `Cannot find module './filtroBloco'`

- [ ] **Step 3: Implementar `src/features/controle-processos/filtroBloco.ts`**

```ts
export interface BlocoItem {
  numero: string
  href: string
  descricao: string
}

function linhasDeDados(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll('div.infraAreaTabela table > tbody > tr')).filter(
    (linha) =>
      linha.classList.contains('infraTrClara') ||
      linha.classList.contains('infraTrEscura') ||
      linha.classList.contains('trVermelha')
  )
}

export function parseListaBlocos(root: ParentNode): BlocoItem[] {
  return linhasDeDados(root).flatMap((linha) => {
    const celulas = linha.children
    const link = celulas.item(1)?.querySelector('a')
    const celulaDescricao = celulas.item(celulas.length - 2)
    if (!link) return []

    return [
      {
        numero: link.textContent?.trim() ?? '',
        href: link.getAttribute('href') ?? '',
        descricao: celulaDescricao?.textContent?.trim() ?? '',
      },
    ]
  })
}

export function parseProcessosDoBloco(root: ParentNode): string[] {
  return linhasDeDados(root).flatMap((linha) => {
    const link = linha.children.item(2)?.querySelector('a')
    return link?.textContent ? [link.textContent.trim()] : []
  })
}

export function linhaCasaBloco(numeroProcesso: string, numerosDoBloco: string[]): boolean {
  return numerosDoBloco.includes(numeroProcesso)
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/features/controle-processos/filtroBloco.test.ts`
Expected: PASS (7 testes)

- [ ] **Step 5: Commit**

```bash
git add src/features/controle-processos/filtroBloco.ts src/features/controle-processos/filtroBloco.test.ts
git commit -m "feat(controle-processos): add bloco listing/process parsers and match predicate"
```

---

### Task 4: `content-scripts/procedimento_controlar/index.ts` — wiring completo

**Files:**
- Modify: `C:\sei\seirmg\src\content-scripts\procedimento_controlar\index.ts`

**Contexto**: wiring fino, conecta DOM + `fetch` à lógica já testada. Não é coberto por TDD — verificado via build. Reaproveita `linhasDaTabela`/`estadoFiltrosPorTabela`/`aplicarVisibilidade` já existentes (Lote E), sem duplicação.

**Interfaces:**
- Consumes: `extrairNomesAtribuidos`, `linhaCasaAtribuicao` (Task 2); `parseListaBlocos`, `parseProcessosDoBloco`, `linhaCasaBloco` (Task 3); `fetchText` (`../../lib/result`); `createLocalConfigStore` (`../../lib/storage`)

- [ ] **Step 1: Adicionar os imports novos no topo de `src/content-scripts/procedimento_controlar/index.ts`**

Trecho atual (topo do arquivo):

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
```

Substituir por:

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
import { extrairNomesAtribuidos, linhaCasaAtribuicao } from '../../features/controle-processos/filtroAtribuicao'
import {
  linhaCasaBloco,
  parseListaBlocos,
  parseProcessosDoBloco,
} from '../../features/controle-processos/filtroBloco'
import { fetchText } from '../../lib/result'
import { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'
import type { ControleProcessosConfig } from '../../lib/storage'
```

- [ ] **Step 2: Adicionar as duas funções novas antes de `bootstrap()`**

Trecho atual (imediatamente antes de `async function bootstrap()`):

```ts
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
```

Substituir por (adiciona `obterTextoAtribuido`, `montarFiltroAtribuicao` e `montarFiltroBloco` entre `montarConfirmarAntesDeConcluir` e `bootstrap`, sem tocar em `montarConfirmarAntesDeConcluir`):

```ts
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

function obterTextoAtribuido(linha: Element): string | null {
  const link = linha.querySelector('td:nth-child(4) a')
  return link?.textContent?.trim() ?? null
}

async function montarFiltroAtribuicao(): Promise<void> {
  try {
    const divFiltro = document.getElementById('divFiltro')
    if (!divFiltro) return

    const textos = IDS_TABELAS.flatMap((idTabela) =>
      linhasDaTabela(idTabela).map((linha) => obterTextoAtribuido(linha) ?? '')
    )
    const nomes = extrairNomesAtribuidos(textos)

    const select = document.createElement('select')
    select.id = 'seirmg-filtro-atribuicao'
    select.appendChild(new Option('Ver todos os processos', '*'))
    select.appendChild(new Option('Ver processos não atribuídos', ''))
    nomes.forEach((nome) => {
      select.appendChild(new Option(`Ver processos atribuídos à ${nome}`, nome))
    })

    const localConfig = await createLocalConfigStore().get()
    select.value = localConfig.atribuicaoSelecionada ?? '*'

    const aplicar = (valor: string): void => {
      IDS_TABELAS.forEach((idTabela) => {
        const linhas = linhasDaTabela(idTabela)
        let estado = estadoFiltrosPorTabela.get(idTabela) ?? {}

        if (valor === '*') {
          estado = removerFiltro(estado, 'PorAtribuicao')
        } else {
          const resultado: Record<string, boolean> = {}
          linhas.forEach((linha, index) => {
            const id = linha.id || String(index)
            resultado[id] = linhaCasaAtribuicao(obterTextoAtribuido(linha), valor)
          })
          estado = registrarFiltro(estado, 'PorAtribuicao', resultado)
        }

        estadoFiltrosPorTabela.set(idTabela, estado)
        const ids = linhas.map((linha, index) => linha.id || String(index))
        aplicarVisibilidade(idTabela, calcularVisibilidade(estado, ids))
      })
    }

    select.addEventListener('change', () => {
      aplicar(select.value)
      createLocalConfigStore()
        .get()
        .then((atual) => createLocalConfigStore().set({ ...atual, atribuicaoSelecionada: select.value }))
        .catch((error) => {
          console.error('[SEIRMG] Falha ao salvar preferência de filtro por atribuição:', error)
        })
    })

    divFiltro.prepend(select)
    if (select.value !== '*') aplicar(select.value)
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar filtro por atribuição:', error)
  }
}

const PREFIXOS_BLOCO: Record<string, string> = {
  INTERNO: 'bloco_interno_listar',
  ASSINATURA: 'bloco_assinatura_listar',
  REUNIAO: 'bloco_reuniao_listar',
}

function montarFiltroBloco(): void {
  try {
    const divComandos = document.querySelector('#divComandos')
    if (!divComandos) return

    const tipos = [
      { rotulo: 'Blocos Internos', valor: 'INTERNO' },
      { rotulo: 'Blocos de Assinatura', valor: 'ASSINATURA' },
      { rotulo: 'Blocos de Reunião', valor: 'REUNIAO' },
    ].map((tipo) => {
      const link = document.querySelector<HTMLAnchorElement>(
        `a[href^="controlador.php?acao=${PREFIXOS_BLOCO[tipo.valor]}"]`
      )
      return { ...tipo, href: link?.href ?? '' }
    })

    const tiposDisponiveis = tipos.filter((tipo) => tipo.href)
    if (tiposDisponiveis.length === 0) return

    const selectTipo = document.createElement('select')
    selectTipo.id = 'seirmg-filtro-bloco-tipo'
    selectTipo.appendChild(new Option('', ''))
    tiposDisponiveis.forEach((tipo) => selectTipo.appendChild(new Option(tipo.rotulo, tipo.valor)))

    const selectBloco = document.createElement('select')
    selectBloco.id = 'seirmg-filtro-bloco-numero'
    selectBloco.appendChild(new Option('', ''))
    selectBloco.style.display = 'none'

    const aplicarFiltroBloco = (numeros: string[] | null): void => {
      IDS_TABELAS.forEach((idTabela) => {
        const linhas = linhasDaTabela(idTabela)
        let estado = estadoFiltrosPorTabela.get(idTabela) ?? {}

        if (!numeros) {
          estado = removerFiltro(estado, 'PorBloco')
        } else {
          const resultado: Record<string, boolean> = {}
          linhas.forEach((linha, index) => {
            const id = linha.id || String(index)
            const numeroProcesso = linha.querySelector('td:nth-child(3) a')?.textContent?.trim() ?? ''
            resultado[id] = linhaCasaBloco(numeroProcesso, numeros)
          })
          estado = registrarFiltro(estado, 'PorBloco', resultado)
        }

        estadoFiltrosPorTabela.set(idTabela, estado)
        const ids = linhas.map((linha, index) => linha.id || String(index))
        aplicarVisibilidade(idTabela, calcularVisibilidade(estado, ids))
      })
    }

    selectTipo.addEventListener('change', () => {
      selectBloco.innerHTML = ''
      selectBloco.appendChild(new Option('', ''))
      selectBloco.style.display = 'none'
      aplicarFiltroBloco(null)

      const tipoSelecionado = tiposDisponiveis.find((tipo) => tipo.valor === selectTipo.value)
      if (!tipoSelecionado) return

      fetchText(tipoSelecionado.href)
        .then((resultado) => {
          if (!resultado.ok) {
            console.error('[SEIRMG] Falha ao buscar lista de blocos:', resultado.error)
            return
          }

          const doc = new DOMParser().parseFromString(resultado.data, 'text/html')
          parseListaBlocos(doc).forEach((bloco) => {
            selectBloco.appendChild(new Option(`${bloco.numero} - ${bloco.descricao}`, bloco.href))
          })
          selectBloco.style.display = ''
        })
        .catch((error) => {
          console.error('[SEIRMG] Falha ao buscar lista de blocos:', error)
        })
    })

    selectBloco.addEventListener('change', () => {
      if (!selectBloco.value) {
        aplicarFiltroBloco(null)
        return
      }

      fetchText(selectBloco.value)
        .then((resultado) => {
          if (!resultado.ok) {
            console.error('[SEIRMG] Falha ao buscar processos do bloco:', resultado.error)
            return
          }

          const doc = new DOMParser().parseFromString(resultado.data, 'text/html')
          aplicarFiltroBloco(parseProcessosDoBloco(doc))
        })
        .catch((error) => {
          console.error('[SEIRMG] Falha ao buscar processos do bloco:', error)
        })
    })

    divComandos.appendChild(selectTipo)
    divComandos.appendChild(selectBloco)
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar filtro por bloco:', error)
  }
}

async function bootstrap(): Promise<void> {
```

- [ ] **Step 3: Atualizar o corpo de `bootstrap()` para chamar as duas novas etapas**

Trecho atual:

```ts
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

Substituir por:

```ts
async function bootstrap(): Promise<void> {
  try {
    corrigirTabelasNativas()
    montarBuscaRapida()
    montarSelecaoMultipla()
    montarConfirmarAntesDeConcluir()
    montarFiltroBloco()
    await montarFiltroAtribuicao()

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

- [ ] **Step 4: Rodar toda a suíte de testes para confirmar que nada quebrou**

Run: `cd C:\sei\seirmg && bunx vitest run`
Expected: todos os testes continuam passando (182 testes no total — 168 antes deste plano + 1 (Task 1) + 6 (Task 2) + 7 (Task 3) = 182)

- [ ] **Step 5: Rodar o build**

Run: `bun run build`
Expected: sucesso, sem erros de tipo. Se houver erro, rode `bun run typecheck`.

- [ ] **Step 6: Commit**

```bash
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "feat(controle-processos): wire atribuição and bloco filters"
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
Expected: os 4 comandos terminam com código de saída 0.

- [ ] **Step 2: Validar o `manifest.json` gerado e confirmar que as permissões não mudaram**

Run: `node -e "const m = JSON.parse(require('fs').readFileSync('dist/manifest.json', 'utf8')); console.log('manifest.json válido'); console.log(JSON.stringify(m.permissions))"`
Expected: `manifest.json válido` seguido de `["storage","notifications","alarms","tabs"]` — exatamente as mesmas permissões de antes.

---

## Self-Review (checklist do autor do plano)

1. **Cobertura da spec**: `atribuicaoSelecionada` persistido (Task 1), `filtroAtribuicao.ts` (Task 2), `filtroBloco.ts` (Task 3), wiring completo reaproveitando a infraestrutura do Lote E sem duplicação (Task 4). Todas as seções da spec têm task correspondente.
2. **Placeholders**: nenhum "TBD"/"TODO"; todo código de teste e implementação está completo e literal.
3. **Consistência de tipos**: `BlocoItem` (Task 3) usado identicamente pelo wiring (Task 4, `parseListaBlocos(doc).forEach((bloco) => ...)`). `extrairNomesAtribuidos`/`linhaCasaAtribuicao` (Task 2) e `linhaCasaBloco`/`parseProcessosDoBloco` (Task 3) consumidos identicamente pelo wiring. Reaproveita `linhasDaTabela`, `estadoFiltrosPorTabela`, `aplicarVisibilidade`, `registrarFiltro`, `removerFiltro`, `calcularVisibilidade` do Lote E sem modificá-los.
4. **Contagem de testes**: 168 (baseline antes deste plano) + 1 (Task 1) + 6 (Task 2) + 7 (Task 3) = 182 testes esperados ao final da Task 4 em diante.
