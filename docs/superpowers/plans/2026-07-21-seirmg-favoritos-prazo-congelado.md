# SEIRMG — Prazo/marcadores/atribuição congelados em Favoritos fechados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando um processo favoritado fecha na unidade (some das tabelas nativas), o painel "★ Favoritos" continua mostrando o último prazo, marcadores e atribuição vistos, em vez de colapsar a linha pra só o badge "fechado".

**Architecture:** Um campo novo opcional (`ultimoSnapshot`) no `FavoritoProcesso` já persistido guarda o retrato mais recente. A cada renderização do painel, um par de helpers puros e testáveis decide se o retrato de cada favorito precisa ser atualizado (linha nativa ainda presente e diferente do que já está salvo); a montagem da linha do painel (DOM, sem teste automatizado, mesmo padrão do arquivo) escolhe entre dado ao vivo (linha nativa) ou congelado (`ultimoSnapshot`) por processo.

**Tech Stack:** TypeScript, Vitest, `chrome.storage.sync` (via `createSyncConfigStore`), `lucide-static`.

## Global Constraints

- `ultimoSnapshot` NÃO inclui HTML de ícone nem `style` dos marcadores — só o nome de cada um (risco de cota de 8KB por item do `chrome.storage.sync`, que guarda toda a config sob uma única chave).
- "Dias restantes" nunca é persistido — sempre recalculado a partir da data fixa (`prazoDataTexto`) com `calcularDiasAteVencimento`, que já existe e é testado.
- `calcularDiasAteVencimento` usa a convenção "1 = vence hoje" (não "0 = vence hoje") — `formatarDiasRestantes` tem que respeitar essa mesma convenção.
- Sem migração de dados: `ultimoSnapshot` é opcional, favoritos antigos simplesmente não têm até a próxima vez que aparecerem numa linha nativa aberta.
- DOM construído via `document.createElement`/`.append()` (convenção já usada no arquivo), ícones via `lucide-static/icons/*.svg?raw`.

Spec completa: `docs/superpowers/specs/2026-07-21-seirmg-favoritos-prazo-congelado-design.md`

---

### Task 1: Tipo `SnapshotFavorito` + campo `ultimoSnapshot`

**Files:**
- Modify: `src/lib/storage.ts:66-71`

**Interfaces:**
- Produces: `export interface SnapshotFavorito { prazoDataTexto: string | null; atribuicao: string | null; marcadoresNomes: string[] }`, campo `ultimoSnapshot?: SnapshotFavorito` em `FavoritoProcesso` — usados pelas Tasks 2, 3 e 4.

- [ ] **Step 1: Adicionar o tipo e o campo**

Em `src/lib/storage.ts`, substituir (linhas 66-71):

```ts
export interface FavoritoProcesso {
  numero: string
  link: string | null
  adicionadoEm: string
  especificacao?: string
}
```

por:

```ts
export interface SnapshotFavorito {
  prazoDataTexto: string | null
  atribuicao: string | null
  marcadoresNomes: string[]
}

export interface FavoritoProcesso {
  numero: string
  link: string | null
  adicionadoEm: string
  especificacao?: string
  ultimoSnapshot?: SnapshotFavorito
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: sem erros (campo é opcional, nenhum código existente quebra).

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage.ts
git commit -m "feat: adiciona campo ultimoSnapshot ao FavoritoProcesso"
```

---

### Task 2: `formatarDiasRestantes`

**Files:**
- Modify: `src/features/controle-processos/prazos.ts` (adicionar ao final do arquivo)
- Test: `src/features/controle-processos/prazos.test.ts`

**Interfaces:**
- Produces: `formatarDiasRestantes(dias: number): string` — usada pela Task 4.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `src/features/controle-processos/prazos.test.ts`:

```ts
describe('formatarDiasRestantes', () => {
  it('mostra "Vence hoje" quando dias é 1 (convenção de calcularDiasAteVencimento)', () => {
    expect(formatarDiasRestantes(1)).toBe('Vence hoje')
  })

  it('mostra "Vence em 1 dia" no singular', () => {
    expect(formatarDiasRestantes(2)).toBe('Vence em 1 dia')
  })

  it('mostra "Vence em N dias" no plural', () => {
    expect(formatarDiasRestantes(11)).toBe('Vence em 10 dias')
  })

  it('mostra "Venceu há 1 dia" no singular quando dias é 0', () => {
    expect(formatarDiasRestantes(0)).toBe('Venceu há 1 dia')
  })

  it('mostra "Venceu há N dias" no plural quando bem negativo', () => {
    expect(formatarDiasRestantes(-8)).toBe('Venceu há 9 dias')
  })
})
```

E adicionar `formatarDiasRestantes` ao import existente no topo do arquivo:

```ts
import { calcularDiasAteVencimento, classificarPrazo, extrairTextoMarcador, formatarDataBr, formatarDiasRestantes, isValidDate } from './prazos'
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bun run test`
Expected: FAIL — `formatarDiasRestantes` não exportado por `./prazos`.

- [ ] **Step 3: Implementar a função**

Adicionar ao final de `src/features/controle-processos/prazos.ts`:

```ts

export function formatarDiasRestantes(dias: number): string {
  if (dias === 1) return 'Vence hoje'
  if (dias > 1) {
    const restantes = dias - 1
    return `Vence em ${restantes} dia${restantes === 1 ? '' : 's'}`
  }
  const diasAtraso = 1 - dias
  return `Venceu há ${diasAtraso} dia${diasAtraso === 1 ? '' : 's'}`
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bun run test`
Expected: PASS (todos os testes do arquivo, incluindo os novos).

- [ ] **Step 5: Commit**

```bash
git add src/features/controle-processos/prazos.ts src/features/controle-processos/prazos.test.ts
git commit -m "feat: formatarDiasRestantes pro prazo congelado de favoritos fechados"
```

---

### Task 3: `snapshotsIguais` + `atualizarSnapshotsFavoritos`

**Files:**
- Modify: `src/features/controle-processos/favoritos.ts` (adicionar ao final do arquivo)
- Test: `src/features/controle-processos/favoritos.test.ts`

**Interfaces:**
- Consumes: `SnapshotFavorito`, `FavoritoProcesso` (Task 1, `../../lib/storage`).
- Produces: `snapshotsIguais(a: SnapshotFavorito | undefined, b: SnapshotFavorito): boolean`, `atualizarSnapshotsFavoritos(itens: FavoritoProcesso[], snapshotsPorNumero: Map<string, SnapshotFavorito>): { itens: FavoritoProcesso[]; mudou: boolean }` — usadas pela Task 4.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `src/features/controle-processos/favoritos.test.ts`:

```ts
describe('snapshotsIguais', () => {
  const base: SnapshotFavorito = { prazoDataTexto: '15/08/2026', atribuicao: 'joao.silva', marcadoresNomes: ['Urgente'] }

  it('retorna false quando o atual é undefined (força a primeira gravação)', () => {
    expect(snapshotsIguais(undefined, base)).toBe(false)
  })

  it('retorna true quando os dois são idênticos', () => {
    expect(snapshotsIguais(base, { ...base })).toBe(true)
  })

  it('retorna false quando prazoDataTexto difere', () => {
    expect(snapshotsIguais(base, { ...base, prazoDataTexto: '20/08/2026' })).toBe(false)
  })

  it('retorna false quando atribuicao difere', () => {
    expect(snapshotsIguais(base, { ...base, atribuicao: 'maria.souza' })).toBe(false)
  })

  it('retorna false quando marcadoresNomes difere em conteúdo', () => {
    expect(snapshotsIguais(base, { ...base, marcadoresNomes: ['Concluído'] })).toBe(false)
  })

  it('retorna false quando marcadoresNomes difere em quantidade', () => {
    expect(snapshotsIguais(base, { ...base, marcadoresNomes: ['Urgente', 'Concluído'] })).toBe(false)
  })
})

describe('atualizarSnapshotsFavoritos', () => {
  const item = (numero: string, ultimoSnapshot?: SnapshotFavorito): FavoritoProcesso => ({
    numero,
    link: null,
    adicionadoEm: '2026-07-01T10:00:00.000Z',
    ultimoSnapshot,
  })

  it('não muda item sem entrada correspondente no mapa', () => {
    const itens = [item('HMMG.1')]
    const resultado = atualizarSnapshotsFavoritos(itens, new Map())
    expect(resultado.mudou).toBe(false)
    expect(resultado.itens).toEqual(itens)
  })

  it('atualiza item cujo snapshot no mapa difere do atual', () => {
    const novoSnapshot: SnapshotFavorito = { prazoDataTexto: '15/08/2026', atribuicao: 'joao.silva', marcadoresNomes: [] }
    const itens = [item('HMMG.1')]
    const resultado = atualizarSnapshotsFavoritos(itens, new Map([['HMMG.1', novoSnapshot]]))
    expect(resultado.mudou).toBe(true)
    expect(resultado.itens[0].ultimoSnapshot).toEqual(novoSnapshot)
  })

  it('não marca mudou quando o snapshot no mapa é igual ao já salvo', () => {
    const snapshot: SnapshotFavorito = { prazoDataTexto: '15/08/2026', atribuicao: 'joao.silva', marcadoresNomes: [] }
    const itens = [item('HMMG.1', snapshot)]
    const resultado = atualizarSnapshotsFavoritos(itens, new Map([['HMMG.1', { ...snapshot }]]))
    expect(resultado.mudou).toBe(false)
    expect(resultado.itens).toEqual(itens)
  })

  it('trata uma lista com mistura de itens que mudam e não mudam', () => {
    const snapshotIgual: SnapshotFavorito = { prazoDataTexto: '01/01/2026', atribuicao: null, marcadoresNomes: [] }
    const snapshotNovo: SnapshotFavorito = { prazoDataTexto: '20/08/2026', atribuicao: 'carlos.lima', marcadoresNomes: ['Urgente'] }
    const itens = [item('HMMG.1', snapshotIgual), item('HMMG.2'), item('HMMG.3')]
    const mapa = new Map([
      ['HMMG.1', { ...snapshotIgual }],
      ['HMMG.2', snapshotNovo],
    ])
    const resultado = atualizarSnapshotsFavoritos(itens, mapa)
    expect(resultado.mudou).toBe(true)
    expect(resultado.itens[0].ultimoSnapshot).toEqual(snapshotIgual)
    expect(resultado.itens[1].ultimoSnapshot).toEqual(snapshotNovo)
    expect(resultado.itens[2].ultimoSnapshot).toBeUndefined()
  })
})
```

E adicionar `SnapshotFavorito` ao import de tipo existente no topo do arquivo:

```ts
import type { FavoritoProcesso, SnapshotFavorito } from '../../lib/storage'
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bun run test`
Expected: FAIL — `snapshotsIguais`/`atualizarSnapshotsFavoritos` não exportados por `./favoritos`.

- [ ] **Step 3: Implementar as funções**

Adicionar ao final de `src/features/controle-processos/favoritos.ts`:

```ts

export function snapshotsIguais(a: SnapshotFavorito | undefined, b: SnapshotFavorito): boolean {
  if (!a) return false
  return (
    a.prazoDataTexto === b.prazoDataTexto &&
    a.atribuicao === b.atribuicao &&
    a.marcadoresNomes.length === b.marcadoresNomes.length &&
    a.marcadoresNomes.every((nome, indice) => nome === b.marcadoresNomes[indice])
  )
}

export function atualizarSnapshotsFavoritos(
  itens: FavoritoProcesso[],
  snapshotsPorNumero: Map<string, SnapshotFavorito>
): { itens: FavoritoProcesso[]; mudou: boolean } {
  let mudou = false
  const novosItens = itens.map((item) => {
    const snapshotNovo = snapshotsPorNumero.get(item.numero)
    if (!snapshotNovo || snapshotsIguais(item.ultimoSnapshot, snapshotNovo)) return item
    mudou = true
    return { ...item, ultimoSnapshot: snapshotNovo }
  })
  return { itens: novosItens, mudou }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bun run test`
Expected: PASS (todos os testes do arquivo, incluindo os novos).

- [ ] **Step 5: Commit**

```bash
git add src/features/controle-processos/favoritos.ts src/features/controle-processos/favoritos.test.ts
git commit -m "feat: helpers puros pra atualizar snapshot congelado de favoritos"
```

---

### Task 4: Wiring no painel de Favoritos (`procedimento_controlar/index.ts`)

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/index.ts`

**Interfaces:**
- Consumes: `formatarDiasRestantes` (Task 2, `../../features/controle-processos/prazos`); `snapshotsIguais`, `atualizarSnapshotsFavoritos` (Task 3, `../../features/controle-processos/favoritos`); `SnapshotFavorito` (Task 1, `../../lib/storage`); ícone `lucide-static/icons/clock.svg?raw`.
- Produces: nenhuma outra parte do código importa deste arquivo (content script raiz).

- [ ] **Step 1: Importar os novos símbolos**

No topo de `src/content-scripts/procedimento_controlar/index.ts`, adicionar ao import de `../../features/controle-processos/prazos` (linha 1-5):

```ts
import {
  calcularDiasAteVencimento,
  classificarPrazo,
  extrairTextoMarcador,
  formatarDiasRestantes,
} from '../../features/controle-processos/prazos'
```

Adicionar ao import de `../../features/controle-processos/favoritos` (linha 69-73):

```ts
import {
  extrairFavoritoDaLinha,
  calcularOcultacaoPorFavorito,
  ordenarFavoritosPorData,
  atualizarSnapshotsFavoritos,
} from '../../features/controle-processos/favoritos'
```

Adicionar ao import de tipo (linha 74):

```ts
import type { FavoritoProcesso, SnapshotFavorito } from '../../lib/storage'
```

Adicionar novo import de ícone, junto aos outros ícones lucide (perto da linha 80):

```ts
import clockIconSvg from 'lucide-static/icons/clock.svg?raw'
```

- [ ] **Step 2: Adicionar `capturarSnapshotDaLinha` e `construirSnapshotsPorNumero`**

Adicionar logo depois da função `obterControleDePrazoDaLinha` (que termina na linha 780, antes de `obterEspecificacaoDaLinha`):

```ts
function capturarSnapshotDaLinha(linhaNativa: Element): SnapshotFavorito {
  const prazo = obterControleDePrazoDaLinha(linhaNativa)
  return {
    prazoDataTexto: prazo?.dataTexto ?? null,
    atribuicao: obterTextoAtribuido(linhaNativa),
    marcadoresNomes: obterMarcadoresDaLinha(linhaNativa).map((marcador) => marcador.nome),
  }
}

function construirSnapshotsPorNumero(
  itens: FavoritoProcesso[],
  linhasAbertas: Map<string, Element>
): Map<string, SnapshotFavorito> {
  const mapa = new Map<string, SnapshotFavorito>()
  itens.forEach((item) => {
    const linhaNativa = linhasAbertas.get(item.numero)
    if (linhaNativa) mapa.set(item.numero, capturarSnapshotDaLinha(linhaNativa))
  })
  return mapa
}
```

`obterTextoAtribuido` (linha 1548) já existe mais abaixo no arquivo — como é uma `function` declarada no
mesmo escopo de módulo, o *hoisting* do JavaScript já garante que ela pode ser chamada aqui em cima sem
problema (o arquivo já faz isso em outros pontos, ex. `montarCelulaAtribuicao` também chama `obterTextoAtribuido`
antes de sua declaração de linha).

- [ ] **Step 3: Adicionar `persistirFavoritosAtualizados`**

Adicionar logo depois de `alternarFavorito` (que termina na linha 1126, antes da seção de ordenação):

```ts
function persistirFavoritosAtualizados(): void {
  createSyncConfigStore()
    .get()
    .then((atual) =>
      createSyncConfigStore().set({
        ...atual,
        controleProcessos: {
          ...atual.controleProcessos,
          favoritos: { ...atual.controleProcessos.favoritos, itens: itensFavoritados },
        },
      })
    )
    .catch((error) => {
      console.error('[SEIRMG] Falha ao persistir snapshot de favoritos:', error)
    })
}
```

- [ ] **Step 4: Refatorar `montarCelulaAtribuicao` pra receber texto em vez de elemento**

Substituir (linhas 992-1003):

```ts
function montarCelulaAtribuicao(linhaNativa: Element): HTMLTableCellElement {
  const td = document.createElement('td')
  const atribuicao = obterTextoAtribuido(linhaNativa)
  if (!atribuicao) {
    td.className = 'seirmg-favoritos-vazio'
    td.textContent = '—'
    return td
  }
  td.appendChild(criarIcone(userIconSvg))
  td.appendChild(document.createTextNode(atribuicao))
  return td
}
```

por:

```ts
function montarCelulaAtribuicao(atribuicao: string | null): HTMLTableCellElement {
  const td = document.createElement('td')
  if (!atribuicao) {
    td.className = 'seirmg-favoritos-vazio'
    td.textContent = '—'
    return td
  }
  td.appendChild(criarIcone(userIconSvg))
  td.appendChild(document.createTextNode(atribuicao))
  return td
}
```

- [ ] **Step 5: Adicionar `montarCelulaMarcadoresCongelados` e `montarCelulaPrazoCongelado`**

Adicionar logo depois de `montarCelulaPrazo` (que termina na linha 990, antes da função `montarCelulaAtribuicao`
já refatorada no Step 4):

```ts
function montarCelulaMarcadoresCongelados(nomes: string[]): HTMLTableCellElement {
  const td = document.createElement('td')
  if (nomes.length === 0) {
    td.className = 'seirmg-favoritos-vazio'
    td.textContent = '—'
    return td
  }
  nomes.forEach((nome) => {
    const pill = document.createElement('span')
    pill.className = 'seirmg-favoritos-marcador'
    pill.appendChild(criarIcone(flagIconSvg))
    pill.appendChild(document.createTextNode(nome))
    td.appendChild(pill)
  })
  return td
}

function montarCelulaPrazoCongelado(prazoDataTexto: string | null): HTMLTableCellElement {
  const td = document.createElement('td')
  if (!prazoDataTexto) {
    td.className = 'seirmg-favoritos-vazio'
    td.textContent = '—'
    return td
  }

  const linhaData = document.createElement('div')
  linhaData.className = 'seirmg-favoritos-prazo'
  linhaData.appendChild(criarIcone(clockIconSvg))
  linhaData.appendChild(document.createTextNode(prazoDataTexto))
  td.appendChild(linhaData)

  const dias = calcularDiasAteVencimento(prazoDataTexto, new Date())
  const linhaDias = document.createElement('div')
  linhaDias.className = 'seirmg-favoritos-prazo-data'
  linhaDias.textContent = dias === null ? '' : formatarDiasRestantes(dias)
  td.appendChild(linhaDias)

  return td
}
```

- [ ] **Step 6: Reescrever `montarLinhaPainelFavoritos`**

Substituir (linhas 1021-1039):

```ts
function montarLinhaPainelFavoritos(item: FavoritoProcesso, linhaNativa: Element | undefined): HTMLTableRowElement {
  const tr = document.createElement('tr')
  const especificacao = linhaNativa ? (obterEspecificacaoDaLinha(linhaNativa) ?? item.especificacao) : item.especificacao

  if (!linhaNativa) {
    const tdFechado = montarCelulaProcesso(item, false, especificacao)
    tdFechado.colSpan = 4
    tr.appendChild(tdFechado)
    tr.appendChild(montarCelulaRemover(item))
    return tr
  }

  tr.appendChild(montarCelulaProcesso(item, true, especificacao))
  tr.appendChild(montarCelulaMarcadores(linhaNativa))
  tr.appendChild(montarCelulaPrazo(linhaNativa))
  tr.appendChild(montarCelulaAtribuicao(linhaNativa))
  tr.appendChild(montarCelulaRemover(item))
  return tr
}
```

por:

```ts
function montarLinhaPainelFavoritos(item: FavoritoProcesso, linhaNativa: Element | undefined): HTMLTableRowElement {
  const tr = document.createElement('tr')
  const especificacao = linhaNativa ? (obterEspecificacaoDaLinha(linhaNativa) ?? item.especificacao) : item.especificacao

  tr.appendChild(montarCelulaProcesso(item, !!linhaNativa, especificacao))

  if (linhaNativa) {
    tr.appendChild(montarCelulaMarcadores(linhaNativa))
    tr.appendChild(montarCelulaPrazo(linhaNativa))
    tr.appendChild(montarCelulaAtribuicao(obterTextoAtribuido(linhaNativa)))
  } else {
    tr.appendChild(montarCelulaMarcadoresCongelados(item.ultimoSnapshot?.marcadoresNomes ?? []))
    tr.appendChild(montarCelulaPrazoCongelado(item.ultimoSnapshot?.prazoDataTexto ?? null))
    tr.appendChild(montarCelulaAtribuicao(item.ultimoSnapshot?.atribuicao ?? null))
  }

  tr.appendChild(montarCelulaRemover(item))
  return tr
}
```

- [ ] **Step 7: Atualizar `renderizarPainelFavoritos` pra capturar e persistir o snapshot**

Em `renderizarPainelFavoritos`, logo depois de `const linhasAbertas = mapaLinhasAbertasNaPagina()` (linha 1084)
e antes de `ordenarFavoritosPorData(itensFavoritados).forEach(...)` (linha 1085), inserir:

```ts
    const snapshotsPorNumero = construirSnapshotsPorNumero(itensFavoritados, linhasAbertas)
    const resultadoSnapshot = atualizarSnapshotsFavoritos(itensFavoritados, snapshotsPorNumero)
    itensFavoritados = resultadoSnapshot.itens
    if (resultadoSnapshot.mudou) persistirFavoritosAtualizados()
```

Trecho completo da função depois da mudança (pra conferência — de "const linhasAbertas" até o fechamento do
`try`):

```ts
    const linhasAbertas = mapaLinhasAbertasNaPagina()
    const snapshotsPorNumero = construirSnapshotsPorNumero(itensFavoritados, linhasAbertas)
    const resultadoSnapshot = atualizarSnapshotsFavoritos(itensFavoritados, snapshotsPorNumero)
    itensFavoritados = resultadoSnapshot.itens
    if (resultadoSnapshot.mudou) persistirFavoritosAtualizados()

    ordenarFavoritosPorData(itensFavoritados).forEach((item) => {
      tbody.appendChild(montarLinhaPainelFavoritos(item, linhasAbertas.get(item.numero)))
    })
    tabela.appendChild(tbody)
    painel.appendChild(tabela)

    if (referencia.comoFilho) {
      referencia.elemento.appendChild(painel)
    } else {
      referencia.elemento.insertAdjacentElement('afterend', painel)
    }
  } catch (error) {
    console.error('[SEIRMG] Falha ao renderizar painel de favoritos:', error)
  }
}
```

- [ ] **Step 8: Typecheck**

Run: `bun run typecheck`
Expected: sem erros.

- [ ] **Step 9: Rodar a suíte de testes completa**

Run: `bun run test`
Expected: PASS (inclui os testes das Tasks 2 e 3).

- [ ] **Step 10: Build**

Run: `bun run build`
Expected: build termina sem erro.

- [ ] **Step 11: Commit**

```bash
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "feat: painel de Favoritos mostra prazo/marcadores/atribuição congelados quando o processo fecha"
```

- [ ] **Step 12: Validação manual numa instância SEI real**

Carregar a extensão atualizada (`bun run build` + recarregar em `chrome://extensions`) e verificar, numa página
de Controle de Processos com o painel de Favoritos ativo:

1. Favoritar um processo aberto que tenha prazo, marcador e atribuição definidos → confirmar que o painel
   mostra os três normalmente (comportamento ao vivo, sem mudança).
2. Recarregar a página com esse processo ainda aberto → confirmar que nada muda visualmente (o snapshot é
   atualizado em segundo plano, sem afetar a exibição ao vivo).
3. Fechar esse processo na unidade (ou favoritar um processo que já esteja fechado, se disponível) e recarregar
   a página do Controle de Processos → confirmar que a linha do painel continua mostrando prazo (com "Vence em N
   dias" ou "Venceu há N dias" coerente com a data de hoje), marcador (com ícone de bandeira genérico) e
   atribuição, em vez de colapsar pra só "fechado".
4. Conferir num favorito antigo (favoritado antes desta atualização, sem `ultimoSnapshot`) que ele mostra "—"
   nas três colunas até a próxima vez em que aparecer aberto — sem quebrar o painel.

---

## Self-Review

**Cobertura da spec:** tipo `SnapshotFavorito` + campo opcional sem migração (Task 1), `formatarDiasRestantes`
respeitando a convenção "1 = hoje" de `calcularDiasAteVencimento` (Task 2), `snapshotsIguais`/
`atualizarSnapshotsFavoritos` puros e testados (Task 3), captura oportunista a cada render + persistência
fire-and-forget + marcadores congelados sem ícone/cor original (ícone genérico `flag`) + prazo recalculado
dinamicamente com ícone `clock` genérico + `montarLinhaPainelFavoritos` sem mais colapsar em `colSpan=4` (Task
4) — toda a spec de 2026-07-21 está coberta.

**Placeholders:** nenhum "TBD"/"implementar depois" — todos os steps têm código completo.

**Consistência de tipos:** `SnapshotFavorito` (Task 1) usado identicamente em `capturarSnapshotDaLinha`,
`construirSnapshotsPorNumero`, `snapshotsIguais` e `atualizarSnapshotsFavoritos` (mesmos três campos:
`prazoDataTexto`, `atribuicao`, `marcadoresNomes`); assinatura de `montarCelulaAtribuicao` (agora
`(atribuicao: string | null)`) consistente nos dois pontos de chamada (ao vivo e congelado) dentro de
`montarLinhaPainelFavoritos`; `itensFavoritados` (variável de módulo já existente) reatribuída de forma
consistente em `renderizarPainelFavoritos` (mesmo padrão já usado em `alternarFavorito`).
