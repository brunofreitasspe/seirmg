# SEIRMG — Backup e Restauração de Configurações — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma aba "Backup" na tela de Options que baixa um `.json` com toda a
configuração do SEIRMG (`SyncConfig` completo + histórico/eventos/snapshot de prazos do
`LocalConfig`) e restaura esse arquivo de volta, substituindo a configuração atual.

**Architecture:** Módulo puro `src/features/backup/backup.ts` (montar/validar/aplicar o objeto de
backup, sem I/O) + wiring de UI em `src/options/index.html` e `src/options/main.ts` (nova aba,
botões de baixar/restaurar, usando `chrome.storage` via `createSyncConfigStore`/
`createLocalConfigStore` já existentes em `src/lib/storage.ts`).

**Tech Stack:** TypeScript, Vite, Vitest, `lucide-static` (ícones SVG), `chrome.storage` (via
`src/lib/storage.ts`).

## Global Constraints

- Todo código que chama `chrome.*` de um listener de clique/top-level deve ter try/catch (log via
  `console.error('[SEIRMG] ...', error)`, engolir o erro, nunca relançar) — política padrão do
  projeto.
- `sync` no backup é o `SyncConfig` inteiro, sem seleção de campos — inclui as chaves de API de IA
  em texto puro (decisão explícita do usuário).
- `local` no backup contém só 3 campos: `historicoProcessosVisitados`, `historicoEventos`,
  `snapshotPrazosProcessos` — nunca token/e-mail do Planka nem outros campos de `LocalConfig`.
- Restauração é sempre substituição total (não faz merge com a configuração atual) — mas o merge
  interno com `DEFAULT_SYNC_CONFIG`/`DEFAULT_LOCAL_CONFIG` preenche qualquer chave de topo ausente
  no arquivo de backup (proteção contra backup de versão antiga faltando campo novo).
- Nome do arquivo baixado: `backup-seirmg-YYYY-MM-DD.json`.
- Depois de restaurar com sucesso, a página de Options faz `location.reload()` (não re-chama as
  funções `carregarAbaX()` — isso duplicaria os listeners de clique de cada aba).

---

### Task 1: Módulo `backup.ts` — montar, validar e aplicar o backup

**Files:**
- Create: `src/features/backup/backup.ts`
- Create: `src/features/backup/backup.test.ts`

**Interfaces:**
- Consumes: de `src/lib/storage.ts` — `SyncConfig`, `LocalConfig`, `DEFAULT_SYNC_CONFIG`,
  `DEFAULT_LOCAL_CONFIG` (todos já existem, nada a modificar nesse arquivo).
- Produces (usado na Task 2):
  - `export interface BackupLocalConfig { historicoProcessosVisitados: HistoricoProcessoEntry[]; historicoEventos: EventoHistorico[]; snapshotPrazosProcessos: SnapshotPrazoProcesso[] }`
  - `export interface BackupCompleto { versaoSeirmg: string; exportadoEm: string; sync: SyncConfig; local: BackupLocalConfig }`
  - `export function montarBackupCompleto(sync: SyncConfig, local: BackupLocalConfig, versaoSeirmg: string, agora: Date): BackupCompleto`
  - `export function parseBackupCompleto(json: string): BackupCompleto | null`
  - `export function aplicarBackupRestaurado(backup: BackupCompleto): { sync: SyncConfig; local: BackupLocalConfig }`

- [ ] **Step 1: Escrever os testes de `montarBackupCompleto`**

Crie `src/features/backup/backup.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { montarBackupCompleto } from './backup'
import { DEFAULT_SYNC_CONFIG, type EventoHistorico, type HistoricoProcessoEntry, type SnapshotPrazoProcesso } from '../../lib/storage'

const historico: HistoricoProcessoEntry[] = [
  { idProcedimento: '123', numero: 'HMMG.2026.00123-4', tipo: 'Ofício', acessadoEm: '2026-08-01T10:00:00.000Z' },
]

const eventos: EventoHistorico[] = [
  { tipo: 'acesso', numero: 'HMMG.2026.00123-4', ocorridoEm: '2026-08-01T10:00:00.000Z' },
]

const snapshots: SnapshotPrazoProcesso[] = [
  { numero: 'HMMG.2026.00123-4', link: null, prazoDataTexto: '15/08/2026', vistoEm: '2026-08-01T10:00:00.000Z' },
]

describe('montarBackupCompleto', () => {
  it('monta o objeto de backup com sync completo e os 3 campos de local', () => {
    const agora = new Date('2026-08-17T12:00:00.000Z')
    const backup = montarBackupCompleto(
      DEFAULT_SYNC_CONFIG,
      { historicoProcessosVisitados: historico, historicoEventos: eventos, snapshotPrazosProcessos: snapshots },
      '5.0',
      agora
    )

    expect(backup).toEqual({
      versaoSeirmg: '5.0',
      exportadoEm: '2026-08-17T12:00:00.000Z',
      sync: DEFAULT_SYNC_CONFIG,
      local: {
        historicoProcessosVisitados: historico,
        historicoEventos: eventos,
        snapshotPrazosProcessos: snapshots,
      },
    })
  })
})
```

- [ ] **Step 2: Rodar os testes pra ver que falham (arquivo `backup.ts` ainda não existe)**

Run: `npx vitest run src/features/backup/backup.test.ts`
Expected: FAIL — `Cannot find module './backup'`

- [ ] **Step 3: Criar `backup.ts` com os tipos e `montarBackupCompleto`**

Crie `src/features/backup/backup.ts`:

```ts
import type { EventoHistorico, HistoricoProcessoEntry, SnapshotPrazoProcesso, SyncConfig } from '../../lib/storage'
import { DEFAULT_LOCAL_CONFIG, DEFAULT_SYNC_CONFIG } from '../../lib/storage'

export interface BackupLocalConfig {
  historicoProcessosVisitados: HistoricoProcessoEntry[]
  historicoEventos: EventoHistorico[]
  snapshotPrazosProcessos: SnapshotPrazoProcesso[]
}

export interface BackupCompleto {
  versaoSeirmg: string
  exportadoEm: string
  sync: SyncConfig
  local: BackupLocalConfig
}

export function montarBackupCompleto(
  sync: SyncConfig,
  local: BackupLocalConfig,
  versaoSeirmg: string,
  agora: Date
): BackupCompleto {
  return {
    versaoSeirmg,
    exportadoEm: agora.toISOString(),
    sync,
    local,
  }
}
```

- [ ] **Step 4: Rodar os testes pra ver que passam**

Run: `npx vitest run src/features/backup/backup.test.ts`
Expected: PASS (1 teste)

- [ ] **Step 5: Escrever os testes de `parseBackupCompleto`**

Adicione ao final de `backup.test.ts`:

```ts
describe('parseBackupCompleto', () => {
  const backupValido = {
    versaoSeirmg: '5.0',
    exportadoEm: '2026-08-17T12:00:00.000Z',
    sync: DEFAULT_SYNC_CONFIG,
    local: {
      historicoProcessosVisitados: historico,
      historicoEventos: eventos,
      snapshotPrazosProcessos: snapshots,
    },
  }

  it('faz parse de um backup válido', () => {
    expect(parseBackupCompleto(JSON.stringify(backupValido))).toEqual(backupValido)
  })

  it('retorna null pra JSON com erro de sintaxe', () => {
    expect(parseBackupCompleto('{ isso não é json')).toBeNull()
  })

  it('retorna null pra "null" (JSON válido, mas não é objeto)', () => {
    expect(parseBackupCompleto('null')).toBeNull()
  })

  it('retorna null pra um array no lugar de objeto', () => {
    expect(parseBackupCompleto('[]')).toBeNull()
  })

  it('retorna null quando falta o campo sync', () => {
    const { sync: _sync, ...semSync } = backupValido
    expect(parseBackupCompleto(JSON.stringify(semSync))).toBeNull()
  })

  it('retorna null quando falta o campo local', () => {
    const { local: _local, ...semLocal } = backupValido
    expect(parseBackupCompleto(JSON.stringify(semLocal))).toBeNull()
  })

  it('retorna null quando sync não é objeto', () => {
    expect(parseBackupCompleto(JSON.stringify({ ...backupValido, sync: 'não é objeto' }))).toBeNull()
  })
})
```

Adicione `parseBackupCompleto` ao import de `'./backup'` no topo do arquivo.

- [ ] **Step 6: Rodar os testes pra ver que falham**

Run: `npx vitest run src/features/backup/backup.test.ts`
Expected: FAIL — `parseBackupCompleto is not a function` (ou similar)

- [ ] **Step 7: Implementar `parseBackupCompleto`**

Adicione a `backup.ts`:

```ts
export function parseBackupCompleto(json: string): BackupCompleto | null {
  try {
    const dados: unknown = JSON.parse(json)
    if (typeof dados !== 'object' || dados === null || Array.isArray(dados)) {
      return null
    }
    const { sync, local } = dados as { sync?: unknown; local?: unknown }
    if (typeof sync !== 'object' || sync === null || Array.isArray(sync)) {
      return null
    }
    if (typeof local !== 'object' || local === null || Array.isArray(local)) {
      return null
    }
    return dados as BackupCompleto
  } catch {
    return null
  }
}
```

- [ ] **Step 8: Rodar os testes pra ver que passam**

Run: `npx vitest run src/features/backup/backup.test.ts`
Expected: PASS (8 testes)

- [ ] **Step 9: Escrever os testes de `aplicarBackupRestaurado`**

Adicione ao final de `backup.test.ts` (e `aplicarBackupRestaurado` ao import):

```ts
describe('aplicarBackupRestaurado', () => {
  it('devolve sync e local do backup quando o backup tem todas as chaves', () => {
    const backup = {
      versaoSeirmg: '5.0',
      exportadoEm: '2026-08-17T12:00:00.000Z',
      sync: { ...DEFAULT_SYNC_CONFIG, tema: { preset: 'black' as const } },
      local: {
        historicoProcessosVisitados: historico,
        historicoEventos: eventos,
        snapshotPrazosProcessos: snapshots,
      },
    }

    const resultado = aplicarBackupRestaurado(backup)

    expect(resultado.sync.tema).toEqual({ preset: 'black' })
    expect(resultado.local).toEqual(backup.local)
  })

  it('preenche com o default uma chave de topo ausente no sync do backup (simula backup antigo)', () => {
    const { dashboard: _dashboard, ...syncSemDashboard } = DEFAULT_SYNC_CONFIG
    const backup = {
      versaoSeirmg: '4.0',
      exportadoEm: '2026-01-01T00:00:00.000Z',
      sync: syncSemDashboard as typeof DEFAULT_SYNC_CONFIG,
      local: { historicoProcessosVisitados: [], historicoEventos: [], snapshotPrazosProcessos: [] },
    }

    const resultado = aplicarBackupRestaurado(backup)

    expect(resultado.sync.dashboard).toEqual(DEFAULT_SYNC_CONFIG.dashboard)
  })

  it('preenche com o default um campo de local ausente no backup', () => {
    const backup = {
      versaoSeirmg: '4.0',
      exportadoEm: '2026-01-01T00:00:00.000Z',
      sync: DEFAULT_SYNC_CONFIG,
      local: { historicoProcessosVisitados: historico } as unknown as { historicoProcessosVisitados: HistoricoProcessoEntry[]; historicoEventos: EventoHistorico[]; snapshotPrazosProcessos: SnapshotPrazoProcesso[] },
    }

    const resultado = aplicarBackupRestaurado(backup)

    expect(resultado.local.historicoProcessosVisitados).toEqual(historico)
    expect(resultado.local.historicoEventos).toEqual(DEFAULT_LOCAL_CONFIG.historicoEventos)
    expect(resultado.local.snapshotPrazosProcessos).toEqual(DEFAULT_LOCAL_CONFIG.snapshotPrazosProcessos)
  })
})
```

- [ ] **Step 10: Rodar os testes pra ver que falham**

Run: `npx vitest run src/features/backup/backup.test.ts`
Expected: FAIL — `aplicarBackupRestaurado is not a function`

- [ ] **Step 11: Implementar `aplicarBackupRestaurado`**

Adicione a `backup.ts`:

```ts
export function aplicarBackupRestaurado(backup: BackupCompleto): { sync: SyncConfig; local: BackupLocalConfig } {
  return {
    sync: { ...DEFAULT_SYNC_CONFIG, ...backup.sync },
    local: {
      historicoProcessosVisitados: backup.local.historicoProcessosVisitados ?? DEFAULT_LOCAL_CONFIG.historicoProcessosVisitados,
      historicoEventos: backup.local.historicoEventos ?? DEFAULT_LOCAL_CONFIG.historicoEventos,
      snapshotPrazosProcessos: backup.local.snapshotPrazosProcessos ?? DEFAULT_LOCAL_CONFIG.snapshotPrazosProcessos,
    },
  }
}
```

- [ ] **Step 12: Rodar todos os testes do arquivo pra ver que passam**

Run: `npx vitest run src/features/backup/backup.test.ts`
Expected: PASS (11 testes no total)

- [ ] **Step 13: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 14: Commit**

```bash
git add src/features/backup/backup.ts src/features/backup/backup.test.ts
git commit -m "feat(backup): módulo puro de montar/validar/aplicar backup completo de configurações"
```

---

### Task 2: Aba "Backup" na tela de Options

**Files:**
- Modify: `src/options/index.html` (nova entrada de nav + nova `<section>`)
- Modify: `src/options/main.ts` (ícone, `carregarAbaBackup`, chamada de inicialização)

**Interfaces:**
- Consumes de `src/features/backup/backup.ts` (Task 1): `montarBackupCompleto`,
  `parseBackupCompleto`, `aplicarBackupRestaurado`, `type BackupLocalConfig`.
- Consumes de `src/lib/storage.ts` (já existe): `createSyncConfigStore`, `createLocalConfigStore`.
- Não produz nada consumido por outra task — esta é a última task do plano.

- [ ] **Step 1: Adicionar o botão de nav e a seção da aba em `index.html`**

Em `src/options/index.html`, dentro de `<nav id="abas">`, adicione o botão logo depois do de
"Aparência" (linha `<button data-aba="aparencia" class="aba-btn">Aparência</button>`):

```html
<button data-aba="backup" class="aba-btn">Backup</button>
```

Depois da seção `#painel-geral` (ou em qualquer ponto entre as `<section class="painel">`
existentes — a ordem das seções no HTML não precisa bater com a ordem dos botões de nav, só a
classe `.painel` e o `id` importam), adicione:

```html
<section id="painel-backup" class="painel">
  <h2>Backup e Restauração</h2>
  <h3>Fazer backup</h3>
  <p style="font-size: 0.85em; color: #666; max-width: 480px;">
    Baixa um arquivo .json com todas as configurações atuais (dicionário do corretor, Kanban,
    prazos, avisos de bloco, tema, IA, favoritos, tarefas, atalhos, ponto de controle, histórico) —
    inclui as chaves de API salvas.
  </p>
  <button id="backup-baixar">Baixar backup</button>
  <br /><br />
  <h3>Restaurar backup</h3>
  <p style="font-size: 0.85em; color: #666; max-width: 480px;">
    Substitui TODAS as configurações atuais pelas do arquivo escolhido. Essa ação não pode ser
    desfeita.
  </p>
  <input type="file" id="backup-arquivo" accept="application/json" />
  <button id="backup-restaurar">Restaurar</button>
  <span id="backup-status"></span>
</section>
```

- [ ] **Step 2: Registrar o ícone da aba em `main.ts`**

Em `src/options/main.ts`, adicione o import perto dos outros ícones (linha 1-10):

```ts
import archiveIconSvg from 'lucide-static/icons/archive.svg?raw'
```

E adicione a entrada em `ICONES_ABA` (perto da linha 41-52):

```ts
backup: archiveIconSvg,
```

- [ ] **Step 3: Importar as funções do módulo de backup em `main.ts`**

No bloco de import de `'../lib/storage'` (linhas 12-22), adicione `createLocalConfigStore` (se
ainda não estiver importado — confira antes de duplicar) e crie um novo import:

```ts
import {
  montarBackupCompleto,
  parseBackupCompleto,
  type BackupLocalConfig,
} from '../features/backup/backup'
```

- [ ] **Step 4: Escrever `carregarAbaBackup` — download**

Adicione a `main.ts`, depois de `carregarAbaKanban` (perto da linha 752, antes das chamadas finais
de inicialização):

```ts
async function carregarAbaBackup(): Promise<void> {
  try {
    const btnBaixar = document.getElementById('backup-baixar')
    const btnRestaurar = document.getElementById('backup-restaurar')
    const inputArquivo = document.getElementById('backup-arquivo') as HTMLInputElement | null
    const status = document.getElementById('backup-status')

    btnBaixar?.addEventListener('click', async () => {
      try {
        const syncStore = createSyncConfigStore()
        const localStore = createLocalConfigStore()
        const sync = await syncStore.get()
        const local = await localStore.get()
        const localParaBackup: BackupLocalConfig = {
          historicoProcessosVisitados: local.historicoProcessosVisitados,
          historicoEventos: local.historicoEventos,
          snapshotPrazosProcessos: local.snapshotPrazosProcessos,
        }
        const backup = montarBackupCompleto(sync, localParaBackup, chrome.runtime.getManifest().version, new Date())
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `backup-seirmg-${new Date().toISOString().slice(0, 10)}.json`
        link.click()
        URL.revokeObjectURL(url)
      } catch (error) {
        console.error('[SEIRMG] Falha ao gerar backup:', error)
        if (status) status.textContent = 'Falha ao gerar backup.'
      }
    })

    btnRestaurar?.addEventListener('click', () => {
      const arquivo = inputArquivo?.files?.[0]
      if (!arquivo) {
        if (status) status.textContent = 'Escolha um arquivo primeiro.'
        return
      }

      const leitor = new FileReader()
      leitor.onerror = () => {
        console.error('[SEIRMG] Falha ao ler arquivo de backup:', leitor.error)
        if (status) status.textContent = 'Falha ao ler o arquivo.'
      }
      leitor.onload = async (evento) => {
        try {
          const conteudo = evento.target?.result
          if (typeof conteudo !== 'string') return

          const backup = parseBackupCompleto(conteudo)
          if (!backup) {
            if (status) status.textContent = 'Arquivo inválido ou corrompido.'
            return
          }

          const dataFormatada = new Date(backup.exportadoEm).toLocaleString('pt-BR')
          const confirmado = window.confirm(
            `Isso vai substituir TODAS as configurações atuais pelas do backup de ${dataFormatada}. Essa ação não pode ser desfeita. Continuar?`
          )
          if (!confirmado) return

          const restaurado = aplicarBackupRestaurado(backup)
          const syncStore = createSyncConfigStore()
          const localStore = createLocalConfigStore()
          await syncStore.set(restaurado.sync)
          const localAtual = await localStore.get()
          await localStore.set({ ...localAtual, ...restaurado.local })

          if (status) status.textContent = 'Backup restaurado com sucesso. Recarregando...'
          if (inputArquivo) inputArquivo.value = ''
          setTimeout(() => location.reload(), 800)
        } catch (error) {
          console.error('[SEIRMG] Falha ao restaurar backup:', error)
          if (status) status.textContent = 'Falha ao restaurar backup.'
        }
      }
      leitor.readAsText(arquivo)
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao carregar aba Backup:', error)
  }
}
```

`aplicarBackupRestaurado` precisa estar no import do Step 3 também — atualize-o para incluir
`aplicarBackupRestaurado` junto de `montarBackupCompleto`/`parseBackupCompleto`.

- [ ] **Step 5: Chamar `carregarAbaBackup()` na inicialização**

No final de `main.ts`, junto das outras chamadas (perto da linha 754-762), adicione:

```ts
carregarAbaBackup()
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: build sem erros, `dist/options.html` gerado

- [ ] **Step 8: Rodar a suíte completa de testes**

Run: `npm test`
Expected: todos os testes passam (nenhuma regressão)

- [ ] **Step 9: Commit**

```bash
git add src/options/index.html src/options/main.ts
git commit -m "feat(backup): aba Backup na tela de Options — baixar e restaurar configuração completa"
```

---

## Verificação final

- [ ] **Step 1: Rodar typecheck, testes e build juntos, do zero**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: tudo verde, sem warnings novos

- [ ] **Step 2: Nota de validação manual**

⚠️ Este plano não inclui validação ao vivo contra uma instância real do SEI (não é necessária —
a aba Backup só interage com `chrome.storage` e download/upload de arquivo, nenhuma lógica
depende de DOM do SEI ou de conteúdo de página específico). Ainda assim, vale o usuário testar uma
vez, manualmente, a extensão carregada (`chrome://extensions` → recarregar → abrir Options →
aba Backup → baixar → alterar alguma configuração → restaurar → conferir que voltou).
