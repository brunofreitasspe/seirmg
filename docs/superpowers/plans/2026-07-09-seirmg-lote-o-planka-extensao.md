# SEIRMG — Lote O (parte 2): Extensão consome Planka via n8n — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a extensão logar no backend n8n (Workflow 1), consultar o card do Planka correspondente ao processo aberto (Workflow 2) e mostrar Tipo de Processo/Localização/Último Comentário na tela do processo do SEI, com uma tela de configuração/login na aba Integrações já existente em Options.

**Architecture:** Token JWT vive só em `chrome.storage.local` (via `LocalConfig`, nunca `sync`). Login (Options) e consulta (content script `procedimento_visualizar`) chamam os webhooks do n8n com `fetch()` direto — sem relay pelo `background`, já que o motivo que justifica isso pro SEI (session gate) não existe aqui. CORS é resolvido com `optional_host_permissions` + `chrome.permissions.request()` no clique do botão "Entrar". Nenhuma verificação de assinatura do JWT acontece no cliente — o decode é só pra saber quando parar de usar um token vencido.

**Tech Stack:** TypeScript + Vite/CRXJS + Bun + Vitest (mesmo stack da extensão, sem infraestrutura nova).

## Global Constraints

- Token/e-mail/URL do Planka vivem em `LocalConfig` (`chrome.storage.local`), nunca em `SyncConfig`/`chrome.storage.sync`.
- `chrome.permissions.request()` precisa ser chamado como a primeira operação assíncrona dentro do handler de clique do botão "Entrar" (sem `await` antes) — Chrome só concede a permissão dentro do gesto do usuário.
- Login e consulta usam `fetch()` direto (Options e content script) — não há mensagem nova pro `background`.
- Nenhuma verificação de assinatura do JWT no cliente — só decodificar o payload (base64url) pra ler o claim `exp`.
- DOM/`chrome.*` em content-scripts e `options/main.ts` não tem teste automatizado direto (padrão já estabelecido no projeto) — só lógica pura em `src/features/` é testada via Vitest. Todo entry point de content-script/listener precisa de try/catch (nunca deixar exceção não tratada cruzar a fronteira).
- Card no processo não mostra os campos "Detalhe" (é o próprio NUP, já visível na página) nem "Nome do Processo" (não pedido).

---

### Task 1: `PlankaConfig` em `LocalConfig`

**Files:**
- Modify: `src/lib/storage.ts`
- Test: `src/lib/storage.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `PlankaConfig` interface (`baseUrl?`, `email?`, `urlCadastro?`, `token?`, `tokenExp?`), `LocalConfig.planka?: PlankaConfig` — usado pelas Tasks 3 e 4.

**Nota sobre TDD nesta task:** diferente das próximas, esta é só a adição de um campo opcional a uma interface TypeScript persistida por um storage genérico (sem validação de schema em runtime — o mesmo já é verdade pra todos os outros campos opcionais de `LocalConfig`, ver `atribuicaoSelecionada` em `storage.test.ts`). Um teste de round-trip não tem como falhar de verdade antes da mudança (TypeScript não bloqueia propriedades extras em objetos já nomeados, e o storage falso não valida schema) — por isso não há um passo "confirme que falha" aqui; o teste serve como guarda de regressão daqui pra frente, não como prova desta task. Precedente já aceito neste projeto (ver nota do revisor na Task 1 do primeiro plano do projeto).

- [ ] **Step 1: Adicionar `PlankaConfig` e o campo em `LocalConfig`**

Em `src/lib/storage.ts`, adicionar logo antes de `export interface LocalConfig {`:

```ts
export interface PlankaConfig {
  baseUrl?: string
  email?: string
  urlCadastro?: string
  token?: string
  tokenExp?: number
}
```

E dentro de `export interface LocalConfig { ... }`, adicionar a última linha antes do fechamento:

```ts
  planka?: PlankaConfig
```

(`LocalConfig` fica com todos os campos já existentes mais essa linha — não mexer em mais nada da interface.)

- [ ] **Step 2: Escrever o teste de round-trip**

Em `src/lib/storage.test.ts`, dentro do `describe('createLocalConfigStore', ...)`, adicionar (depois do teste `'persiste atribuicaoSelecionada'`):

```ts
  it('persiste planka', async () => {
    const area = criarAreaFalsa()
    const store = createLocalConfigStore(area)
    const atualizado = {
      ...DEFAULT_LOCAL_CONFIG,
      planka: {
        baseUrl: 'https://n8n.exemplo.com',
        email: 'usuario@exemplo.com',
        urlCadastro: 'https://n8n.exemplo.com/form/abc123',
        token: 'aaa.bbb.ccc',
        tokenExp: 1799999999,
      },
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })
```

- [ ] **Step 3: Rodar o teste e confirmar que passa**

Run: `cd C:\sei\seirmg && bunx vitest run src/lib/storage.test.ts`
Expected: PASS — todos os testes do arquivo, incluindo o novo.

- [ ] **Step 4: Rodar o typecheck**

Run: `bunx tsc --noEmit`
Expected: sem erros (confirma que `PlankaConfig`/`planka?` foram adicionados sem quebrar nenhum outro uso de `LocalConfig`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "feat(planka): add PlankaConfig field to LocalConfig"
```

---

### Task 2: Decodificação de payload JWT e checagem de validade (lógica pura)

**Files:**
- Create: `src/features/planka/token.ts`
- Test: `src/features/planka/token.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `decodificarPayloadJwtSemVerificar(token: string): Record<string, unknown> | null`, `tokenValido(tokenExp: number | undefined, agoraIso: string): boolean` — usados pelas Tasks 3 e 4.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `src/features/planka/token.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { decodificarPayloadJwtSemVerificar, tokenValido } from './token'

function construirToken(payload: Record<string, unknown>): string {
  const base64url = (obj: unknown): string =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const header = base64url({ alg: 'HS256', typ: 'JWT' })
  const body = base64url(payload)
  return `${header}.${body}.assinatura-fake`
}

describe('decodificarPayloadJwtSemVerificar', () => {
  it('decodifica um payload válido', () => {
    const token = construirToken({ userId: 1, email: 'a@b.com', exp: 1999999999 })
    expect(decodificarPayloadJwtSemVerificar(token)).toEqual({
      userId: 1,
      email: 'a@b.com',
      exp: 1999999999,
    })
  })

  it('retorna null para token com menos de 3 partes', () => {
    expect(decodificarPayloadJwtSemVerificar('apenas-uma-parte')).toBeNull()
  })

  it('retorna null para token com mais de 3 partes', () => {
    expect(decodificarPayloadJwtSemVerificar('a.b.c.d')).toBeNull()
  })

  it('retorna null quando a parte do payload não é JSON válido', () => {
    const payloadInvalido = btoa('não é json').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(decodificarPayloadJwtSemVerificar(`header.${payloadInvalido}.assinatura`)).toBeNull()
  })
})

describe('tokenValido', () => {
  it('é falso quando tokenExp está ausente', () => {
    expect(tokenValido(undefined, '2026-07-09T12:00:00.000Z')).toBe(false)
  })

  it('é falso quando tokenExp já passou', () => {
    const agora = new Date('2026-07-09T12:00:00.000Z')
    const tokenExpNoPassado = Math.floor(agora.getTime() / 1000) - 10
    expect(tokenValido(tokenExpNoPassado, agora.toISOString())).toBe(false)
  })

  it('é verdadeiro quando tokenExp está no futuro', () => {
    const agora = new Date('2026-07-09T12:00:00.000Z')
    const tokenExpNoFuturo = Math.floor(agora.getTime() / 1000) + 3600
    expect(tokenValido(tokenExpNoFuturo, agora.toISOString())).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd C:\sei\seirmg && bunx vitest run src/features/planka/token.test.ts`
Expected: FAIL — `Cannot find module './token'`.

- [ ] **Step 3: Implementar `src/features/planka/token.ts`**

Este arquivo roda no navegador (content-script/Options), não no Node — por isso usa `atob`/`decodeURIComponent`, nunca `Buffer` (diferente de `infra/planka-auth/jwt.ts`, que é Node-only e não é importado aqui).

```ts
function base64UrlDecodeParaTexto(segmento: string): string {
  let normalizado = segmento.replace(/-/g, '+').replace(/_/g, '/')
  while (normalizado.length % 4) normalizado += '='
  return decodeURIComponent(
    atob(normalizado)
      .split('')
      .map((caractere) => '%' + caractere.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('')
  )
}

export function decodificarPayloadJwtSemVerificar(token: string): Record<string, unknown> | null {
  const partes = token.split('.')
  if (partes.length !== 3) return null
  try {
    return JSON.parse(base64UrlDecodeParaTexto(partes[1])) as Record<string, unknown>
  } catch {
    return null
  }
}

export function tokenValido(tokenExp: number | undefined, agoraIso: string): boolean {
  if (tokenExp === undefined) return false
  return tokenExp > new Date(agoraIso).getTime() / 1000
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bunx vitest run src/features/planka/token.test.ts`
Expected: PASS — 7 testes.

- [ ] **Step 5: Commit**

```bash
git add src/features/planka/token.ts src/features/planka/token.test.ts
git commit -m "feat(planka): add browser-safe JWT payload decode and validity check"
```

---

### Task 3: Aba Integrações em Options — login/logout com o Planka

**Files:**
- Modify: `manifest.config.ts`
- Modify: `src/options/index.html`
- Modify: `src/options/main.ts`

**Interfaces:**
- Consumes: `createLocalConfigStore` (`src/lib/storage.ts`, já existente), `PlankaConfig` (Task 1), `decodificarPayloadJwtSemVerificar`/`tokenValido` (Task 2).
- Produces: nada consumido por outra task deste plano — é a tela que o usuário usa pra logar.

- [ ] **Step 1: Adicionar `optional_host_permissions` ao manifest**

Em `manifest.config.ts`, adicionar a chave `optional_host_permissions` no objeto retornado por `defineManifest`, logo depois de `host_permissions`:

```ts
  host_permissions: [
    '*://*.br/*controlador.php?acao=*',
    '*://*.org/*controlador.php?acao=*',
  ],
  optional_host_permissions: ['*://*/*'],
```

- [ ] **Step 2: Preencher o painel "Integrações" em `src/options/index.html`**

Substituir o conteúdo de `<section id="painel-integracoes" class="painel">` (hoje só `<p>Em breve: configuração da integração com o Planka.</p>`) por:

```html
    <section id="painel-integracoes" class="painel">
      <h2>Integrações</h2>
      <h3>Planka</h3>
      <div id="integracoes-planka-conectado" style="display: none">
        <p>Conectado como <strong id="integracoes-planka-email-conectado"></strong>.</p>
        <button id="integracoes-planka-sair">Sair</button>
      </div>
      <div id="integracoes-planka-formulario">
        <label>
          URL base do n8n:
          <input type="url" id="integracoes-planka-base-url" placeholder="https://n8n.exemplo.com" />
        </label>
        <br />
        <label>
          URL de cadastro:
          <input type="url" id="integracoes-planka-url-cadastro" placeholder="https://n8n.exemplo.com/form/..." />
        </label>
        <br />
        <label>
          E-mail:
          <input type="email" id="integracoes-planka-email" />
        </label>
        <br />
        <label>
          Senha:
          <input type="password" id="integracoes-planka-senha" />
        </label>
        <br />
        <button id="integracoes-planka-entrar">Entrar</button>
      </div>
      <p>
        <a id="integracoes-planka-link-cadastro" href="#" target="_blank" style="display: none"
          >Cadastrar novo usuário</a
        >
      </p>
      <span id="integracoes-status"></span>
    </section>
```

- [ ] **Step 3: Implementar `carregarAbaIntegracoes()` em `src/options/main.ts`**

Adicionar os imports no topo do arquivo (junto aos já existentes):

```ts
import { decodificarPayloadJwtSemVerificar, tokenValido } from '../features/planka/token'
```

Adicionar a função (antes das chamadas finais no fim do arquivo):

```ts
async function carregarAbaIntegracoes(): Promise<void> {
  try {
    const store = createLocalConfigStore()

    const inputBaseUrl = document.getElementById('integracoes-planka-base-url') as HTMLInputElement | null
    const inputUrlCadastro = document.getElementById(
      'integracoes-planka-url-cadastro'
    ) as HTMLInputElement | null
    const inputEmail = document.getElementById('integracoes-planka-email') as HTMLInputElement | null
    const inputSenha = document.getElementById('integracoes-planka-senha') as HTMLInputElement | null
    const divConectado = document.getElementById('integracoes-planka-conectado')
    const spanEmailConectado = document.getElementById('integracoes-planka-email-conectado')
    const divFormulario = document.getElementById('integracoes-planka-formulario')
    const linkCadastro = document.getElementById(
      'integracoes-planka-link-cadastro'
    ) as HTMLAnchorElement | null
    const status = document.getElementById('integracoes-status')

    async function renderizarEstado(): Promise<void> {
      const config = await store.get()
      const planka = config.planka

      if (inputBaseUrl) inputBaseUrl.value = planka?.baseUrl ?? ''
      if (inputUrlCadastro) inputUrlCadastro.value = planka?.urlCadastro ?? ''
      if (inputEmail) inputEmail.value = planka?.email ?? ''

      if (linkCadastro) {
        if (planka?.urlCadastro) {
          linkCadastro.href = planka.urlCadastro
          linkCadastro.style.display = ''
        } else {
          linkCadastro.style.display = 'none'
        }
      }

      const conectado = tokenValido(planka?.tokenExp, new Date().toISOString())
      if (divConectado) divConectado.style.display = conectado ? 'block' : 'none'
      if (divFormulario) divFormulario.style.display = conectado ? 'none' : 'block'
      if (spanEmailConectado) spanEmailConectado.textContent = planka?.email ?? ''
    }

    await renderizarEstado()

    document.getElementById('integracoes-planka-entrar')?.addEventListener('click', async () => {
      try {
        const baseUrl = inputBaseUrl?.value.trim() ?? ''
        const urlCadastro = inputUrlCadastro?.value.trim() ?? ''
        const email = inputEmail?.value.trim() ?? ''
        const senha = inputSenha?.value ?? ''

        if (!baseUrl || !email || !senha) {
          if (status) status.textContent = 'Preencha URL, e-mail e senha.'
          return
        }

        const origem = `${new URL(baseUrl).origin}/*`
        const concedida = await chrome.permissions.request({ origins: [origem] })
        if (!concedida) {
          if (status) status.textContent = 'Permissão negada — não é possível conectar sem acesso ao domínio.'
          return
        }

        const resposta = await fetch(`${baseUrl}/webhook/seirmg-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, senha }),
        })

        if (resposta.status === 401) {
          if (status) status.textContent = 'Credenciais inválidas.'
          return
        }
        if (!resposta.ok) {
          if (status) status.textContent = 'Erro ao conectar ao n8n.'
          return
        }

        const corpo = (await resposta.json()) as { token?: string }
        const payload = corpo.token ? decodificarPayloadJwtSemVerificar(corpo.token) : null
        const tokenExp = typeof payload?.exp === 'number' ? payload.exp : undefined

        if (!corpo.token || tokenExp === undefined) {
          if (status) status.textContent = 'Resposta inesperada do servidor de login.'
          return
        }

        const config = await store.get()
        await store.set({
          ...config,
          planka: { baseUrl, email, urlCadastro, token: corpo.token, tokenExp },
        })

        if (status) status.textContent = ''
        if (inputSenha) inputSenha.value = ''
        await renderizarEstado()
      } catch (error) {
        console.error('[SEIRMG] Falha ao conectar com o Planka:', error)
        if (status) status.textContent = 'Erro ao conectar ao n8n.'
      }
    })

    document.getElementById('integracoes-planka-sair')?.addEventListener('click', async () => {
      try {
        const config = await store.get()
        await store.set({ ...config, planka: undefined })
        if (status) status.textContent = ''
        await renderizarEstado()
      } catch (error) {
        console.error('[SEIRMG] Falha ao desconectar do Planka:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao carregar aba Integrações:', error)
  }
}
```

Adicionar a chamada junto às outras no fim do arquivo:

```ts
carregarAbaIntegracoes()
```

(ao lado de `carregarAbaEditor()`, `carregarAbaProcessos()`, etc. já existentes.)

- [ ] **Step 4: Rodar typecheck e lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add manifest.config.ts src/options/index.html src/options/main.ts
git commit -m "feat(planka): add Integrações tab login/logout flow in Options"
```

---

### Task 4: Card do Planka na tela do processo

**Files:**
- Modify: `src/content-scripts/procedimento_visualizar/index.ts`

**Interfaces:**
- Consumes: `createLocalConfigStore` (`src/lib/storage.ts`), `tokenValido` (Task 2).
- Produces: nada consumido por outra task deste plano.

- [ ] **Step 1: Adicionar os imports**

No topo de `src/content-scripts/procedimento_visualizar/index.ts`, adicionar aos imports já existentes:

```ts
import { createLocalConfigStore } from '../../lib/storage'
import { tokenValido } from '../../features/planka/token'
```

- [ ] **Step 2: Extrair a leitura do número do processo (reaproveitada por `alterarTitulo` e pelo novo painel)**

Adicionar esta função no escopo do módulo (perto de `esperarElemento`):

```ts
function obterNumeroProcesso(): string | null {
  const link = document.querySelector('.infraArvore > a[target="ifrVisualizacao"]')
  if (!link) return null
  return link.textContent?.trim() || null
}
```

Alterar `alterarTitulo()` pra usar essa função em vez de ler `link.textContent` diretamente:

```ts
function alterarTitulo(): void {
  try {
    esperarElemento('body.infraArvore', "a[target$='Visualizacao']", () => {
      try {
        const link = document.querySelector('.infraArvore > a[target="ifrVisualizacao"]')
        if (!link) return
        const tipo = link.getAttribute('title') ?? ''
        const numero = obterNumeroProcesso() ?? ''
        window.parent.document.title = montarTituloJanela(numero, tipo)
      } catch (error) {
        console.error('[SEIRMG] Falha ao alterar título da janela:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar alteração de título:', error)
  }
}
```

(só a linha do `numero` muda — o resto da função fica igual ao que já existe hoje.)

- [ ] **Step 3: Implementar o painel do Planka**

Adicionar depois de `montarPainelAnotacao()` (antes de `bootstrap()`):

```ts
interface RespostaConsultaPlanka {
  tipoProcesso: string | null
  localizacao: string | null
  ultimoComentario: string | null
}

const ESTILO_PLANKA = `
  .seirmg-planka-pills { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
  .seirmg-planka-pill { border-radius: 12px; padding: 3px 10px; font-size: 12px; }
  .seirmg-planka-pill-tipo { background: #e8f2ff; color: #017fff; font-weight: 600; }
  .seirmg-planka-pill-localizacao { background: #eee; color: #444; }
  .seirmg-planka-comentario { border-left: 3px solid #017fff; padding: 6px 10px; background: #fafafa; font-size: 13px; color: #555; font-style: italic; }
`

function montarEstiloPlanka(): void {
  if (document.getElementById('seirmg-estilo-planka')) return
  const style = document.createElement('style')
  style.id = 'seirmg-estilo-planka'
  style.textContent = ESTILO_PLANKA
  document.head.appendChild(style)
}

function renderizarCardPlanka(dados: RespostaConsultaPlanka): void {
  montarEstiloPlanka()

  const container = document.getElementById('container') ?? document.body

  const divPainel = document.createElement('div')
  divPainel.id = 'seirmg-planka'

  const pills = document.createElement('div')
  pills.className = 'seirmg-planka-pills'

  if (dados.tipoProcesso) {
    const pillTipo = document.createElement('span')
    pillTipo.className = 'seirmg-planka-pill seirmg-planka-pill-tipo'
    pillTipo.textContent = `📋 ${dados.tipoProcesso}`
    pills.appendChild(pillTipo)
  }

  if (dados.localizacao) {
    const pillLocalizacao = document.createElement('span')
    pillLocalizacao.className = 'seirmg-planka-pill seirmg-planka-pill-localizacao'
    pillLocalizacao.textContent = `📍 ${dados.localizacao}`
    pills.appendChild(pillLocalizacao)
  }

  if (pills.childElementCount > 0) divPainel.appendChild(pills)

  if (dados.ultimoComentario) {
    const comentario = document.createElement('div')
    comentario.className = 'seirmg-planka-comentario'
    comentario.textContent = dados.ultimoComentario
    divPainel.appendChild(comentario)
  }

  if (divPainel.childElementCount === 0) return

  container.appendChild(divPainel)
}

async function consultarEExibirPlanka(): Promise<void> {
  const numero = obterNumeroProcesso()
  if (!numero) return

  const localStore = createLocalConfigStore()
  const localConfig = await localStore.get()
  const planka = localConfig.planka

  if (!tokenValido(planka?.tokenExp, new Date().toISOString())) return
  if (!planka?.baseUrl || !planka.token) return

  const resposta = await fetch(`${planka.baseUrl}/webhook/seirmg-consultar-processo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${planka.token}`,
    },
    body: JSON.stringify({ processo: numero }),
  })

  if (resposta.status === 401) {
    await localStore.set({ ...localConfig, planka: { ...planka, token: undefined, tokenExp: undefined } })
    return
  }
  if (!resposta.ok) return

  const dados = (await resposta.json()) as RespostaConsultaPlanka
  renderizarCardPlanka(dados)
}

function montarPainelPlanka(): void {
  try {
    esperarElemento('body.infraArvore', "a[target$='Visualizacao']", () => {
      consultarEExibirPlanka().catch((error) => {
        console.error('[SEIRMG] Falha ao consultar dados do Planka:', error)
      })
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar painel do Planka:', error)
  }
}
```

- [ ] **Step 4: Chamar `montarPainelPlanka()` antes de `montarPainelAnotacao()` no `bootstrap()`**

```ts
function bootstrap(): void {
  ajustarElementosNativos()
  alterarTitulo()
  montarPainelPlanka()
  montarPainelAnotacao()
}
```

- [ ] **Step 5: Rodar typecheck e lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/content-scripts/procedimento_visualizar/index.ts
git commit -m "feat(planka): show Planka card on SEI process view page"
```

---

### Task 5: Verificação

**Files:** nenhum arquivo novo — só validação.

- [ ] **Step 1: Rodar toda a suíte de testes**

Run: `cd C:\sei\seirmg && bunx vitest run`
Expected: todos os testes passam, incluindo os novos de `storage.test.ts` (Task 1) e `token.test.ts` (Task 2, 7 testes).

- [ ] **Step 2: Rodar typecheck, lint e build**

Run: `bunx tsc --noEmit && bun run lint && bun run build`
Expected: sem erros. Confirmar em `dist/manifest.json` que `optional_host_permissions` está presente (`["*://*/*"]`) e que `host_permissions`/`permissions` não mudaram além disso.

- [ ] **Step 3: Verificação manual (fora do agente — para o usuário seguir)**

Não automatizável neste ambiente (precisa de um Chrome real com a extensão carregada, e da instância n8n do sub-projeto 1 já montada e funcionando). Passos:
1. Carregar a extensão descompactada (`dist/`) num Chrome real, abrir a página de Opções, aba Integrações.
2. Preencher URL base do n8n, URL de cadastro, e-mail e senha de um usuário já cadastrado (via Workflow 3), clicar "Entrar" — confirmar que o Chrome mostra o diálogo de permissão de host pro domínio digitado, e que após aceitar o login funciona (mostra "Conectado como `<email>`").
3. Testar senha errada — confirmar mensagem "Credenciais inválidas".
4. Abrir um processo do SEI cujo NUP tenha um card correspondente no Planka — confirmar que o card aparece entre "Processos relacionados" e "Anotações", com as pills de Tipo/Localização e a citação do último comentário.
5. Abrir um processo sem card correspondente — confirmar que nada aparece (sem erro visível).
6. Clicar "Sair" em Integrações, reabrir o mesmo processo do passo 4 — confirmar que o card não aparece mais (sem token).

---

## Self-Review

**Cobertura da spec:** todas as seções da spec (`2026-07-09-seirmg-lote-o-planka-extensao-design.md`) têm task correspondente — armazenamento (Task 1), decode/validade do token (Task 2), tela de login/logout na aba Integrações + permissão de host (Task 3), card na tela do processo (Task 4), verificação completa incl. checklist manual (Task 5).

**Placeholders:** nenhum "TBD" — todo código é completo em cada step.

**Consistência de tipos:** `PlankaConfig` (Task 1) usado identicamente em Task 3 (`store.set({ ...config, planka: { baseUrl, email, urlCadastro, token, tokenExp } })`) e Task 4 (`localConfig.planka?.token`/`tokenExp`). `decodificarPayloadJwtSemVerificar`/`tokenValido` (Task 2) usados com a mesma assinatura em Task 3 (decode do payload de login) e Task 4 (checagem de validade antes da consulta). `RespostaConsultaPlanka` (Task 4) reflete exatamente os 3 campos exibidos (`tipoProcesso`, `localizacao`, `ultimoComentario`) — `detalhe`/`nomeProcesso` deliberadamente omitidos do tipo, consistente com a decisão da spec de não exibi-los.
