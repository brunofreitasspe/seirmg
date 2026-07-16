# SEIRMG — Checagem oportunista de Bloco de Assinatura — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notificar proativamente quando um bloco de assinatura transiciona pro estado "disponibilizado
para a área" (precisa de ação da unidade), sem repetir os dois padrões já tentados e revertidos por
causarem deslogamento real (fetch cru autônomo, aba oculta autônoma) — usando uma checagem oportunista de
1 fetch, amarrada a uma navegação real que o usuário já ia fazer (Controle de Processos), sem nenhum
alarme/timer novo.

**Architecture:** Nova lógica pura em `features/bloco-assinatura/parser.ts`
(`parseListaBlocosAssinatura` + `detectarTransicoesParaDisponibilizado`), disparada a partir do
`bootstrap()` já existente de `content-scripts/procedimento_controlar/index.ts` (fire-and-forget, limitada
por um intervalo mínimo configurável persistido em `LocalConfig`). Notifica via
`background/notifications/notify.ts` + um novo listener de mensagem em `background/index.ts`, reaproveitando
o clique-em-notificação já existente (abre a tela de Blocos de Assinatura).

**Tech Stack:** TypeScript, Vitest (jsdom), Vite/CRXJS (extensão Chrome MV3). Sem dependências novas.

## Global Constraints

- `tsconfig.json` tem `noUnusedParameters: true` e `noUnusedLocals: true` — nenhum parâmetro/variável sem uso.
- Lógica pura testada em `features/`; wiring de DOM/chrome API sem teste automatizado (mesmo padrão já
  estabelecido no projeto).
- **Default desligado**: `checagemOportunistaIntervaloMinutos` começa em `0` (desativado, opt-in) — dado o
  histórico de 2 tentativas anteriores revertidas por deslogamento real, ver spec.
- `lib/storage.ts` não importa de `features/` (camada mais baixa) — os novos campos de estado usam `string`
  puro, não o tipo `EstadoBloco`.
- Nenhum `chrome.alarms` novo. A checagem só roda como efeito colateral do `bootstrap()` já existente de
  Controle de Processos.
- **Desvio deliberado da spec:** a spec (linhas 151-157) propõe clicar na notificação navegando pro
  `bloco.href` específico. Este plano simplifica pra reaproveitar o mesmo clique genérico
  (`abrirOuFocarAba` pra tela de Blocos de Assinatura) que as duas notificações de bloco de assinatura
  já existentes usam — guardar e recuperar um `href` específico por notificação exigiria armazenamento
  novo (`chrome.notifications` não retorna dado customizado no `onClicked`, só o que foi passado como
  `notificationId`) e as URLs reais de bloco carregam mais parâmetros que só `id_bloco` (confirmado no
  HTML real), então não dá pra reconstruir a partir só do número. Ver Task 4.

---

## Task 1: Config novo (`lib/storage.ts`)

**Files:**
- Modify: `src/lib/storage.ts` (`BlocoAssinaturaConfig`, `LocalConfig`, `DEFAULT_SYNC_CONFIG`, `DEFAULT_LOCAL_CONFIG`)
- Test: `src/lib/storage.test.ts`

**Interfaces:**
- Consumes: nada de outra task.
- Produces: `BlocoAssinaturaConfig.checagemOportunistaIntervaloMinutos: number` (Task 6, 7);
  `LocalConfig.blocoAssinaturaEstadosConhecidos: Record<string, string>` e
  `LocalConfig.blocoAssinaturaUltimaChecagemOportunista: string` (Task 6).

- [ ] **Step 1: Adicionar os testes novos em `storage.test.ts`**

Logo depois do teste existente `it('persiste blocoAssinaturaPendenteAtual', ...)` (dentro de
`describe('createLocalConfigStore', ...)`), adicionar:

```ts
  it('inclui blocoAssinaturaEstadosConhecidos vazio por padrão', async () => {
    const store = createLocalConfigStore(criarAreaFalsa())
    expect((await store.get()).blocoAssinaturaEstadosConhecidos).toEqual({})
  })

  it('persiste blocoAssinaturaEstadosConhecidos', async () => {
    const area = criarAreaFalsa()
    const store = createLocalConfigStore(area)
    const atualizado = {
      ...DEFAULT_LOCAL_CONFIG,
      blocoAssinaturaEstadosConhecidos: { '123': 'disponibilizado_para_area' },
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })

  it('inclui blocoAssinaturaUltimaChecagemOportunista vazia por padrão', async () => {
    const store = createLocalConfigStore(criarAreaFalsa())
    expect((await store.get()).blocoAssinaturaUltimaChecagemOportunista).toBe('')
  })
```

E, no `describe('createSyncConfigStore', ...)` (procure o bloco que testa `blocoAssinatura`, próximo de
onde `lembreteIntervaloMinutos` já é coberto — se não houver um teste dedicado pra
`lembreteIntervaloMinutos`, adicione ao lado do teste de config padrão geral):

```ts
  it('inclui checagemOportunistaIntervaloMinutos desativado (0) por padrão', async () => {
    const store = createSyncConfigStore(criarAreaFalsa())
    expect((await store.get()).blocoAssinatura.checagemOportunistaIntervaloMinutos).toBe(0)
  })
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd C:\sei\seirmg && npx vitest run src/lib/storage.test.ts`
Expected: FAIL — os campos novos são `undefined`, não os valores esperados.

- [ ] **Step 3: Atualizar `BlocoAssinaturaConfig`**

Trocar:

```ts
export interface BlocoAssinaturaConfig {
  ativo: boolean
  tocarSom: boolean
  lembreteIntervaloMinutos: number
  // Cargos que, se já aparecerem na coluna "Assinaturas" de um documento, também
  // contam como "já assinado" pra fins de desabilitar o checkbox — além da
  // assinatura do próprio usuário logado (featureFlags.desabilitarDocumentosAssinados).
  cargosAdicionais: string[]
}
```

por:

```ts
export interface BlocoAssinaturaConfig {
  ativo: boolean
  tocarSom: boolean
  lembreteIntervaloMinutos: number
  // Cargos que, se já aparecerem na coluna "Assinaturas" de um documento, também
  // contam como "já assinado" pra fins de desabilitar o checkbox — além da
  // assinatura do próprio usuário logado (featureFlags.desabilitarDocumentosAssinados).
  cargosAdicionais: string[]
  // Checagem oportunista (0 = desativado): dispara no máximo 1x a cada N minutos, como efeito
  // colateral de uma navegação real do usuário (não um alarme autônomo) -- ver spec
  // 2026-07-16-seirmg-bloco-assinatura-checagem-oportunista-design.md pro histórico de por que
  // um alarme autônomo não é uma opção aqui (2 tentativas anteriores causaram deslogamento real).
  checagemOportunistaIntervaloMinutos: number
}
```

- [ ] **Step 4: Atualizar `LocalConfig`**

Trocar:

```ts
export interface LocalConfig {
  schemaVersion: 1
  blocoAssinaturaNotificado: NotificadoState
  blocoAssinaturaPendenteAtual: string[]
  baseUrlSei?: string
```

por:

```ts
export interface LocalConfig {
  schemaVersion: 1
  blocoAssinaturaNotificado: NotificadoState
  blocoAssinaturaPendenteAtual: string[]
  // Último Estado conhecido de cada bloco (chave = número do bloco), usado só pela checagem
  // oportunista pra detectar transição pra "disponibilizado_para_area". Guardado como string crua
  // (não o tipo EstadoBloco) porque lib/storage.ts não importa de features/.
  blocoAssinaturaEstadosConhecidos: Record<string, string>
  blocoAssinaturaUltimaChecagemOportunista: string
  baseUrlSei?: string
```

- [ ] **Step 5: Atualizar os defaults**

Trocar:

```ts
  blocoAssinatura: {
    ativo: true,
    tocarSom: true,
    lembreteIntervaloMinutos: 0,
    cargosAdicionais: [],
  },
```

por:

```ts
  blocoAssinatura: {
    ativo: true,
    tocarSom: true,
    lembreteIntervaloMinutos: 0,
    cargosAdicionais: [],
    checagemOportunistaIntervaloMinutos: 0,
  },
```

E trocar:

```ts
export const DEFAULT_LOCAL_CONFIG: LocalConfig = {
  schemaVersion: 1,
  blocoAssinaturaNotificado: {},
  blocoAssinaturaPendenteAtual: [],
}
```

por:

```ts
export const DEFAULT_LOCAL_CONFIG: LocalConfig = {
  schemaVersion: 1,
  blocoAssinaturaNotificado: {},
  blocoAssinaturaPendenteAtual: [],
  blocoAssinaturaEstadosConhecidos: {},
  blocoAssinaturaUltimaChecagemOportunista: '',
}
```

- [ ] **Step 6: Rodar os testes e confirmar que passam**

Run: `cd C:\sei\seirmg && npx vitest run src/lib/storage.test.ts`
Expected: PASS (todos os testes, incluindo os novos).

- [ ] **Step 7: Commit**

```bash
cd C:\sei\seirmg
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "$(cat <<'EOF'
feat: config pra checagem oportunista de bloco de assinatura

checagemOportunistaIntervaloMinutos (default 0, opt-in) controla o
intervalo mínimo; blocoAssinaturaEstadosConhecidos +
blocoAssinaturaUltimaChecagemOportunista guardam o estado necessário
pra detectar transição sem repetir a checagem a cada navegação.
EOF
)"
```

---

## Task 2: `parseListaBlocosAssinatura` (`features/bloco-assinatura/parser.ts`)

**Files:**
- Modify: `src/features/bloco-assinatura/parser.ts`
- Test: `src/features/bloco-assinatura/parser.test.ts`

**Interfaces:**
- Consumes: `classificarEstado` (já existe, privada no mesmo arquivo, sem mudança).
- Produces: `interface BlocoListaItem { numero: string; descricao: string; href: string; estado:
  EstadoBloco | undefined }` e `parseListaBlocosAssinatura(root: ParentNode): BlocoListaItem[]` — usada
  pela Task 3 (mesmo arquivo) e pela Task 6 (wiring).

- [ ] **Step 1: Adicionar os testes**

Adicionar ao final de `parser.test.ts` (depois do `describe('resumirBlocos', ...)`):

```ts
import { parseListaBlocosAssinatura } from './parser'

function montarLinhaBloco(
  numero: string,
  href: string,
  estado: string,
  disponibilizacao: string,
  descricao: string,
  classe = 'infraTrClara'
): string {
  return `<tr class="${classe}">
    <td><input type="checkbox" /></td>
    <td><a href="${href}">${numero}</a></td>
    <td>sinalizacoes</td>
    <td>&nbsp;</td>
    <td>${estado}</td>
    <td>Geradora</td>
    <td>${disponibilizacao}</td>
    <td>&nbsp;</td>
    <td>${descricao}</td>
    <td>acoes</td>
  </tr>`
}

function montarTabelaBlocos(linhas: string[]): string {
  const cabecalho = `<tr><th></th><th>Número</th><th>Sinalizações</th><th>Atribuição</th><th>Estado</th><th>Geradora</th><th>Disponibilização</th><th>Grupo</th><th>Descrição</th><th>Ações</th></tr>`
  return `<table id="tblBlocos">${cabecalho}${linhas.join('')}</table>`
}

describe('parseListaBlocosAssinatura', () => {
  it('lê número, href, descrição e classifica o estado de cada bloco', () => {
    const html = montarTabelaBlocos([
      montarLinhaBloco('154569', 'controlador.php?acao=rel_bloco_protocolo_listar&id_bloco=154569', 'Disponibilizado', '', 'Autorização'),
    ])
    document.body.innerHTML = html

    expect(parseListaBlocosAssinatura(document.body)).toEqual([
      {
        numero: '154569',
        descricao: 'Autorização',
        href: 'controlador.php?acao=rel_bloco_protocolo_listar&id_bloco=154569',
        estado: 'disponibilizado_para_area',
      },
    ])
  })

  it('lê várias linhas (infraTrClara e infraTrEscura)', () => {
    const html = montarTabelaBlocos([
      montarLinhaBloco('1', '/bloco/1', 'Retornado', '', 'Desc 1', 'infraTrClara'),
      montarLinhaBloco('2', '/bloco/2', 'Aberto', '', 'Desc 2', 'infraTrEscura'),
    ])
    document.body.innerHTML = html

    const itens = parseListaBlocosAssinatura(document.body)
    expect(itens.map((item) => item.numero)).toEqual(['1', '2'])
    expect(itens.map((item) => item.estado)).toEqual(['retornado', 'aberto'])
  })

  it('ignora a linha de cabeçalho (sem classe infraTrClara/infraTrEscura/trVermelha)', () => {
    document.body.innerHTML = montarTabelaBlocos([])
    expect(parseListaBlocosAssinatura(document.body)).toEqual([])
  })

  it('retorna lista vazia quando #tblBlocos não existe no documento', () => {
    document.body.innerHTML = '<div></div>'
    expect(parseListaBlocosAssinatura(document.body)).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd C:\sei\seirmg && npx vitest run src/features/bloco-assinatura/parser.test.ts`
Expected: FAIL — `parseListaBlocosAssinatura` não exportada.

- [ ] **Step 3: Implementar em `parser.ts`**

Adicionar, logo abaixo do import do topo do arquivo:

```ts
export interface BlocoListaItem {
  numero: string
  descricao: string
  href: string
  estado: EstadoBloco | undefined
}
```

E, no final do arquivo (depois de `resumirBlocos`):

```ts
const CLASSES_LINHA_VALIDA_BLOCOS = ['infraTrClara', 'infraTrEscura', 'trVermelha']

// Tela "Blocos de Assinatura" (acao=bloco_assinatura_listar) -- diferente da tela de conteúdo de UM
// bloco (#divInfraAreaTabela, que parseBlocoAssinaturaTable já lê). Índices de coluna confirmados com
// HTML real (Ver Código-Fonte) de uma instância SEI real, 2026-07-16: td[1]=número (link),
// td[4]=Estado, td[6]=Disponibilização, td[8]=Descrição.
export function parseListaBlocosAssinatura(root: ParentNode): BlocoListaItem[] {
  const tabela = root.querySelector('#tblBlocos')
  if (!tabela) return []

  const linhas = Array.from(tabela.querySelectorAll('tr')).filter((linha) =>
    CLASSES_LINHA_VALIDA_BLOCOS.some((classe) => linha.classList.contains(classe))
  )

  return linhas.map((linha) => {
    const celulas = linha.children
    const link = celulas.item(1)?.querySelector('a')
    const textoEstado = celulas.item(4)?.textContent?.trim() ?? ''
    const textoDisponibilizacao = celulas.item(6)?.textContent?.trim() ?? ''

    return {
      numero: link?.textContent?.trim() ?? '',
      descricao: celulas.item(8)?.textContent?.trim() ?? '',
      href: link?.getAttribute('href') ?? '',
      estado: classificarEstado(textoEstado, textoDisponibilizacao),
    }
  })
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd C:\sei\seirmg && npx vitest run src/features/bloco-assinatura/parser.test.ts`
Expected: PASS (todos os `describe`, incluindo `parseListaBlocosAssinatura`).

- [ ] **Step 5: Commit**

```bash
cd C:\sei\seirmg
git add src/features/bloco-assinatura/parser.ts src/features/bloco-assinatura/parser.test.ts
git commit -m "$(cat <<'EOF'
feat: adiciona parseListaBlocosAssinatura

Lê a tela "Blocos de Assinatura" (lista de blocos, não o conteúdo de
um bloco específico) e classifica o Estado de cada um, reaproveitando
classificarEstado que já existe. Índices de coluna confirmados com
HTML real de uma instância SEI real.
EOF
)"
```

---

## Task 3: `detectarTransicoesParaDisponibilizado` (mesmo arquivo)

**Files:**
- Modify: `src/features/bloco-assinatura/parser.ts`
- Test: `src/features/bloco-assinatura/parser.test.ts`

**Interfaces:**
- Consumes: `BlocoListaItem` (Task 2).
- Produces: `detectarTransicoesParaDisponibilizado(atuais: BlocoListaItem[], conhecidos: Record<string,
  string>): BlocoListaItem[]` — usada pela Task 6 (wiring).

- [ ] **Step 1: Adicionar os testes**

Adicionar ao final de `parser.test.ts`:

```ts
import { detectarTransicoesParaDisponibilizado } from './parser'

describe('detectarTransicoesParaDisponibilizado', () => {
  const blocoDisponibilizado: BlocoListaItem = {
    numero: '1',
    descricao: 'Desc',
    href: '/bloco/1',
    estado: 'disponibilizado_para_area',
  }

  it('detecta bloco novo já disponibilizado (nunca visto antes)', () => {
    expect(detectarTransicoesParaDisponibilizado([blocoDisponibilizado], {})).toEqual([
      blocoDisponibilizado,
    ])
  })

  it('detecta transição de outro estado pra disponibilizado', () => {
    const conhecidos = { '1': 'retornado' }
    expect(detectarTransicoesParaDisponibilizado([blocoDisponibilizado], conhecidos)).toEqual([
      blocoDisponibilizado,
    ])
  })

  it('não repete notificação se o bloco já era conhecido como disponibilizado', () => {
    const conhecidos = { '1': 'disponibilizado_para_area' }
    expect(detectarTransicoesParaDisponibilizado([blocoDisponibilizado], conhecidos)).toEqual([])
  })

  it('ignora blocos que não estão disponibilizados', () => {
    const blocoRetornado: BlocoListaItem = { numero: '2', descricao: 'D2', href: '/bloco/2', estado: 'retornado' }
    expect(detectarTransicoesParaDisponibilizado([blocoRetornado], {})).toEqual([])
  })
})
```

Também trocar o import do topo do arquivo de teste (que hoje é só `import { parseBlocoAssinaturaTable,
resumirBlocos } from './parser'`) pra incluir o novo tipo:

```ts
import {
  detectarTransicoesParaDisponibilizado,
  parseBlocoAssinaturaTable,
  parseListaBlocosAssinatura,
  resumirBlocos,
  type BlocoListaItem,
} from './parser'
```

(E remover os imports duplicados de `parseListaBlocosAssinatura`/`detectarTransicoesParaDisponibilizado`
que os Steps anteriores adicionaram inline — consolidar tudo num import só no topo do arquivo.)

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd C:\sei\seirmg && npx vitest run src/features/bloco-assinatura/parser.test.ts`
Expected: FAIL — `detectarTransicoesParaDisponibilizado` não exportada.

- [ ] **Step 3: Implementar em `parser.ts`**

Adicionar, logo abaixo de `parseListaBlocosAssinatura`:

```ts
export function detectarTransicoesParaDisponibilizado(
  atuais: BlocoListaItem[],
  conhecidos: Record<string, string>
): BlocoListaItem[] {
  return atuais.filter(
    (bloco) =>
      bloco.estado === 'disponibilizado_para_area' &&
      conhecidos[bloco.numero] !== 'disponibilizado_para_area'
  )
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd C:\sei\seirmg && npx vitest run src/features/bloco-assinatura/parser.test.ts`
Expected: PASS (todos os `describe` do arquivo).

- [ ] **Step 5: Commit**

```bash
cd C:\sei\seirmg
git add src/features/bloco-assinatura/parser.ts src/features/bloco-assinatura/parser.test.ts
git commit -m "$(cat <<'EOF'
feat: adiciona detectarTransicoesParaDisponibilizado

Fecha a lógica pura da checagem oportunista: compara o Estado atual
de cada bloco com o último conhecido, retornando só os que
transicionaram pra "disponibilizado_para_area" (bloco novo já nesse
estado conta como transição; bloco que já era conhecido como tal não
notifica de novo).
EOF
)"
```

---

## Task 4: Notificação (`background/notifications/notify.ts`)

**Files:**
- Modify: `src/background/notifications/notify.ts`

**Interfaces:**
- Consumes: nada de outra task.
- Produces: `NOTIFICATION_ID_BLOCO_DISPONIBILIZADO_PREFIX: string` e
  `notificarBlocoDisponibilizado(bloco: { numero: string; descricao: string }): void` — usadas pela Task 5.

Sem teste automatizado — mesmo padrão de `notificarNovoBloco`/`notificarLembreteBlocoAssinatura`/
`notificarSessaoInvalida` (wiring de `chrome.notifications`, não testado no projeto).

- [ ] **Step 1: Adicionar a função e a constante**

Adicionar ao final de `notify.ts`:

```ts
export const NOTIFICATION_ID_BLOCO_DISPONIBILIZADO_PREFIX = 'seirmg-bloco-disponibilizado-'

// Sem `href` de propósito -- ver "Desvio deliberado da spec" no cabeçalho do plano: o clique reaproveita
// a mesma navegação genérica pra tela de Blocos de Assinatura que as outras notificações de bloco já usam.
export function notificarBlocoDisponibilizado(bloco: { numero: string; descricao: string }): void {
  chrome.notifications.create(`${NOTIFICATION_ID_BLOCO_DISPONIBILIZADO_PREFIX}${bloco.numero}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('src/assets/icons/icon-128.png'),
    title: 'SEIRMG — Bloco de Assinatura disponibilizado',
    message: `Bloco ${bloco.numero}${bloco.descricao ? ` (${bloco.descricao})` : ''} está disponível para sua área assinar.`,
    priority: 2,
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `cd C:\sei\seirmg && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
cd C:\sei\seirmg
git add src/background/notifications/notify.ts
git commit -m "feat: adiciona notificarBlocoDisponibilizado"
```

---

## Task 5: Wiring no background (`background/index.ts`)

**Files:**
- Modify: `src/background/index.ts`

**Interfaces:**
- Consumes: `notificarBlocoDisponibilizado`, `NOTIFICATION_ID_BLOCO_DISPONIBILIZADO_PREFIX` (Task 4).
- Produces: mensagem `{ type: 'seirmg:bloco-disponibilizado', bloco: { numero: string; descricao: string
  } }` — formato que a Task 6 precisa enviar exatamente assim.

Sem teste automatizado — mesmo padrão do resto de `background/index.ts`.

- [ ] **Step 1: Atualizar o import do topo do arquivo**

Trocar:

```ts
import { NOTIFICATION_ID_PREFIX, NOTIFICATION_ID_LEMBRETE_BLOCO_ASSINATURA, notificarLembreteBlocoAssinatura } from './notifications/notify'
```

por:

```ts
import {
  NOTIFICATION_ID_PREFIX,
  NOTIFICATION_ID_LEMBRETE_BLOCO_ASSINATURA,
  NOTIFICATION_ID_BLOCO_DISPONIBILIZADO_PREFIX,
  notificarLembreteBlocoAssinatura,
  notificarBlocoDisponibilizado,
} from './notifications/notify'
```

- [ ] **Step 2: Adicionar a interface e o type guard da nova mensagem**

Logo depois da interface `MensagemItensBloco` (que já existe), adicionar:

```ts
interface MensagemBlocoDisponibilizado {
  type: 'seirmg:bloco-disponibilizado'
  bloco: { numero: string; descricao: string }
}
```

E logo depois de `ehMensagemItensBloco` (que já existe), adicionar:

```ts
function ehMensagemBlocoDisponibilizado(mensagem: unknown): mensagem is MensagemBlocoDisponibilizado {
  return (
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === 'seirmg:bloco-disponibilizado'
  )
}
```

- [ ] **Step 3: Adicionar o listener**

Logo depois do listener existente de `seirmg:bloco-assinatura:itens` (que chama
`processarItensBlocoAssinatura`), adicionar:

```ts
chrome.runtime.onMessage.addListener((mensagem) => {
  if (!ehMensagemBlocoDisponibilizado(mensagem)) return
  notificarBlocoDisponibilizado(mensagem.bloco)
})
```

- [ ] **Step 4: Estender o clique em notificação pra incluir o novo prefixo**

Trocar:

```ts
    if (
      notificationId.startsWith(NOTIFICATION_ID_PREFIX) ||
      notificationId === NOTIFICATION_ID_LEMBRETE_BLOCO_ASSINATURA
    ) {
```

por:

```ts
    if (
      notificationId.startsWith(NOTIFICATION_ID_PREFIX) ||
      notificationId === NOTIFICATION_ID_LEMBRETE_BLOCO_ASSINATURA ||
      notificationId.startsWith(NOTIFICATION_ID_BLOCO_DISPONIBILIZADO_PREFIX)
    ) {
```

- [ ] **Step 5: Typecheck**

Run: `cd C:\sei\seirmg && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Lint**

Run: `cd C:\sei\seirmg && npx eslint .`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
cd C:\sei\seirmg
git add src/background/index.ts
git commit -m "$(cat <<'EOF'
feat: background escuta seirmg:bloco-disponibilizado e notifica

Clique na notificação reaproveita o mesmo abrirOuFocarAba já usado
pelas outras notificações de bloco de assinatura (abre a tela de
Blocos de Assinatura).
EOF
)"
```

---

## Task 6: Wiring no content-script (`content-scripts/procedimento_controlar/index.ts`)

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/index.ts`

**Interfaces:**
- Consumes: `parseListaBlocosAssinatura`, `detectarTransicoesParaDisponibilizado` (Task 2, 3);
  `SyncConfig.blocoAssinatura.checagemOportunistaIntervaloMinutos`,
  `LocalConfig.blocoAssinaturaEstadosConhecidos`, `LocalConfig.blocoAssinaturaUltimaChecagemOportunista`
  (Task 1); mensagem `seirmg:bloco-disponibilizado` no formato exato produzido pela Task 5.
- Produces: nada consumido por outra task (content script final, sem exports).

Sem teste automatizado — mesmo padrão já estabelecido no resto deste arquivo (wiring de DOM/chrome API).

- [ ] **Step 1: Atualizar o import do topo do arquivo**

Trocar:

```ts
import {
  linhaCasaBloco,
  parseListaBlocos,
  parseProcessosDoBloco,
} from '../../features/controle-processos/filtroBloco'
```

por:

```ts
import {
  linhaCasaBloco,
  parseListaBlocos,
  parseProcessosDoBloco,
} from '../../features/controle-processos/filtroBloco'
import {
  detectarTransicoesParaDisponibilizado,
  parseListaBlocosAssinatura,
} from '../../features/bloco-assinatura/parser'
```

- [ ] **Step 2: Adicionar a função de checagem oportunista**

Localizar a função `montarFiltroBloco` (que já usa `PREFIXOS_BLOCO`) e adicionar, logo depois dela (antes
de `desabilitarSelecaoNaLinha`):

```ts
// Checagem oportunista de bloco de assinatura -- NENHUM alarme/timer novo. Dispara só como efeito
// colateral do bootstrap() já existente de Controle de Processos (a tela mais visitada), no máximo 1x
// a cada checagemOportunistaIntervaloMinutos. Ver spec
// docs/superpowers/specs/2026-07-16-seirmg-bloco-assinatura-checagem-oportunista-design.md pro
// histórico de por que um alarme autônomo não é uma opção aqui (2 tentativas anteriores causaram
// deslogamento real da sessão do SEI).
async function verificarBlocoAssinaturaOportunisticamente(): Promise<void> {
  const syncConfig = await createSyncConfigStore().get()
  const intervaloMinutos = syncConfig.blocoAssinatura.checagemOportunistaIntervaloMinutos
  if (intervaloMinutos <= 0) return

  const localConfig = await createLocalConfigStore().get()
  const agoraMs = Date.now()
  const ultimaChecagemMs = localConfig.blocoAssinaturaUltimaChecagemOportunista
    ? new Date(localConfig.blocoAssinaturaUltimaChecagemOportunista).getTime()
    : 0
  if (agoraMs - ultimaChecagemMs < intervaloMinutos * 60 * 1000) return

  const link = document.querySelector<HTMLAnchorElement>(
    `a[href^="controlador.php?acao=${PREFIXOS_BLOCO.ASSINATURA}"]`
  )
  if (!link) return

  const resultado = await fetchText(link.href)
  if (!resultado.ok) {
    console.error('[SEIRMG] Falha ao checar bloco de assinatura oportunisticamente:', resultado.error)
    return
  }

  const doc = new DOMParser().parseFromString(resultado.data, 'text/html')
  const blocosAtuais = parseListaBlocosAssinatura(doc)
  const transicoes = detectarTransicoesParaDisponibilizado(
    blocosAtuais,
    localConfig.blocoAssinaturaEstadosConhecidos
  )

  transicoes.forEach((bloco) => {
    chrome.runtime
      .sendMessage({
        type: 'seirmg:bloco-disponibilizado',
        bloco: { numero: bloco.numero, descricao: bloco.descricao },
      })
      .catch((error) => {
        console.error('[SEIRMG] Falha ao notificar bloco disponibilizado:', error)
      })
  })

  await createLocalConfigStore().set({
    ...localConfig,
    blocoAssinaturaEstadosConhecidos: Object.fromEntries(
      blocosAtuais.map((bloco) => [bloco.numero, bloco.estado ?? ''])
    ),
    blocoAssinaturaUltimaChecagemOportunista: new Date(agoraMs).toISOString(),
  })
}
```

- [ ] **Step 3: Chamar a partir do `bootstrap()`**

Localizar o final do `bootstrap()` (o bloco `if (config.controleProcessos.rolagemInfinita.ativo) { ... }`,
logo antes do `} catch (error) {` que fecha a função) e adicionar logo depois desse bloco:

```ts
    verificarBlocoAssinaturaOportunisticamente().catch((error) => {
      console.error('[SEIRMG] Falha ao checar bloco de assinatura oportunisticamente:', error)
    })
```

- [ ] **Step 4: Typecheck**

Run: `cd C:\sei\seirmg && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Lint**

Run: `cd C:\sei\seirmg && npx eslint .`
Expected: sem erros.

- [ ] **Step 6: Build**

Run: `cd C:\sei\seirmg && npm run build`
Expected: build sem erros.

- [ ] **Step 7: Commit**

```bash
cd C:\sei\seirmg
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "$(cat <<'EOF'
feat: checagem oportunista de bloco de assinatura em Controle de Processos

Dispara no bootstrap() já existente (fire-and-forget), sem nenhum
alarme/timer novo -- 1 fetch na lista de blocos, notifica só
transições pra "disponibilizado_para_area", respeitando o intervalo
mínimo configurável (0 = desativado, opt-in).
EOF
)"
```

---

## Task 7: Opção na aba de Bloco de Assinatura (`options/index.html` + `options/main.ts`)

**Files:**
- Modify: `src/options/index.html` (seção `#painel-assinatura`)
- Modify: `src/options/main.ts` (`carregarAbaAssinatura`)

**Interfaces:**
- Consumes: `BlocoAssinaturaConfig.checagemOportunistaIntervaloMinutos` (Task 1).
- Produces: nada consumido por outra task.

- [ ] **Step 1: Adicionar o campo no HTML**

Em `src/options/index.html`, trocar:

```html
      <label>
        Lembrar a cada (minutos, 0 = desativado):
        <input type="number" id="assinatura-lembrete-intervalo" min="0" step="1" />
      </label>
      <br />
      <button id="assinatura-salvar">Salvar</button>
```

por:

```html
      <label>
        Lembrar a cada (minutos, 0 = desativado):
        <input type="number" id="assinatura-lembrete-intervalo" min="0" step="1" />
      </label>
      <br />
      <label>
        Checar bloco de assinatura a cada (minutos, 0 = desativado):
        <input type="number" id="assinatura-checagem-oportunista-intervalo" min="0" step="1" />
      </label>
      <p style="font-size: 0.85em; color: #666; max-width: 480px;">
        Checagem oportunista: só roda quando você já está navegando pelo Controle de Processos (não
        cria nenhum alarme novo em segundo plano). Notifica quando um bloco fica disponível pra sua
        área assinar.
      </p>
      <br />
      <button id="assinatura-salvar">Salvar</button>
```

- [ ] **Step 2: Ler/gravar o novo campo em `carregarAbaAssinatura` (`main.ts`)**

Trocar:

```ts
    const inputLembreteIntervalo = document.getElementById(
      'assinatura-lembrete-intervalo'
    ) as HTMLInputElement | null
    const status = document.getElementById('assinatura-status')

    if (inputAtivo) inputAtivo.checked = config.blocoAssinatura.ativo
    if (inputSom) inputSom.checked = config.blocoAssinatura.tocarSom
    if (inputLembreteIntervalo) {
      inputLembreteIntervalo.value = String(config.blocoAssinatura.lembreteIntervaloMinutos)
    }
```

por:

```ts
    const inputLembreteIntervalo = document.getElementById(
      'assinatura-lembrete-intervalo'
    ) as HTMLInputElement | null
    const inputChecagemOportunistaIntervalo = document.getElementById(
      'assinatura-checagem-oportunista-intervalo'
    ) as HTMLInputElement | null
    const status = document.getElementById('assinatura-status')

    if (inputAtivo) inputAtivo.checked = config.blocoAssinatura.ativo
    if (inputSom) inputSom.checked = config.blocoAssinatura.tocarSom
    if (inputLembreteIntervalo) {
      inputLembreteIntervalo.value = String(config.blocoAssinatura.lembreteIntervaloMinutos)
    }
    if (inputChecagemOportunistaIntervalo) {
      inputChecagemOportunistaIntervalo.value = String(
        config.blocoAssinatura.checagemOportunistaIntervaloMinutos
      )
    }
```

Trocar (gravação ao salvar):

```ts
            lembreteIntervaloMinutos: Math.max(0, Math.round(Number(inputLembreteIntervalo?.value) || 0)),
          },
        }
```

por:

```ts
            lembreteIntervaloMinutos: Math.max(0, Math.round(Number(inputLembreteIntervalo?.value) || 0)),
            checagemOportunistaIntervaloMinutos: Math.max(
              0,
              Math.round(Number(inputChecagemOportunistaIntervalo?.value) || 0)
            ),
          },
        }
```

- [ ] **Step 3: Typecheck**

Run: `cd C:\sei\seirmg && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Build**

Run: `cd C:\sei\seirmg && npm run build`
Expected: build sem erros.

- [ ] **Step 5: Commit**

```bash
cd C:\sei\seirmg
git add src/options/index.html src/options/main.ts
git commit -m "feat: opção pra checagem oportunista de bloco de assinatura nas Opções"
```

---

## Task 8: Verificação final + documentação

**Files:**
- Modify: `docs/ROADMAP-LOTES.md`

- [ ] **Step 1: Rodar a suíte de testes inteira**

Run: `cd C:\sei\seirmg && npx vitest run`
Expected: todos os testes passam.

- [ ] **Step 2: Typecheck do projeto inteiro**

Run: `cd C:\sei\seirmg && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Lint**

Run: `cd C:\sei\seirmg && npx eslint .`
Expected: sem erros.

- [ ] **Step 4: Build final**

Run: `cd C:\sei\seirmg && npm run build`
Expected: build sem erros, `dist/` gerado.

- [ ] **Step 5: Corrigir a entrada desatualizada do Lote A e adicionar a entrada nova**

Em `docs/ROADMAP-LOTES.md`, a entrada do Lote A (linha ~8) ainda cita a aba oculta como se fosse a solução
aplicada, sem mencionar que ela também foi revertida (achado durante o brainstorming desta spec, commit
`7263210`). Trocar o texto:

```
Reintrodução futura exigiria o mesmo tratamento de aba oculta já aplicado ao bloco de assinatura (ver `docs/superpowers/specs/2026-07-09-seirmg-bloco-assinatura-aba-oculta-design.md`).
```

por:

```
A aba oculta (`docs/superpowers/specs/2026-07-09-seirmg-bloco-assinatura-aba-oculta-design.md`) foi de fato implementada em seguida como tratamento pro bloco de assinatura, mas **também causou deslogamento real** (confirmado, commit `7263210`, 11/07/2026) -- qualquer chamada de rede autônoma (fetch cru OU navegação de aba oculta via alarme) carrega o mesmo risco. Removida, substituída por um lembrete puramente baseado em tempo sem nenhuma chamada de rede (ver "Já entregue" abaixo). Reintrodução futura de proatividade de fato (não só lembrete) exigiria amarrar a chamada de rede a uma navegação real do usuário, não a um alarme autônomo -- ver `docs/superpowers/specs/2026-07-16-seirmg-bloco-assinatura-checagem-oportunista-design.md`.
```

Adicionar uma entrada nova em "Já entregue" descrevendo a checagem oportunista, com link pra spec
(`docs/superpowers/specs/2026-07-16-seirmg-bloco-assinatura-checagem-oportunista-design.md`) e pro plano
(`docs/superpowers/plans/2026-07-16-seirmg-bloco-assinatura-checagem-oportunista.md`).

- [ ] **Step 6: Commit**

```bash
cd C:\sei\seirmg
git add docs/ROADMAP-LOTES.md
git commit -m "$(cat <<'EOF'
docs: corrige histórico do Lote A/aba-oculta e registra a checagem oportunista

A entrada antiga não mencionava que a aba oculta também foi revertida
por causar deslogamento real -- achado durante o brainstorming desta
spec. Registra a checagem oportunista de bloco de assinatura como
entregue.
EOF
)"
```

- [ ] **Step 7: Verificação manual (⚠️ requer instância SEI real — risco mais alto que qualquer melhoria feita nesta sessão)**

Carregar `dist/` como extensão descompactada no Chrome, abrir uma instância SEI real, ativar "Checar bloco
de assinatura a cada N minutos" nas Opções (aba Bloco de Assinatura, valor pequeno tipo 1-2 minutos só pra
testar mais rápido) e confirmar:
- Navegar pra Controle de Processos dispara a checagem (ver no console de fundo/service worker, ou
  temporariamente adicionar um log, se precisar confirmar que rodou).
- Recarregar Controle de Processos várias vezes seguidas **não** dispara a checagem de novo antes do
  intervalo configurado passar (`blocoAssinaturaUltimaChecagemOportunista` sendo respeitado).
- Se possível, forçar um bloco de assinatura a mudar pra estado "Disponibilizado" (ou usar um bloco que já
  esteja nesse estado, apagando o campo `blocoAssinaturaEstadosConhecidos` do `chrome.storage.local` pra
  simular "nunca visto antes") e confirmar que a notificação aparece.
- Clicar na notificação abre/foca a aba na tela de Blocos de Assinatura.
- **Mais importante:** acompanhar a sessão do SEI ao longo de várias checagens (deixar rodando por um
  tempo, navegando normalmente) e confirmar que **não há nenhum sinal de deslogamento automático** — este
  é o mesmo padrão de risco que já se confirmou duas vezes neste projeto. Se houver qualquer suspeita,
  desativar a opção (voltar pra 0) imediatamente e reportar.
