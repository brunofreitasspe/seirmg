# SEIRMG — Lote P: Menu e UX Diversos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar `ocultarMenuAutomaticamente.js`, `moveLinkMenu.js`, `atalhoPublicacoesEletronicas.js`, `linkNeutroControleProcessos.js` e `indicarConfiguracao.js` do Sei++, estendendo o `content-scripts/core/index.ts` já existente (todas rodam em toda página, mesmo escopo do `core`).

**Architecture:** Ver `docs/superpowers/specs/2026-07-07-seirmg-lote-p-menu-ux-design.md`. Lógica pura mínima em `features/core/` e `lib/seiVersion.ts` (estendido, sem tocar na função já existente); wiring estendendo `background/index.ts` e `content-scripts/core/index.ts`.

**Tech Stack:** TypeScript, Vite, `@crxjs/vite-plugin`, Bun, Vitest — mesma infraestrutura já existente. Sem dependência nova (reaproveita `lucide-static`, já usado em `options/main.ts`).

## Global Constraints

- Nenhum bloco de `content_scripts` novo, nenhuma permissão nova.
- `detectarSeiVersaoMajor` é uma função **nova**, adicionada ao lado de `detectarSeiVersionAtLeast4` já existente em `lib/seiVersion.ts` — não modifica a função já testada.
- `mostrarIndicadorConfiguracao` substitui o `SavedOptions.InstallOrUpdate` do original — setado no `chrome.runtime.onInstalled` já existente em `background/index.ts`.
- Ícone do menu movido usa `lucide-static/icons/menu.svg?raw` (mesmo padrão já usado para o ícone de sino em `options/main.ts`) em vez do asset `icons/menu.svg` do original, que não existe no SEIRMG.
- Todo listener/callback assíncrono novo segue o padrão já estabelecido: guard `try/catch` por etapa, loga via `console.error('[SEIRMG] ...', error)`, nunca lança exceção não tratada.

---

## Mapa de arquivos (visão geral)

```
seirmg/
├── src/
│   ├── lib/
│   │   ├── seiVersion.ts (modificado)
│   │   └── storage.ts (modificado)
│   ├── features/core/
│   │   ├── menu.ts (+ .test.ts, novo)
│   │   └── indicarConfiguracao.ts (+ .test.ts, novo)
│   ├── background/index.ts (modificado)
│   └── content-scripts/core/index.ts (modificado)
```

---

### Task 1: `lib/seiVersion.ts` — `detectarSeiVersaoMajor`

**Files:**
- Modify: `C:\sei\seirmg\src\lib\seiVersion.ts`
- Modify: `C:\sei\seirmg\src\lib\seiVersion.test.ts`

**Interfaces:**
- Consumes: nenhuma
- Produces: `detectarSeiVersaoMajor(doc: Document): number | null`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `src/lib/seiVersion.test.ts` (reaproveita `criarDocumentoComScript` já existente no arquivo):

```ts
describe('detectarSeiVersaoMajor', () => {
  it('retorna o primeiro dígito da versão para 4.x', () => {
    expect(detectarSeiVersaoMajor(criarDocumentoComScript('js/sei.js?4.0.1'))).toBe(4)
  })

  it('retorna o primeiro dígito da versão para 5.x', () => {
    expect(detectarSeiVersaoMajor(criarDocumentoComScript('js/sei.js?5.0.0'))).toBe(5)
  })

  it('retorna null quando a versão não é detectável', () => {
    expect(detectarSeiVersaoMajor(criarDocumentoComScript(null))).toBeNull()
  })
})
```

Modificar o import no topo do arquivo:

Atual:

```ts
import { detectarSeiVersionAtLeast4 } from './seiVersion'
```

Substituir por:

```ts
import { detectarSeiVersaoMajor, detectarSeiVersionAtLeast4 } from './seiVersion'
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/lib/seiVersion.test.ts`
Expected: FAIL — `detectarSeiVersaoMajor` não é exportado por `./seiVersion`

- [ ] **Step 3: Implementar em `src/lib/seiVersion.ts`**

Adicionar ao final do arquivo (sem modificar `detectarSeiVersionAtLeast4` já existente):

```ts
export function detectarSeiVersaoMajor(doc: Document): number | null {
  const script = doc.querySelector('script[src*="sei.js?"]')
  const src = script?.getAttribute('src') ?? ''
  const match = src.match(/sei\.js\?(\d+)/)
  if (!match) return null
  return Number(match[1][0])
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/lib/seiVersion.test.ts`
Expected: PASS (7 testes — 4 já existentes + 3 novos)

- [ ] **Step 5: Commit**

```bash
git add src/lib/seiVersion.ts src/lib/seiVersion.test.ts
git commit -m "feat(sei-version): add major version number detection"
```

---

### Task 2: `lib/storage.ts` — novos campos de `LocalConfig`

**Files:**
- Modify: `C:\sei\seirmg\src\lib\storage.ts`
- Modify: `C:\sei\seirmg\src\lib\storage.test.ts`

**Interfaces:**
- Consumes: nenhuma
- Produces: `LocalConfig.mostrarIndicadorConfiguracao?: boolean`; `LocalConfig.linkNeutroControleProcessos?: string`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final do `describe('createLocalConfigStore', ...)` já existente em `src/lib/storage.test.ts`:

```ts
  it('persiste mostrarIndicadorConfiguracao e linkNeutroControleProcessos', async () => {
    const area = criarAreaFalsa()
    const store = createLocalConfigStore(area)
    const atualizado = {
      ...DEFAULT_LOCAL_CONFIG,
      mostrarIndicadorConfiguracao: true,
      linkNeutroControleProcessos: 'controlador.php?acao=procedimento_controlar&x=1',
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/lib/storage.test.ts`
Expected: FAIL — erro de tipo, os campos não existem em `LocalConfig`

- [ ] **Step 3: Implementar em `src/lib/storage.ts`**

Modificar `LocalConfig` (adicionar os dois campos depois de `atribuicaoSelecionada`):

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
  mostrarIndicadorConfiguracao?: boolean
  linkNeutroControleProcessos?: string
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/lib/storage.test.ts`
Expected: PASS (20 testes — 19 já existentes + 1 novo)

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "feat(storage): add mostrarIndicadorConfiguracao and linkNeutroControleProcessos"
```

---

### Task 3: `features/core/menu.ts`

**Files:**
- Create: `C:\sei\seirmg\src\features\core\menu.ts`
- Test: `C:\sei\seirmg\src\features\core\menu.test.ts`

**Contexto**: porte de `C:\sei\seiplus\cs_modules\core\idle\ocultarMenuAutomaticamente.js`.

**Interfaces:**
- Consumes: nenhuma
- Produces: `deveOcultarMenu(classes: string[]): boolean`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/features/core/menu.test.ts
import { describe, expect, it } from 'vitest'
import { deveOcultarMenu } from './menu'

describe('deveOcultarMenu', () => {
  it('retorna true quando a classe de exibição grande está presente', () => {
    expect(deveOcultarMenu(['infraAreaTelaE', 'infraAreaTelaEExibeGrande'])).toBe(true)
  })

  it('retorna false quando a classe não está presente', () => {
    expect(deveOcultarMenu(['infraAreaTelaE'])).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/features/core/menu.test.ts`
Expected: FAIL — `Cannot find module './menu'`

- [ ] **Step 3: Implementar `src/features/core/menu.ts`**

```ts
export function deveOcultarMenu(classes: string[]): boolean {
  return classes.includes('infraAreaTelaEExibeGrande')
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/features/core/menu.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add src/features/core/menu.ts src/features/core/menu.test.ts
git commit -m "feat(core): add auto-hide menu predicate"
```

---

### Task 4: `features/core/indicarConfiguracao.ts`

**Files:**
- Create: `C:\sei\seirmg\src\features\core\indicarConfiguracao.ts`
- Test: `C:\sei\seirmg\src\features\core\indicarConfiguracao.test.ts`

**Contexto**: porte de `C:\sei\seiplus\cs_modules\core\idle\indicarConfiguracao.js`.

**Interfaces:**
- Consumes: nenhuma
- Produces: `estaNaTelaDeConfiguracao(url: string): boolean`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/features/core/indicarConfiguracao.test.ts
import { describe, expect, it } from 'vitest'
import { estaNaTelaDeConfiguracao } from './indicarConfiguracao'

describe('estaNaTelaDeConfiguracao', () => {
  it('retorna true quando a url é a tela de configuração', () => {
    expect(
      estaNaTelaDeConfiguracao('https://sei.exemplo.br/controlador.php?acao=infra_configurar')
    ).toBe(true)
  })

  it('retorna false para outras urls', () => {
    expect(
      estaNaTelaDeConfiguracao('https://sei.exemplo.br/controlador.php?acao=procedimento_controlar')
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/features/core/indicarConfiguracao.test.ts`
Expected: FAIL — `Cannot find module './indicarConfiguracao'`

- [ ] **Step 3: Implementar `src/features/core/indicarConfiguracao.ts`**

```ts
export function estaNaTelaDeConfiguracao(url: string): boolean {
  return url.includes('controlador.php?acao=infra_configurar')
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/features/core/indicarConfiguracao.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add src/features/core/indicarConfiguracao.ts src/features/core/indicarConfiguracao.test.ts
git commit -m "feat(core): add configuração screen detection predicate"
```

---

### Task 5: `background/index.ts` — marcar indicador de configuração na instalação

**Files:**
- Modify: `C:\sei\seirmg\src\background\index.ts`

**Contexto**: wiring fino, estende o listener `chrome.runtime.onInstalled` já existente. Não é coberto por TDD — verificado via build.

**Interfaces:**
- Consumes: `createLocalConfigStore` (já importado)

- [ ] **Step 1: Adicionar `marcarIndicadorConfiguracao` e chamá-la no `onInstalled`**

Trecho atual:

```ts
async function abrirOuFocarAba(baseUrlSei: string, url: string): Promise<void> {
  const [abaExistente] = await chrome.tabs.query({ url: `${baseUrlSei}/*` })

  if (abaExistente?.id) {
    chrome.tabs.update(abaExistente.id, { active: true, url })
    if (abaExistente.windowId) chrome.windows.update(abaExistente.windowId, { focused: true })
  } else {
    chrome.tabs.create({ url })
  }
}

chrome.runtime.onInstalled.addListener(() => {
  agendarAlarme().catch((error) => {
    console.error('[SEIRMG] Falha ao agendar alarme do bloco de assinatura:', error)
  })
  agendarAlarmeProcessosNovos().catch((error) => {
    console.error('[SEIRMG] Falha ao agendar alarme de processos novos:', error)
  })
})
```

Substituir por:

```ts
async function abrirOuFocarAba(baseUrlSei: string, url: string): Promise<void> {
  const [abaExistente] = await chrome.tabs.query({ url: `${baseUrlSei}/*` })

  if (abaExistente?.id) {
    chrome.tabs.update(abaExistente.id, { active: true, url })
    if (abaExistente.windowId) chrome.windows.update(abaExistente.windowId, { focused: true })
  } else {
    chrome.tabs.create({ url })
  }
}

async function marcarIndicadorConfiguracao(): Promise<void> {
  const localStore = createLocalConfigStore()
  const localConfig = await localStore.get()
  await localStore.set({ ...localConfig, mostrarIndicadorConfiguracao: true })
}

chrome.runtime.onInstalled.addListener(() => {
  agendarAlarme().catch((error) => {
    console.error('[SEIRMG] Falha ao agendar alarme do bloco de assinatura:', error)
  })
  agendarAlarmeProcessosNovos().catch((error) => {
    console.error('[SEIRMG] Falha ao agendar alarme de processos novos:', error)
  })
  marcarIndicadorConfiguracao().catch((error) => {
    console.error('[SEIRMG] Falha ao marcar indicador de configuração pendente:', error)
  })
})
```

- [ ] **Step 2: Rodar toda a suíte e o build**

Run: `cd C:\sei\seirmg && bunx vitest run && bun run build`
Expected: todos os testes continuam passando (220 — ver contagem completa na Task 6), build sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/background/index.ts
git commit -m "feat(background): mark configuração indicator on install"
```

---

### Task 6: `content-scripts/core/index.ts` — wiring completo

**Files:**
- Modify: `C:\sei\seirmg\src\content-scripts\core\index.ts`

**Contexto**: wiring fino, conecta DOM à lógica já testada. Não é coberta por TDD — verificado via build. Todas as 5 etapas novas rodam depois do `renderBadge()` já existente, cada uma em seu próprio `try/catch`.

**Interfaces:**
- Consumes: `deveOcultarMenu` (Task 3); `estaNaTelaDeConfiguracao` (Task 4); `detectarSeiVersaoMajor` (Task 1); `createLocalConfigStore` (`../../lib/storage`)

- [ ] **Step 1: Substituir `src/content-scripts/core/index.ts`**

Arquivo atual:

```ts
import { createLocalConfigStore } from '../../lib/storage'
import { detectarSeiVersionAtLeast4 } from '../../lib/seiVersion'
import { renderBadge } from './badge'

function detectarUrlBaseSei(): string {
  return `${window.location.origin}${window.location.pathname.split('/controlador')[0]}`
}

async function bootstrap(): Promise<void> {
  try {
    const localStore = createLocalConfigStore()
    const localConfig = await localStore.get()

    const urlBase = detectarUrlBaseSei()
    const seiVersionAtLeast4 = detectarSeiVersionAtLeast4(document)
    if (localConfig.baseUrlSei !== urlBase || localConfig.seiVersionAtLeast4 !== seiVersionAtLeast4) {
      await localStore.set({ ...localConfig, baseUrlSei: urlBase, seiVersionAtLeast4 })
    }

    chrome.runtime.sendMessage({ type: 'seirmg:sei-detectado' }).catch((error) => {
      console.error('[SEIRMG] Falha ao notificar sessão do SEI detectada:', error)
    })

    await renderBadge()
  } catch (error) {
    console.error('[SEIRMG] Falha ao inicializar core:', error)
  }
}

bootstrap()
```

Substituir por:

```ts
import menuIconSvg from 'lucide-static/icons/menu.svg?raw'
import { createLocalConfigStore } from '../../lib/storage'
import { detectarSeiVersaoMajor, detectarSeiVersionAtLeast4 } from '../../lib/seiVersion'
import { deveOcultarMenu } from '../../features/core/menu'
import { estaNaTelaDeConfiguracao } from '../../features/core/indicarConfiguracao'
import { renderBadge } from './badge'

function detectarUrlBaseSei(): string {
  return `${window.location.origin}${window.location.pathname.split('/controlador')[0]}`
}

function ocultarMenuAutomaticamente(): void {
  try {
    const menu = document.getElementById('divInfraAreaTelaE')
    if (!menu) return
    if (deveOcultarMenu(Array.from(menu.classList))) {
      const iconMenu = document.getElementById('lnkInfraMenuSistema') as HTMLElement | null
      iconMenu?.click()
    }
  } catch (error) {
    console.error('[SEIRMG] Falha ao ocultar menu automaticamente:', error)
  }
}

function moverLinkMenu(): void {
  try {
    const versaoMajor = detectarSeiVersaoMajor(document)
    if (versaoMajor !== null && versaoMajor >= 5) return

    const menu = document.getElementById('lnkInfraMenuSistema')
    if (!menu) return

    const menuContainerDestino = document.getElementById('divInfraBarraSistemaPadraoE')
    if (!menuContainerDestino) return

    menu.querySelector('span')?.remove()
    menu.insertAdjacentHTML('afterbegin', menuIconSvg)

    const div = document.createElement('div')
    div.className = 'align-self-center'
    menu.className = 'align-self-center'
    div.appendChild(menu)
    menuContainerDestino.prepend(div)

    document.querySelector('#divInfraBarraSistemaPadraoD #lnkInfraMenuSistema')?.remove()
  } catch (error) {
    console.error('[SEIRMG] Falha ao mover link do menu:', error)
  }
}

function montarAtalhoPublicacoes(baseUrlSei: string): void {
  try {
    const url = `${baseUrlSei}/publicacoes/controlador_publicacoes.php?acao=publicacao_pesquisar&id_orgao_publicacao=0`
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error('Página de publicações não existe')

        const a = document.createElement('a')
        a.href = url
        a.title = 'Publicações Eletrônicas'
        a.target = '_blank'
        a.textContent = 'Publicações Eletrônicas'

        const div = document.createElement('div')
        div.className = 'seirmg-atalho-publicacoes-eletronicas'
        div.appendChild(a)

        document.getElementById('divInfraBarraSistemaPadraoD')?.prepend(div)
      })
      .catch((error) => {
        console.error('[SEIRMG] Falha ao verificar/montar atalho de publicações eletrônicas:', error)
      })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar atalho de publicações eletrônicas:', error)
  }
}

async function sincronizarLinkNeutroControleProcessos(): Promise<void> {
  try {
    const form = document.getElementById('frmProcedimentoControlar')
    const localStore = createLocalConfigStore()
    const localConfig = await localStore.get()
    const actionAtual = form?.getAttribute('action')

    if (actionAtual) {
      if (localConfig.linkNeutroControleProcessos !== actionAtual) {
        await localStore.set({ ...localConfig, linkNeutroControleProcessos: actionAtual })
      }
      return
    }

    if (localConfig.linkNeutroControleProcessos) {
      const linkCP = document.getElementById('lnkControleProcessos')
      linkCP?.setAttribute('href', localConfig.linkNeutroControleProcessos)
      linkCP?.removeAttribute('onclick')
    }
  } catch (error) {
    console.error('[SEIRMG] Falha ao sincronizar link neutro de Controle de Processos:', error)
  }
}

const ESTILO_INDICADOR_CONFIGURACAO = `
  @keyframes seirmg-pulso-configuracao {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
  .seirmg-indicador-configuracao {
    animation: seirmg-pulso-configuracao 1s infinite;
  }
`

async function indicarConfiguracao(): Promise<void> {
  try {
    const localStore = createLocalConfigStore()
    const localConfig = await localStore.get()
    if (!localConfig.mostrarIndicadorConfiguracao) return

    const icone = document.querySelector(
      '#lnkConfiguracaoSistema img, #lnkConfiguracaoSistema i, #lnkInfraConfiguracaoSistema img'
    )
    if (!icone) return

    if (!document.getElementById('seirmg-estilo-indicador-configuracao')) {
      const style = document.createElement('style')
      style.id = 'seirmg-estilo-indicador-configuracao'
      style.textContent = ESTILO_INDICADOR_CONFIGURACAO
      document.head.appendChild(style)
    }

    icone.classList.add('seirmg-indicador-configuracao')

    if (estaNaTelaDeConfiguracao(document.URL)) {
      await localStore.set({ ...localConfig, mostrarIndicadorConfiguracao: false })
      icone.classList.remove('seirmg-indicador-configuracao')
    }
  } catch (error) {
    console.error('[SEIRMG] Falha ao indicar configuração pendente:', error)
  }
}

async function bootstrap(): Promise<void> {
  try {
    const localStore = createLocalConfigStore()
    const localConfig = await localStore.get()

    const urlBase = detectarUrlBaseSei()
    const seiVersionAtLeast4 = detectarSeiVersionAtLeast4(document)
    if (localConfig.baseUrlSei !== urlBase || localConfig.seiVersionAtLeast4 !== seiVersionAtLeast4) {
      await localStore.set({ ...localConfig, baseUrlSei: urlBase, seiVersionAtLeast4 })
    }

    chrome.runtime.sendMessage({ type: 'seirmg:sei-detectado' }).catch((error) => {
      console.error('[SEIRMG] Falha ao notificar sessão do SEI detectada:', error)
    })

    await renderBadge()

    ocultarMenuAutomaticamente()
    moverLinkMenu()
    montarAtalhoPublicacoes(urlBase)
    await sincronizarLinkNeutroControleProcessos()
    await indicarConfiguracao()
  } catch (error) {
    console.error('[SEIRMG] Falha ao inicializar core:', error)
  }
}

bootstrap()
```

- [ ] **Step 2: Rodar toda a suíte de testes para confirmar que nada quebrou**

Run: `cd C:\sei\seirmg && bunx vitest run`
Expected: todos os testes continuam passando (220 testes no total — 212 antes deste plano + 3 (Task 1) + 1 (Task 2) + 2 (Task 3) + 2 (Task 4) = 220)

- [ ] **Step 3: Rodar o build**

Run: `bun run build`
Expected: sucesso, sem erros de tipo. Se houver erro, rode `bun run typecheck`.

- [ ] **Step 4: Commit**

```bash
git add src/content-scripts/core/index.ts
git commit -m "feat(core): wire auto-hide menu, move menu link, publicações shortcut, link neutro and indicador de configuração"
```

---

### Task 7: Checagem final (typecheck/lint/test/build/manifest)

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
Expected: os 4 comandos terminam com código de saída 0. `bun run test` reporta 220 testes, todos passando.

- [ ] **Step 2: Validar o `manifest.json` gerado e confirmar que as permissões não mudaram**

Run: `node -e "const m = JSON.parse(require('fs').readFileSync('dist/manifest.json', 'utf8')); console.log('manifest.json válido'); console.log(JSON.stringify(m.permissions))"`
Expected: `manifest.json válido` seguido de `["storage","notifications","alarms","tabs"]` — exatamente as mesmas permissões de antes.

---

## Self-Review (checklist do autor do plano)

1. **Cobertura da spec**: `detectarSeiVersaoMajor` (Task 1), campos novos de `LocalConfig` (Task 2), `deveOcultarMenu` (Task 3), `estaNaTelaDeConfiguracao` (Task 4), marcação do indicador na instalação (Task 5), wiring completo das 5 features no `core` (Task 6). Todas as seções da spec têm task correspondente.
2. **Placeholders**: nenhum "TBD"/"TODO"; todo código de teste e implementação está completo e literal.
3. **Consistência de tipos**: `deveOcultarMenu`/`estaNaTelaDeConfiguracao`/`detectarSeiVersaoMajor` (Tasks 1, 3, 4) consumidos identicamente pelo wiring (Task 6). `mostrarIndicadorConfiguracao`/`linkNeutroControleProcessos` (Task 2) usados identicamente por `background/index.ts` (Task 5) e `content-scripts/core/index.ts` (Task 6).
4. **Contagem de testes**: 212 (baseline antes deste plano) + 3 (Task 1) + 1 (Task 2) + 2 (Task 3) + 2 (Task 4) = 220 testes esperados ao final da Task 6 em diante.
