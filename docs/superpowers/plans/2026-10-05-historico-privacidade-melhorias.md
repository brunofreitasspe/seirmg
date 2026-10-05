# Histórico de Processos Visitados — Privacidade e Melhorias Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir o histórico de processos visitados (hoje captura processos sigilosos sem filtro) e evoluí-lo com janela/limite configuráveis, busca, exibição dentro do próprio SEI (não só no popup) e atalho pra favoritar direto da lista.

**Architecture:** Toda decisão (o que capturar, o que podar, o que filtrar, o que vira favorito) vira função pura testável em `features/procedimento-visualizar/historico.ts` e `features/controle-processos/favoritos.ts`. Os arquivos de orquestração (`content-scripts/procedimento_visualizar/index.ts`, `popup/main.ts`) só chamam essas funções e tocam `chrome.storage` — seguindo o padrão já estabelecido no resto do repo (ex.: `background/tarefasPipeline.ts` chama `features/tarefas/diffVencidas.ts`).

**Tech Stack:** TypeScript, Vitest, `chrome.storage.sync`/`local` via `lib/storage.ts`.

**Spec:** Não há spec prévia — este plano nasceu de uma comparação ad-hoc entre o seirmg e o SEI Pro novo (`C:\sei\seipro\sei-pro\historico\`), feita nesta conversa. Os requisitos abaixo são a spec.

## Global Constraints

- Toda nova função de decisão (captura, poda, filtro, conversão pra favorito) é pura (sem DOM, sem `chrome.*`) e vive em `features/*.ts`, com teste em Vitest no arquivo `*.test.ts` ao lado.
- Nenhuma mudança introduz `chrome.alarms` nem fetch autônomo em segundo plano — o histórico só é escrito como efeito colateral de uma navegação real (`procedimento_visualizar`), igual já funciona hoje.
- Campos novos em `SyncConfig`/`LocalConfig` (`lib/storage.ts`) sempre leem com fallback (`config.x?.campo ?? padrão`) nos pontos de uso, nunca assumem presença — backups antigos restaurados fazem *replace* raso de cada objeto aninhado (`aplicarBackupRestaurado` em `features/backup/backup.ts`), então um backup salvo antes deste plano não vai ter os campos novos.
- Mensagens de erro/log seguem o padrão `console.error('[SEIRMG] Falha ao <ação>:', error)` já usado em todo o repo.
- `bun run test`, `bun run typecheck` e `bun run lint` precisam passar a cada tarefa antes do commit.

---

## File Structure

- Modify: `src/features/procedimento-visualizar/historico.ts` — ganha `ehNivelAcessoCapturavel`, `podarPorJanela`, `filtrarHistoricoPorTexto`, `prepararListaRecentes`, `historicoEntryParaFavorito`.
- Modify: `src/features/procedimento-visualizar/historico.test.ts` — testes das funções acima.
- Modify: `src/features/controle-processos/favoritos.ts` — ganha `adicionarFavoritoSeNovo` (reusada também no Plano de Favoritos Avançados).
- Modify: `src/features/controle-processos/favoritos.test.ts` — teste da função acima.
- Modify: `src/lib/storage.ts` — `HistoricoProcessosConfig` ganha `limiteItens`/`janelaDias`.
- Modify: `src/content-scripts/procedimento_visualizar/index.ts` — aplica o gate de privacidade, lê os novos campos de config, renderiza a seção "Visitados recentemente" dentro do SEI.
- Modify: `src/popup/index.html` / `src/popup/main.ts` — campo de busca e botão de favoritar na lista do popup.
- Modify: `src/options/index.html` / `src/options/main.ts` — inputs de limite/janela na aba Processos.

---

### Task 1: Privacidade — não capturar processos sigilosos

**Files:**
- Modify: `src/features/procedimento-visualizar/historico.ts`
- Modify: `src/features/procedimento-visualizar/historico.test.ts`
- Modify: `src/content-scripts/procedimento_visualizar/index.ts:110-127,572-609`

**Interfaces:**
- Consumes: `NivelAcessoExtraido` (já existe em `features/procedimento-visualizar/painelLateral.ts:99-102`, já importado em `content-scripts/procedimento_visualizar/index.ts:24`)
- Produces: `ehNivelAcessoCapturavel(nivel: NivelAcessoExtraido['nivel']): boolean`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao fim de `src/features/procedimento-visualizar/historico.test.ts`:

```typescript
import { ehNivelAcessoCapturavel } from './historico'

describe('ehNivelAcessoCapturavel', () => {
  it('permite capturar processo Público ou Restrito', () => {
    expect(ehNivelAcessoCapturavel('Público')).toBe(true)
    expect(ehNivelAcessoCapturavel('Restrito')).toBe(true)
  })

  it('bloqueia processo Sigiloso', () => {
    expect(ehNivelAcessoCapturavel('Sigiloso')).toBe(false)
  })

  it('bloqueia nível desconhecido (não há garantia de que é público)', () => {
    expect(ehNivelAcessoCapturavel('')).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test historico.test.ts`
Expected: FAIL — `ehNivelAcessoCapturavel is not exported` / `is not a function`

- [ ] **Step 3: Implementar**

Adicionar em `src/features/procedimento-visualizar/historico.ts` (junto ao import de tipos no topo):

```typescript
import type { NivelAcessoExtraido } from './painelLateral'

// Processos sigilosos não entram no histórico: evita que o popup ou o painel lateral
// (Tarefa 4 deste plano) revelem número/tipo de um processo sigiloso pra quem olhar por
// cima do ombro. Nível desconhecido ('', falha de parse da página) também é bloqueado —
// nesse caso não há garantia de que o processo é público.
export function ehNivelAcessoCapturavel(nivel: NivelAcessoExtraido['nivel']): boolean {
  return nivel === 'Público' || nivel === 'Restrito'
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test historico.test.ts`
Expected: PASS

- [ ] **Step 5: Aplicar o gate na orquestração (sem teste — `content-scripts/*/index.ts` não tem suíte própria neste repo; a decisão já está coberta pelo teste puro do Step 1)**

Em `src/content-scripts/procedimento_visualizar/index.ts`, importar `ehNivelAcessoCapturavel` de `../../features/procedimento-visualizar/historico` (já importa `registrarProcessoVisitado` de lá, linha 28 — acrescentar ao mesmo import).

Mudar a assinatura e o corpo de `registrarHistoricoVisita` (linhas 110-127):

```typescript
async function registrarHistoricoVisita(
  numero: string | null,
  tipo: string,
  nivelAcesso: NivelAcessoExtraido['nivel']
): Promise<void> {
  const idProcedimento = obterIdProcedimento()
  if (!idProcedimento || !numero) return
  if (!ehNivelAcessoCapturavel(nivelAcesso)) return

  const syncConfig = await createSyncConfigStore().get()
  if (!syncConfig.historicoProcessos?.ativo) return

  const localStore = createLocalConfigStore()
  const localConfig = await localStore.get()
  const novo: HistoricoProcessoEntry = {
    idProcedimento,
    numero,
    tipo,
    acessadoEm: new Date().toISOString(),
  }
  const historico = registrarProcessoVisitado(localConfig.historicoProcessosVisitados ?? [], novo)
  await localStore.set({ ...localConfig, historicoProcessosVisitados: historico })
}
```

Em `montarPainelTipoEInteressados` (linhas 572-609), mover `extrairNivelAcesso(doc)` pra antes da chamada de `registrarHistoricoVisita` e passar o nível pra ela, reaproveitando o mesmo resultado na renderização (evita computar duas vezes):

```typescript
  const tipo = extrairTipoProcesso(doc)
  const nivelAcesso = extrairNivelAcesso(doc)

  const { secao: secaoTipo, corpo: divTipo } = criarSecao('Tipo do processo', briefcaseIconSvg)
  divTipo.id = 'seirmg-tipo-processo'
  const pTipo = document.createElement('p')
  pTipo.className = 'seirmg-tipo-processo-texto'
  pTipo.textContent = tipo
  divTipo.appendChild(pTipo)
  container.appendChild(secaoTipo)

  const historicoVisitaFeito = registrarHistoricoVisita(numero, tipo, nivelAcesso.nivel).catch((error) => {
    console.error('[SEIRMG] Falha ao registrar processo no histórico:', error)
  })

  renderizarNivelAcesso(container, nivelAcesso)
```

(A linha antiga `renderizarNivelAcesso(container, extrairNivelAcesso(doc))` sai; o resto da função continua igual.)

- [ ] **Step 6: Verificar tipos e lint**

Run: `bun run typecheck && bun run lint`
Expected: sem erros

- [ ] **Step 7: Commit**

```bash
git add src/features/procedimento-visualizar/historico.ts src/features/procedimento-visualizar/historico.test.ts src/content-scripts/procedimento_visualizar/index.ts
git commit -m "fix(historico): não capturar processo sigiloso no histórico de visitados"
```

---

### Task 2: Limite de itens e janela de dias configuráveis

**Files:**
- Modify: `src/lib/storage.ts:129-131,383-385`
- Modify: `src/features/procedimento-visualizar/historico.ts`
- Modify: `src/features/procedimento-visualizar/historico.test.ts`
- Modify: `src/content-scripts/procedimento_visualizar/index.ts`
- Modify: `src/options/index.html:174-178`
- Modify: `src/options/main.ts:279,376-378`

**Interfaces:**
- Consumes: `registrarProcessoVisitado(historicoAtual, novo, limite?)` (já existe, Task 1 não muda)
- Produces: `podarPorJanela(historico: HistoricoProcessoEntry[], agoraIso: string, janelaDias: number): HistoricoProcessoEntry[]`
- Produces (storage): `HistoricoProcessosConfig { ativo: boolean; limiteItens: number; janelaDias: number }`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar em `src/features/procedimento-visualizar/historico.test.ts`:

```typescript
import { podarPorJanela } from './historico'

describe('podarPorJanela', () => {
  const agora = '2026-07-20T10:00:00.000Z'

  function entrada(id: string, acessadoEm: string): HistoricoProcessoEntry {
    return { idProcedimento: id, numero: id, tipo: 'Ofício', acessadoEm }
  }

  it('remove entradas mais antigas que a janela', () => {
    const historico = [
      entrada('1', '2026-07-20T09:00:00.000Z'), // hoje
      entrada('2', '2026-07-10T09:00:00.000Z'), // 10 dias atrás
    ]
    expect(podarPorJanela(historico, agora, 7)).toEqual([historico[0]])
  })

  it('janelaDias <= 0 desativa a poda por tempo', () => {
    const historico = [entrada('1', '2020-01-01T00:00:00.000Z')]
    expect(podarPorJanela(historico, agora, 0)).toEqual(historico)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test historico.test.ts`
Expected: FAIL — `podarPorJanela is not a function`

- [ ] **Step 3: Implementar**

```typescript
const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000

export function podarPorJanela(
  historico: HistoricoProcessoEntry[],
  agoraIso: string,
  janelaDias: number
): HistoricoProcessoEntry[] {
  if (janelaDias <= 0) return historico
  const limiteMs = new Date(agoraIso).getTime() - janelaDias * MILISSEGUNDOS_POR_DIA
  return historico.filter((item) => new Date(item.acessadoEm).getTime() >= limiteMs)
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test historico.test.ts`
Expected: PASS

- [ ] **Step 5: Estender o storage**

Em `src/lib/storage.ts`, trocar (linha 129-131):

```typescript
export interface HistoricoProcessosConfig {
  ativo: boolean
}
```

por:

```typescript
export interface HistoricoProcessosConfig {
  ativo: boolean
  // 0 = sem limite de quantidade.
  limiteItens: number
  // Entradas mais antigas que essa janela são podadas a cada nova visita. 0 = sem janela.
  janelaDias: number
}
```

E o default (linha 383-385):

```typescript
  historicoProcessos: {
    ativo: false,
    limiteItens: 50,
    janelaDias: 7,
  },
```

- [ ] **Step 6: Rodar typecheck pra achar todos os pontos que quebraram**

Run: `bun run typecheck`
Expected: nenhum erro — `HistoricoProcessosConfig` só é construída em `DEFAULT_SYNC_CONFIG` (Step 5) e lida com `?.` em todo lugar; não há outro `{ ativo: ... }` literal desse tipo no repo.

- [ ] **Step 7: Usar os novos campos na orquestração**

Em `src/content-scripts/procedimento_visualizar/index.ts`, dentro de `registrarHistoricoVisita` (já modificada na Tarefa 1), trocar o trecho final:

```typescript
  const localStore = createLocalConfigStore()
  const localConfig = await localStore.get()
  const novo: HistoricoProcessoEntry = {
    idProcedimento,
    numero,
    tipo,
    acessadoEm: new Date().toISOString(),
  }
  const limiteItens = syncConfig.historicoProcessos?.limiteItens ?? 50
  const janelaDias = syncConfig.historicoProcessos?.janelaDias ?? 7
  const historicoComNovo = registrarProcessoVisitado(localConfig.historicoProcessosVisitados ?? [], novo, limiteItens)
  const historico = podarPorJanela(historicoComNovo, novo.acessadoEm, janelaDias)
  await localStore.set({ ...localConfig, historicoProcessosVisitados: historico })
```

(Import `podarPorJanela` junto com `registrarProcessoVisitado` na linha 28.)

- [ ] **Step 8: Adicionar os campos na tela de Opções**

Em `src/options/index.html`, trocar o bloco "Histórico de processos visitados" (linhas 174-178):

```html
      <h3>Histórico de processos visitados</h3>
      <label>
        <input type="checkbox" id="processos-historico-ativo" />
        Guardar histórico de processos visitados (mostrado no popup e dentro do SEI)
      </label>
      <br />
      <label>
        Manter no máximo (itens, 0 = sem limite):
        <input type="number" id="processos-historico-limite" min="0" step="1" />
      </label>
      <label>
        Manter só dos últimos (dias, 0 = sem limite):
        <input type="number" id="processos-historico-janela" min="0" step="1" />
      </label>
```

Em `src/options/main.ts`, junto a `inputHistoricoAtivo` (linha ~279):

```typescript
    const inputHistoricoAtivo = document.getElementById('processos-historico-ativo') as HTMLInputElement | null
    const inputHistoricoLimite = document.getElementById('processos-historico-limite') as HTMLInputElement | null
    const inputHistoricoJanela = document.getElementById('processos-historico-janela') as HTMLInputElement | null
```

E, logo depois de carregar os valores (linha ~302):

```typescript
    if (inputHistoricoAtivo) inputHistoricoAtivo.checked = config.historicoProcessos?.ativo ?? false
    if (inputHistoricoLimite) inputHistoricoLimite.value = String(config.historicoProcessos?.limiteItens ?? 50)
    if (inputHistoricoJanela) inputHistoricoJanela.value = String(config.historicoProcessos?.janelaDias ?? 7)
```

E no bloco de salvar (linha ~376-378), trocar:

```typescript
          historicoProcessos: {
            ativo: inputHistoricoAtivo?.checked ?? false,
          },
```

por:

```typescript
          historicoProcessos: {
            ativo: inputHistoricoAtivo?.checked ?? false,
            limiteItens: Number(inputHistoricoLimite?.value ?? 50),
            janelaDias: Number(inputHistoricoJanela?.value ?? 7),
          },
```

- [ ] **Step 9: Rodar tudo**

Run: `bun run test && bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/lib/storage.ts src/features/procedimento-visualizar/historico.ts src/features/procedimento-visualizar/historico.test.ts src/content-scripts/procedimento_visualizar/index.ts src/options/index.html src/options/main.ts
git commit -m "feat(historico): limite de itens e janela de dias configuráveis"
```

---

### Task 3: Busca no popup

**Files:**
- Modify: `src/features/procedimento-visualizar/historico.ts`
- Modify: `src/features/procedimento-visualizar/historico.test.ts`
- Modify: `src/popup/index.html`
- Modify: `src/popup/main.ts:1-100`

**Interfaces:**
- Produces: `filtrarHistoricoPorTexto(historico: HistoricoProcessoEntry[], termo: string): HistoricoProcessoEntry[]`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
import { filtrarHistoricoPorTexto } from './historico'

describe('filtrarHistoricoPorTexto', () => {
  const historico: HistoricoProcessoEntry[] = [
    { idProcedimento: '1', numero: '1234.001/2026', tipo: 'Ofício', acessadoEm: '2026-07-20T10:00:00.000Z' },
    { idProcedimento: '2', numero: '5678.002/2026', tipo: 'Memorando', acessadoEm: '2026-07-20T11:00:00.000Z' },
  ]

  it('termo vazio devolve tudo', () => {
    expect(filtrarHistoricoPorTexto(historico, '')).toEqual(historico)
  })

  it('filtra por número, sem distinguir maiúscula/minúscula', () => {
    expect(filtrarHistoricoPorTexto(historico, '5678')).toEqual([historico[1]])
  })

  it('filtra por tipo', () => {
    expect(filtrarHistoricoPorTexto(historico, 'ofício')).toEqual([historico[0]])
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test historico.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

```typescript
export function filtrarHistoricoPorTexto(historico: HistoricoProcessoEntry[], termo: string): HistoricoProcessoEntry[] {
  const termoNormalizado = termo.trim().toLowerCase()
  if (!termoNormalizado) return historico
  return historico.filter(
    (item) =>
      item.numero.toLowerCase().includes(termoNormalizado) || item.tipo.toLowerCase().includes(termoNormalizado)
  )
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test historico.test.ts`
Expected: PASS

- [ ] **Step 5: Ligar a busca no popup**

Em `src/popup/index.html`, trocar o bloco `#historico` (linhas 105-108):

```html
    <div id="historico">
      <div class="secao-rotulo">Processos recentes</div>
      <input id="historico-busca" type="search" placeholder="Buscar por número ou tipo..." />
      <div id="lista-recentes" class="lista-recentes"></div>
    </div>
```

E adicionar ao `<style>`, perto de `.secao-rotulo` (linha 63):

```css
      #historico-busca { width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: 12px; font-family: inherit; }
      #historico-busca:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
```

Em `src/popup/main.ts`, extrair a renderização da lista pra uma função reaproveitável e ligar o campo de busca. Trocar o trecho de `render()` que monta o histórico (linhas 87-96):

```typescript
import { filtrarHistoricoPorTexto } from '../features/procedimento-visualizar/historico'

let historicoCompleto: HistoricoProcessoEntry[] = []
let baseUrlSeiAtual: string | undefined

function renderizarListaHistorico(termo: string): void {
  const listaRecentes = document.getElementById('lista-recentes')
  if (!listaRecentes || !baseUrlSeiAtual) return
  listaRecentes.innerHTML = ''
  filtrarHistoricoPorTexto(historicoCompleto, termo).forEach((entradaHistorico) => {
    listaRecentes.appendChild(montarItemHistorico(entradaHistorico, baseUrlSeiAtual!))
  })
}
```

E dentro de `render()`:

```typescript
    historicoCompleto = localConfig.historicoProcessosVisitados ?? []
    baseUrlSeiAtual = localConfig.baseUrlSei
    const secaoHistorico = document.getElementById('historico')
    if (secaoHistorico && historicoCompleto.length > 0 && baseUrlSeiAtual) {
      renderizarListaHistorico('')
      secaoHistorico.classList.add('visivel')
      document.getElementById('historico-busca')?.addEventListener('input', (evento) => {
        renderizarListaHistorico((evento.target as HTMLInputElement).value)
      })
    }
```

(Remove o `historico.forEach(...)` antigo nessa posição — a lógica virou `renderizarListaHistorico`.)

- [ ] **Step 6: Rodar tudo**

Run: `bun run test && bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/procedimento-visualizar/historico.ts src/features/procedimento-visualizar/historico.test.ts src/popup/index.html src/popup/main.ts
git commit -m "feat(historico): busca por número ou tipo no popup"
```

---

### Task 4: Painel "Visitados recentemente" dentro do próprio SEI

**Files:**
- Modify: `src/features/procedimento-visualizar/historico.ts`
- Modify: `src/features/procedimento-visualizar/historico.test.ts`
- Modify: `src/content-scripts/procedimento_visualizar/index.ts`
- Modify: `src/content-scripts/core/theme.css`

**Interfaces:**
- Consumes: `criarSecao(titulo: string, iconeSvg: string): { secao: HTMLDivElement; corpo: HTMLDivElement }` (já existe, `content-scripts/procedimento_visualizar/index.ts:381`)
- Produces: `prepararListaRecentes(historico: HistoricoProcessoEntry[], idProcedimentoAtual: string | null, max?: number): HistoricoProcessoEntry[]`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
import { prepararListaRecentes } from './historico'

describe('prepararListaRecentes', () => {
  const historico: HistoricoProcessoEntry[] = [
    { idProcedimento: '1', numero: 'A', tipo: 'Ofício', acessadoEm: '2026-07-20T10:00:00.000Z' },
    { idProcedimento: '2', numero: 'B', tipo: 'Ofício', acessadoEm: '2026-07-20T09:00:00.000Z' },
    { idProcedimento: '3', numero: 'C', tipo: 'Ofício', acessadoEm: '2026-07-20T08:00:00.000Z' },
  ]

  it('remove o processo atualmente aberto da lista', () => {
    expect(prepararListaRecentes(historico, '1', 5)).toEqual([historico[1], historico[2]])
  })

  it('respeita o máximo de itens', () => {
    expect(prepararListaRecentes(historico, null, 1)).toEqual([historico[0]])
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test historico.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

```typescript
export function prepararListaRecentes(
  historico: HistoricoProcessoEntry[],
  idProcedimentoAtual: string | null,
  max = 5
): HistoricoProcessoEntry[] {
  return historico.filter((item) => item.idProcedimento !== idProcedimentoAtual).slice(0, max)
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test historico.test.ts`
Expected: PASS

- [ ] **Step 5: Renderizar a seção dentro do SEI**

Em `src/content-scripts/procedimento_visualizar/index.ts`, adicionar (próximo às outras funções `renderizar*`, antes de `montarPainelTipoEInteressados`) — usa `historyIconSvg`, que precisa ser importado junto aos outros ícones (linha ~34-48: `import historyIconSvg from 'lucide-static/icons/history.svg?raw'`):

```typescript
function renderizarVisitadosRecentemente(
  container: HTMLElement,
  recentes: HistoricoProcessoEntry[],
  baseUrlSei: string
): void {
  if (recentes.length === 0) return
  const { secao, corpo } = criarSecao('Visitados recentemente', historyIconSvg)
  corpo.id = 'seirmg-visitados-recentemente'
  recentes.forEach((item) => {
    const link = document.createElement('a')
    link.className = 'seirmg-visitado-recente-item'
    link.target = '_blank'
    link.rel = 'noopener'
    link.href = `${baseUrlSei}/controlador.php?acao=procedimento_trabalhar&id_procedimento=${item.idProcedimento}`
    const numero = document.createElement('span')
    numero.className = 'seirmg-visitado-recente-numero'
    numero.textContent = item.numero
    const tipo = document.createElement('span')
    tipo.className = 'seirmg-visitado-recente-tipo'
    tipo.textContent = item.tipo
    link.append(numero, tipo)
    corpo.appendChild(link)
  })
  container.appendChild(secao)
}
```

E, dentro de `montarPainelTipoEInteressados`, depois que `registrarHistoricoVisita` foi disparada (a leitura do histórico pode rodar em paralelo, não depende do resultado dessa chamada — só não deve mostrar o processo atual, que ainda não foi persistido nesse momento):

```typescript
  const idProcedimentoAtual = obterIdProcedimento()
  createLocalConfigStore()
    .get()
    .then((localConfig) => {
      if (!localConfig.baseUrlSei) return
      const recentes = prepararListaRecentes(localConfig.historicoProcessosVisitados ?? [], idProcedimentoAtual)
      renderizarVisitadosRecentemente(container, recentes, localConfig.baseUrlSei!)
    })
    .catch((error) => {
      console.error('[SEIRMG] Falha ao renderizar visitados recentemente:', error)
    })
```

(Import `prepararListaRecentes` junto aos outros imports de `historico`, linha 28. `obterIdProcedimento` já existe no arquivo, linha 106-108.)

- [ ] **Step 6: Estilo**

Adicionar em `src/content-scripts/core/theme.css`, perto das outras classes `.seirmg-secao*`:

```css
.seirmg-visitado-recente-item { display: flex; flex-direction: column; gap: 1px; padding: 6px 4px; text-decoration: none; color: inherit; border-radius: 6px; }
.seirmg-visitado-recente-item:hover { background: rgba(0, 0, 0, 0.04); }
.seirmg-visitado-recente-numero { font-size: 12.5px; font-weight: 600; }
.seirmg-visitado-recente-tipo { font-size: 11px; opacity: 0.7; }
```

- [ ] **Step 7: Rodar tudo**

Run: `bun run test && bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/features/procedimento-visualizar/historico.ts src/features/procedimento-visualizar/historico.test.ts src/content-scripts/procedimento_visualizar/index.ts src/content-scripts/core/theme.css
git commit -m "feat(historico): painel de visitados recentemente dentro do SEI"
```

---

### Task 5: Favoritar direto do histórico (popup e painel no SEI)

**Files:**
- Modify: `src/features/procedimento-visualizar/historico.ts`
- Modify: `src/features/procedimento-visualizar/historico.test.ts`
- Modify: `src/features/controle-processos/favoritos.ts`
- Modify: `src/features/controle-processos/favoritos.test.ts`
- Modify: `src/popup/index.html` / `src/popup/main.ts`
- Modify: `src/content-scripts/procedimento_visualizar/index.ts`

**Interfaces:**
- Consumes: `FavoritoProcesso` (`lib/storage.ts:72-78`)
- Produces: `historicoEntryParaFavorito(entry: HistoricoProcessoEntry, adicionadoEm: string): FavoritoProcesso` (em `historico.ts`)
- Produces: `adicionarFavoritoSeNovo(itens: FavoritoProcesso[], novo: FavoritoProcesso): FavoritoProcesso[]` (em `favoritos.ts`, reusada também no Plano de Favoritos Avançados)

- [ ] **Step 1: Escrever os testes que falham**

Em `src/features/controle-processos/favoritos.test.ts`:

```typescript
import { adicionarFavoritoSeNovo } from './favoritos'

describe('adicionarFavoritoSeNovo', () => {
  const existente: FavoritoProcesso = { numero: '1234.001/2026', link: null, adicionadoEm: '2026-07-01T00:00:00.000Z' }

  it('adiciona quando o número ainda não está na lista', () => {
    const novo: FavoritoProcesso = { numero: '5678.002/2026', link: null, adicionadoEm: '2026-07-20T00:00:00.000Z' }
    expect(adicionarFavoritoSeNovo([existente], novo)).toEqual([existente, novo])
  })

  it('não duplica quando o número já está favoritado', () => {
    const duplicado: FavoritoProcesso = { ...existente, adicionadoEm: '2026-07-20T00:00:00.000Z' }
    expect(adicionarFavoritoSeNovo([existente], duplicado)).toEqual([existente])
  })
})
```

Em `src/features/procedimento-visualizar/historico.test.ts`:

```typescript
import { historicoEntryParaFavorito } from './historico'

describe('historicoEntryParaFavorito', () => {
  it('converte entrada de histórico em favorito, com link seguro por id_procedimento', () => {
    const entry: HistoricoProcessoEntry = {
      idProcedimento: '123456',
      numero: '1234.001/2026',
      tipo: 'Ofício',
      acessadoEm: '2026-07-20T10:00:00.000Z',
    }
    expect(historicoEntryParaFavorito(entry, '2026-07-21T00:00:00.000Z')).toEqual({
      numero: '1234.001/2026',
      link: 'controlador.php?acao=procedimento_trabalhar&id_procedimento=123456',
      adicionadoEm: '2026-07-21T00:00:00.000Z',
    })
  })
})
```

- [ ] **Step 2: Rodar e confirmar que ambos falham**

Run: `bun run test historico.test.ts favoritos.test.ts`
Expected: FAIL nos dois arquivos

- [ ] **Step 3: Implementar**

Em `src/features/controle-processos/favoritos.ts`:

```typescript
export function adicionarFavoritoSeNovo(itens: FavoritoProcesso[], novo: FavoritoProcesso): FavoritoProcesso[] {
  if (itens.some((item) => item.numero === novo.numero)) return itens
  return [...itens, novo]
}
```

Em `src/features/procedimento-visualizar/historico.ts`:

```typescript
export function historicoEntryParaFavorito(entry: HistoricoProcessoEntry, adicionadoEm: string): FavoritoProcesso {
  return {
    numero: entry.numero,
    link: `controlador.php?acao=procedimento_trabalhar&id_procedimento=${entry.idProcedimento}`,
    adicionadoEm,
  }
}
```

(Import `FavoritoProcesso` de `../../lib/storage` junto ao resto dos tipos já importados no topo do arquivo.)

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `bun run test historico.test.ts favoritos.test.ts`
Expected: PASS

- [ ] **Step 5: Botão de favoritar no popup**

Em `src/popup/main.ts`, importar `historicoEntryParaFavorito` e `adicionarFavoritoSeNovo`, e em `montarItemHistorico` acrescentar um botão de estrela que escreve direto em `createSyncConfigStore()`:

```typescript
import { adicionarFavoritoSeNovo } from '../features/controle-processos/favoritos'
import { historicoEntryParaFavorito } from '../features/procedimento-visualizar/historico'
import starIconSvg from 'lucide-static/icons/star.svg?raw'

function montarBotaoFavoritar(entrada: HistoricoProcessoEntry): HTMLButtonElement {
  const botao = document.createElement('button')
  botao.type = 'button'
  botao.className = 'item-favoritar'
  botao.title = 'Adicionar aos favoritos'
  botao.innerHTML = starIconSvg
  botao.addEventListener('click', async (evento) => {
    evento.preventDefault()
    try {
      const store = createSyncConfigStore()
      const config = await store.get()
      const novosItens = adicionarFavoritoSeNovo(
        config.controleProcessos.favoritos.itens,
        historicoEntryParaFavorito(entrada, new Date().toISOString())
      )
      await store.set({
        ...config,
        controleProcessos: { ...config.controleProcessos, favoritos: { ...config.controleProcessos.favoritos, itens: novosItens } },
      })
      botao.disabled = true
      botao.title = 'Já está nos favoritos'
    } catch (error) {
      console.error('[SEIRMG] Falha ao favoritar direto do histórico:', error)
    }
  })
  return botao
}
```

E dentro de `montarItemHistorico`, acrescentar `item.appendChild(montarBotaoFavoritar(entrada))` antes do `return item`.

Adicionar ao `<style>` de `popup/index.html`:

```css
      .item-favoritar { flex-shrink: 0; width: 22px; height: 22px; border: none; background: transparent; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 6px; }
      .item-favoritar:hover { background: var(--bg-subtle); color: var(--accent); }
      .item-favoritar svg { width: 13px; height: 13px; }
      .item-favoritar:disabled { opacity: 0.4; cursor: default; }
```

- [ ] **Step 6: Mesmo botão no painel dentro do SEI**

Em `src/content-scripts/procedimento_visualizar/index.ts`, dentro de `renderizarVisitadosRecentemente` (Tarefa 4), acrescentar o botão de favoritar em cada item, escrevendo em `createSyncConfigStore()` do mesmo jeito que o Step 5 (import `adicionarFavoritoSeNovo` e `historicoEntryParaFavorito` junto aos demais).

- [ ] **Step 7: Rodar tudo**

Run: `bun run test && bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/features/procedimento-visualizar/historico.ts src/features/procedimento-visualizar/historico.test.ts src/features/controle-processos/favoritos.ts src/features/controle-processos/favoritos.test.ts src/popup/index.html src/popup/main.ts src/content-scripts/procedimento_visualizar/index.ts
git commit -m "feat(historico): favoritar processo direto da lista de visitados"
```

---

## Self-Review

- **Cobertura:** privacidade (Task 1), limite/janela (Task 2), busca (Task 3), exibição dentro do SEI (Task 4) e integração com favoritos (Task 5) — os 4 pontos mapeados na conversa estão cobertos.
- **Placeholders:** nenhum "TODO"/"adicionar tratamento apropriado" — todo código é real, com os nomes exatos já existentes no repo (`extrairNivelAcesso`, `criarSecao`, `createSyncConfigStore`, `FavoritoProcesso`).
- **Consistência de tipos:** `NivelAcessoExtraido['nivel']` é reaproveitado literalmente (não redefinido) em `ehNivelAcessoCapturavel`; `HistoricoProcessoEntry` e `FavoritoProcesso` são sempre importados de `lib/storage.ts`, nunca redeclarados.
