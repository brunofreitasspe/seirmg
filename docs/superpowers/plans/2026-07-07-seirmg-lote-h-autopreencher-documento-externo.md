# SEIRMG — Lote H: Autopreencher Recebimento de Documento Externo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar `autopreencherDocumentoExterno.js` do Sei++, estendendo o content script `documento_receber` já entregue no Lote F.

**Architecture:** Ver `docs/superpowers/specs/2026-07-07-seirmg-lote-h-autopreencher-documento-externo-design.md`. Lógica pura testável em `features/documento-receber/`, wiring fino não-testado estendendo `content-scripts/documento_receber/index.ts`.

**Tech Stack:** TypeScript, Vite, `@crxjs/vite-plugin`, Bun, Vitest — mesma infraestrutura já existente. Nenhuma dependência nova.

## Global Constraints

- Nenhum bloco de `content_scripts` novo — a tela `documento_receber` já está registrada (Lote F); só estende o `index.ts` já existente.
- Defaults conservadores por segurança: `formato: 'N'`, `nivelAcesso: 'P'` — nunca pré-seleciona sigilo/restrito por padrão.
- Usa `.click()` nos rádios de opção (não só `checked`), replicando a técnica do original para garantir que os handlers nativos do SEI disparem.
- Todo listener/callback assíncrono novo segue o padrão já estabelecido: guard `try/catch`, loga via `console.error('[SEIRMG] ...', error)`, nunca lança exceção não tratada.

---

## Mapa de arquivos (visão geral)

```
seirmg/
├── src/
│   ├── lib/storage.ts (modificado)
│   ├── features/documento-receber/autopreencher.ts (+ .test.ts, novo)
│   ├── content-scripts/documento_receber/index.ts (modificado)
│   └── options/index.html, main.ts (modificados)
```

---

### Task 1: `lib/storage.ts` — schema de `documentoExterno`

**Files:**
- Modify: `C:\sei\seirmg\src\lib\storage.ts`
- Modify: `C:\sei\seirmg\src\lib\storage.test.ts`

**Interfaces:**
- Consumes: nenhuma
- Produces: `type FormatoDocumento = 'N' | 'D'`; `type NivelAcessoDocumento = 'P' | 'R' | 'S'`; `DocumentoExternoConfig { ativo, formato, tipoConferencia, nivelAcesso, hipoteseLegal }`; `SyncConfig.documentoExterno: DocumentoExternoConfig`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final do `describe('createSyncConfigStore', ...)` já existente em `src/lib/storage.test.ts`:

```ts
  it('inclui documentoExterno padrão quando vazio', async () => {
    const store = createSyncConfigStore(criarAreaFalsa())
    expect((await store.get()).documentoExterno).toEqual({
      ativo: true,
      formato: 'N',
      tipoConferencia: '',
      nivelAcesso: 'P',
      hipoteseLegal: '',
    })
  })

  it('persiste alteração de documentoExterno', async () => {
    const area = criarAreaFalsa()
    const store = createSyncConfigStore(area)
    const atualizado = {
      ...DEFAULT_SYNC_CONFIG,
      documentoExterno: {
        ativo: false,
        formato: 'D' as const,
        tipoConferencia: 'Cópia Simples',
        nivelAcesso: 'R' as const,
        hipoteseLegal: '1',
      },
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/lib/storage.test.ts`
Expected: FAIL — `documentoExterno` é `undefined` (campo ainda não existe em `SyncConfig`/`DEFAULT_SYNC_CONFIG`)

- [ ] **Step 3: Implementar em `src/lib/storage.ts`**

Adicionar as interfaces novas (depois de `PontoControleConfig`, antes de `SyncConfig`):

```ts
export type FormatoDocumento = 'N' | 'D'
export type NivelAcessoDocumento = 'P' | 'R' | 'S'

export interface DocumentoExternoConfig {
  ativo: boolean
  formato: FormatoDocumento
  tipoConferencia: string
  nivelAcesso: NivelAcessoDocumento
  hipoteseLegal: string
}
```

Modificar `SyncConfig` (adicionar o campo `documentoExterno` depois de `pontoControle`):

```ts
export interface SyncConfig {
  schemaVersion: 1
  featureFlags: FeatureFlags
  tema: ThemeConfig
  blocoAssinatura: BlocoAssinaturaConfig
  processosNovos: ProcessosNovosConfig
  controleProcessos: ControleProcessosConfig
  pontoControle: PontoControleConfig
  documentoExterno: DocumentoExternoConfig
}
```

Modificar `DEFAULT_SYNC_CONFIG` (adicionar `documentoExterno` depois de `pontoControle`):

```ts
  documentoExterno: {
    ativo: true,
    formato: 'N',
    tipoConferencia: '',
    nivelAcesso: 'P',
    hipoteseLegal: '',
  },
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/lib/storage.test.ts`
Expected: PASS (19 testes — 17 já existentes + 2 novos)

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "feat(storage): add documentoExterno config schema"
```

---

### Task 2: `features/documento-receber/autopreencher.ts`

**Files:**
- Create: `C:\sei\seirmg\src\features\documento-receber\autopreencher.ts`
- Test: `C:\sei\seirmg\src\features\documento-receber\autopreencher.test.ts`

**Contexto**: porte de `C:\sei\seiplus\cs_modules\documento_receber\autopreencherDocumentoExterno.js` (só `getFormattedDate` — o resto é preenchimento direto de campos com valores de configuração, sem lógica adicional a extrair).

**Interfaces:**
- Consumes: nenhuma
- Produces: `formatarDataHoje(data: Date): string`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/features/documento-receber/autopreencher.test.ts
import { describe, expect, it } from 'vitest'
import { formatarDataHoje } from './autopreencher'

describe('formatarDataHoje', () => {
  it('formata com zero à esquerda quando dia e mês têm um dígito', () => {
    expect(formatarDataHoje(new Date(2026, 0, 5))).toBe('05/01/2026')
  })

  it('formata sem zero à esquerda desnecessário quando dia e mês têm dois dígitos', () => {
    expect(formatarDataHoje(new Date(2026, 10, 25))).toBe('25/11/2026')
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/features/documento-receber/autopreencher.test.ts`
Expected: FAIL — `Cannot find module './autopreencher'`

- [ ] **Step 3: Implementar `src/features/documento-receber/autopreencher.ts`**

```ts
export function formatarDataHoje(data: Date): string {
  const dia = String(data.getDate()).padStart(2, '0')
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const ano = data.getFullYear()
  return `${dia}/${mes}/${ano}`
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/features/documento-receber/autopreencher.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add src/features/documento-receber/autopreencher.ts src/features/documento-receber/autopreencher.test.ts
git commit -m "feat(documento-receber): add today's-date formatting helper"
```

---

### Task 3: `content-scripts/documento_receber/index.ts` — wiring do autopreenchimento

**Files:**
- Modify: `C:\sei\seirmg\src\content-scripts\documento_receber\index.ts`

**Contexto**: wiring fino, conecta DOM à lógica já testada. Não é coberta por TDD — verificado via build. A nova função é independente da lógica de reabertura já existente (Lote F) e roda antes dela no bootstrap.

**Interfaces:**
- Consumes: `formatarDataHoje` (Task 2); `createSyncConfigStore`, `type DocumentoExternoConfig` (`../../lib/storage`)

- [ ] **Step 1: Substituir `src/content-scripts/documento_receber/index.ts`**

Arquivo atual:

```ts
import {
  extrairUrlUnidadeSelecionarReabertura,
  processoFechadoEmTodasUnidades,
} from '../../features/documento-receber/forcarReabertura'
import { fetchText } from '../../lib/result'

async function bootstrap(): Promise<void> {
  try {
    const divAlerta = document.getElementById('divUnidadesReabertura')
    if (!divAlerta || getComputedStyle(divAlerta).display !== 'block') return

    const botoesSalvar = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        '#divInfraBarraComandosSuperior > #btnSalvar, #divInfraBarraComandosInferior > #btnSalvar'
      )
    )
    botoesSalvar.forEach((botao) => {
      botao.disabled = true
    })

    const url = extrairUrlUnidadeSelecionarReabertura(document.head.innerHTML, window.location.href)
    if (!url) {
      botoesSalvar.forEach((botao) => {
        botao.disabled = false
      })
      return
    }

    const resultado = await fetchText(url)
    if (!resultado.ok) {
      botoesSalvar.forEach((botao) => {
        botao.disabled = false
      })
      return
    }

    const doc = new DOMParser().parseFromString(resultado.data, 'text/html')
    const linhas = doc.querySelectorAll('#divInfraAreaTabela > table > tbody > tr')
    const totalUnidades = Math.max(linhas.length - 1, 0)
    const totalFechadas = doc.querySelectorAll('#divInfraAreaTabela > table > tbody > tr > td > input').length

    if (processoFechadoEmTodasUnidades(totalUnidades, totalFechadas)) {
      const aviso = document.createElement('span')
      aviso.id = 'seirmg-alerta-unidades-reabertura'
      aviso.style.cssText = 'background-color: yellow; color: black; padding: 5px; float: left;'
      aviso.textContent = 'O processo não está aberto em nenhuma unidade! Favor verificar.'
      document.querySelector('#divInfraBarraComandosSuperior')?.appendChild(aviso)

      botoesSalvar.forEach((botao) => {
        botao.addEventListener('click', (evento) => {
          const selectDisponivel = document.querySelector('#selUnidadesReabertura option')
          if (!selectDisponivel) {
            evento.preventDefault()
            alert('O processo não está aberto em nenhuma unidade! Favor verificar')
            document
              .getElementById('selUnidadesReabertura')
              ?.style.setProperty('background-color', 'red', 'important')
          }
        })
      })
    }

    botoesSalvar.forEach((botao) => {
      botao.disabled = false
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao verificar reabertura de processo:', error)
  }
}

bootstrap()
```

Substituir por (adiciona `criarAvisoPreenchimento`, `autopreencherDocumentoExterno`, e chama esta última no início de `bootstrap`, em seu próprio `try/catch`; o resto do arquivo fica idêntico):

```ts
import { formatarDataHoje } from '../../features/documento-receber/autopreencher'
import {
  extrairUrlUnidadeSelecionarReabertura,
  processoFechadoEmTodasUnidades,
} from '../../features/documento-receber/forcarReabertura'
import { fetchText } from '../../lib/result'
import { createSyncConfigStore } from '../../lib/storage'
import type { DocumentoExternoConfig } from '../../lib/storage'

function criarAvisoPreenchimento(): HTMLSpanElement {
  const aviso = document.createElement('span')
  aviso.style.backgroundColor = 'red'
  aviso.textContent =
    'Houve preenchimento de valores pré configurados nesta tela. Verifique se estão corretos!'
  return aviso
}

function autopreencherDocumentoExterno(config: DocumentoExternoConfig): void {
  try {
    if (!config.ativo) return

    const inputData = document.getElementById('txtDataElaboracao') as HTMLInputElement | null
    if (!inputData) return

    inputData.value = formatarDataHoje(new Date())

    setTimeout(() => {
      try {
        if (config.formato === 'N') {
          document.querySelector<HTMLInputElement>('#optNato')?.click()
        } else if (config.formato === 'D') {
          document.querySelector<HTMLInputElement>('#optDigitalizado')?.click()
          const selectConferencia = document.getElementById(
            'selTipoConferencia'
          ) as HTMLSelectElement | null
          if (selectConferencia) selectConferencia.value = config.tipoConferencia
        }
      } catch (error) {
        console.error('[SEIRMG] Falha ao preencher formato do documento:', error)
      }
    }, 500)

    if (config.nivelAcesso === 'R') {
      document.querySelector<HTMLInputElement>('#optRestrito')?.click()
    } else if (config.nivelAcesso === 'S') {
      document.querySelector<HTMLInputElement>('#optSigiloso')?.click()
    } else {
      document.querySelector<HTMLInputElement>('#optPublico')?.click()
    }

    if (config.nivelAcesso === 'S' || config.nivelAcesso === 'R') {
      setTimeout(() => {
        const selectHipotese = document.getElementById('selHipoteseLegal') as HTMLSelectElement | null
        if (selectHipotese) selectHipotese.value = config.hipoteseLegal
      }, 500)
    }

    document
      .querySelector('#divInfraBarraComandosInferior #btnSalvar')
      ?.insertAdjacentElement('beforebegin', criarAvisoPreenchimento())
    document
      .querySelector('#divInfraBarraComandosSuperior #btnSalvar')
      ?.insertAdjacentElement('beforebegin', criarAvisoPreenchimento())
  } catch (error) {
    console.error('[SEIRMG] Falha ao autopreencher documento externo:', error)
  }
}

async function bootstrap(): Promise<void> {
  try {
    const syncConfig = await createSyncConfigStore().get()
    autopreencherDocumentoExterno(syncConfig.documentoExterno)
  } catch (error) {
    console.error('[SEIRMG] Falha ao carregar configuração de documento externo:', error)
  }

  try {
    const divAlerta = document.getElementById('divUnidadesReabertura')
    if (!divAlerta || getComputedStyle(divAlerta).display !== 'block') return

    const botoesSalvar = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        '#divInfraBarraComandosSuperior > #btnSalvar, #divInfraBarraComandosInferior > #btnSalvar'
      )
    )
    botoesSalvar.forEach((botao) => {
      botao.disabled = true
    })

    const url = extrairUrlUnidadeSelecionarReabertura(document.head.innerHTML, window.location.href)
    if (!url) {
      botoesSalvar.forEach((botao) => {
        botao.disabled = false
      })
      return
    }

    const resultado = await fetchText(url)
    if (!resultado.ok) {
      botoesSalvar.forEach((botao) => {
        botao.disabled = false
      })
      return
    }

    const doc = new DOMParser().parseFromString(resultado.data, 'text/html')
    const linhas = doc.querySelectorAll('#divInfraAreaTabela > table > tbody > tr')
    const totalUnidades = Math.max(linhas.length - 1, 0)
    const totalFechadas = doc.querySelectorAll('#divInfraAreaTabela > table > tbody > tr > td > input').length

    if (processoFechadoEmTodasUnidades(totalUnidades, totalFechadas)) {
      const aviso = document.createElement('span')
      aviso.id = 'seirmg-alerta-unidades-reabertura'
      aviso.style.cssText = 'background-color: yellow; color: black; padding: 5px; float: left;'
      aviso.textContent = 'O processo não está aberto em nenhuma unidade! Favor verificar.'
      document.querySelector('#divInfraBarraComandosSuperior')?.appendChild(aviso)

      botoesSalvar.forEach((botao) => {
        botao.addEventListener('click', (evento) => {
          const selectDisponivel = document.querySelector('#selUnidadesReabertura option')
          if (!selectDisponivel) {
            evento.preventDefault()
            alert('O processo não está aberto em nenhuma unidade! Favor verificar')
            document
              .getElementById('selUnidadesReabertura')
              ?.style.setProperty('background-color', 'red', 'important')
          }
        })
      })
    }

    botoesSalvar.forEach((botao) => {
      botao.disabled = false
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao verificar reabertura de processo:', error)
  }
}

bootstrap()
```

- [ ] **Step 2: Rodar toda a suíte de testes para confirmar que nada quebrou**

Run: `cd C:\sei\seirmg && bunx vitest run`
Expected: todos os testes continuam passando (212 testes no total — 208 antes deste plano + 2 (Task 1) + 2 (Task 2) = 212)

- [ ] **Step 3: Rodar o build**

Run: `bun run build`
Expected: sucesso, sem erros de tipo. Se houver erro, rode `bun run typecheck`.

- [ ] **Step 4: Commit**

```bash
git add src/content-scripts/documento_receber/index.ts
git commit -m "feat(documento-receber): wire autopreencher documento externo"
```

---

### Task 4: `options/index.html` + `options/main.ts` — aba Editor de Documentos

**Files:**
- Modify: `C:\sei\seirmg\src\options\index.html`
- Modify: `C:\sei\seirmg\src\options\main.ts`

**Contexto**: DOM-heavy, não coberto por TDD, verificado via build. Primeira implementação real da aba Editor de Documentos (hoje placeholder).

**Interfaces:**
- Consumes: `createSyncConfigStore`, `type FormatoDocumento`, `type NivelAcessoDocumento` (`../lib/storage`)

- [ ] **Step 1: Substituir a seção `#painel-editor` em `src/options/index.html`**

Trecho atual:

```html
    <section id="painel-editor" class="painel">
      <p>Em breve: funcionalidades herdadas do editor de documentos do Sei Pro.</p>
    </section>
```

Substituir por:

```html
    <section id="painel-editor" class="painel">
      <h2>Editor de Documentos</h2>
      <h3>Autopreencher Documento Externo</h3>
      <label>
        <input type="checkbox" id="editor-doc-externo-ativo" />
        Ativar autopreenchimento ao receber documento externo
      </label>
      <br />
      <label>
        Formato:
        <select id="editor-doc-externo-formato">
          <option value="N">Nato-digital</option>
          <option value="D">Digitalizado</option>
        </select>
      </label>
      <br />
      <label>
        Tipo de conferência (quando digitalizado):
        <input type="text" id="editor-doc-externo-tipo-conferencia" />
      </label>
      <br />
      <label>
        Nível de acesso:
        <select id="editor-doc-externo-nivel-acesso">
          <option value="P">Público</option>
          <option value="R">Restrito</option>
          <option value="S">Sigiloso</option>
        </select>
      </label>
      <br />
      <label>
        Hipótese legal (quando restrito/sigiloso):
        <input type="text" id="editor-doc-externo-hipotese-legal" />
      </label>
      <br />
      <button id="editor-salvar">Salvar</button>
      <span id="editor-status"></span>
    </section>
```

- [ ] **Step 2: Adicionar `carregarAbaEditor` em `src/options/main.ts`**

Modificar o import do topo do arquivo:

Atual:

```ts
import {
  createSyncConfigStore,
  type ConfiguracaoCor,
  type ConfiguracaoPontoControle,
  type ModoEspecificacao,
  type ThemePreset,
} from '../lib/storage'
```

Substituir por:

```ts
import {
  createSyncConfigStore,
  type ConfiguracaoCor,
  type ConfiguracaoPontoControle,
  type FormatoDocumento,
  type ModoEspecificacao,
  type NivelAcessoDocumento,
  type ThemePreset,
} from '../lib/storage'
```

Trecho final do arquivo, atual:

```ts
carregarAbaProcessos()
carregarAbaAparencia()
carregarAbaGeral()
carregarAbaAssinatura()
carregarSecaoProcessosNovos()
```

Substituir por (adiciona `carregarAbaEditor` antes das cinco funções já existentes, sem tocar nelas):

```ts
async function carregarAbaEditor(): Promise<void> {
  try {
    const store = createSyncConfigStore()
    const config = await store.get()

    const inputAtivo = document.getElementById('editor-doc-externo-ativo') as HTMLInputElement | null
    const selectFormato = document.getElementById('editor-doc-externo-formato') as HTMLSelectElement | null
    const inputTipoConferencia = document.getElementById(
      'editor-doc-externo-tipo-conferencia'
    ) as HTMLInputElement | null
    const selectNivelAcesso = document.getElementById(
      'editor-doc-externo-nivel-acesso'
    ) as HTMLSelectElement | null
    const inputHipoteseLegal = document.getElementById(
      'editor-doc-externo-hipotese-legal'
    ) as HTMLInputElement | null
    const status = document.getElementById('editor-status')

    if (inputAtivo) inputAtivo.checked = config.documentoExterno.ativo
    if (selectFormato) selectFormato.value = config.documentoExterno.formato
    if (inputTipoConferencia) inputTipoConferencia.value = config.documentoExterno.tipoConferencia
    if (selectNivelAcesso) selectNivelAcesso.value = config.documentoExterno.nivelAcesso
    if (inputHipoteseLegal) inputHipoteseLegal.value = config.documentoExterno.hipoteseLegal

    document.getElementById('editor-salvar')?.addEventListener('click', async () => {
      try {
        const atualizado = {
          ...config,
          documentoExterno: {
            ativo: inputAtivo?.checked ?? true,
            formato: (selectFormato?.value ?? 'N') as FormatoDocumento,
            tipoConferencia: inputTipoConferencia?.value ?? '',
            nivelAcesso: (selectNivelAcesso?.value ?? 'P') as NivelAcessoDocumento,
            hipoteseLegal: inputHipoteseLegal?.value ?? '',
          },
        }
        await store.set(atualizado)
        if (status) {
          status.textContent = 'Salvo!'
          setTimeout(() => {
            status.textContent = ''
          }, 2000)
        }
      } catch (error) {
        console.error('[SEIRMG] Falha ao salvar configuração da aba Editor de Documentos:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao carregar aba Editor de Documentos:', error)
  }
}

carregarAbaEditor()
carregarAbaProcessos()
carregarAbaAparencia()
carregarAbaGeral()
carregarAbaAssinatura()
carregarSecaoProcessosNovos()
```

- [ ] **Step 3: Rodar toda a suíte e o build**

Run: `cd C:\sei\seirmg && bunx vitest run && bun run build`
Expected: todos os testes continuam passando (212), build sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/options/index.html src/options/main.ts
git commit -m "feat(options): implement Editor de Documentos tab with autopreencher config"
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
Expected: os 4 comandos terminam com código de saída 0. `bun run test` reporta 212 testes, todos passando.

- [ ] **Step 2: Validar o `manifest.json` gerado e confirmar que as permissões não mudaram**

Run: `node -e "const m = JSON.parse(require('fs').readFileSync('dist/manifest.json', 'utf8')); console.log('manifest.json válido'); console.log(JSON.stringify(m.permissions))"`
Expected: `manifest.json válido` seguido de `["storage","notifications","alarms","tabs"]` — exatamente as mesmas permissões de antes.

---

## Self-Review (checklist do autor do plano)

1. **Cobertura da spec**: schema `documentoExterno` (Task 1), `formatarDataHoje` (Task 2), wiring completo com defaults conservadores e `.click()` nos rádios (Task 3), aba Editor de Documentos (Task 4). Todas as seções da spec têm task correspondente.
2. **Placeholders**: nenhum "TBD"/"TODO"; todo código de teste e implementação está completo e literal.
3. **Consistência de tipos**: `DocumentoExternoConfig`/`FormatoDocumento`/`NivelAcessoDocumento` (Task 1) usados identicamente pelo wiring (Task 3) e pela aba de opções (Task 4).
4. **Contagem de testes**: 208 (baseline antes deste plano) + 2 (Task 1) + 2 (Task 2) = 212 testes esperados ao final da Task 3 em diante.
