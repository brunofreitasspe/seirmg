# Corretor Ortográfico no Editor de Documentos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar verificação ortográfica em português (pt-BR) ao editor de documentos do SEI (CKEditor), com sublinhado visual de palavras erradas e um menu de contexto próprio (sugestões, ignorar, adicionar ao dicionário) que só aparece em cima de uma palavra sinalizada — sem nunca interferir no menu nativo do CKEditor nos demais cliques.

**Architecture:** Lógica pura e testável (tokenização, diff de parágrafos, verificação/sugestão via `nspell` + dicionário Hunspell pt-BR vendorizado) em `src/features/corretor-ortografico/`. Um módulo de integração em `src/content-scripts/documento_editar/` conecta essa lógica ao DOM real do CKEditor: sublinhado via CSS Custom Highlight API (não toca no conteúdo do documento), menu de contexto próprio só quando o clique cai numa palavra sinalizada, e correção via `editor.insertText()` (mesma API do CKEditor já usada pelo painel de Ferramentas de IA, preserva undo/redo).

**Tech Stack:** TypeScript, Vite + `@crxjs/vite-plugin`, Vitest (`environment: jsdom`), `hunspell-asm` (Hunspell real compilado pra WebAssembly, aplica afixos sob demanda — `nspell`, motor JS puro cogitado inicialmente, trava com o dicionário pt-BR real, ver nota na Task 4), dicionário Hunspell pt-BR vendorizado a partir do pacote `dictionary-pt` (VERO, LGPL-3.0/MPL-2.0).

## Global Constraints

- Todo nome de função/variável/tipo novo é em português, consistente com o resto do projeto (`criarCorretor`, `tokenizar`, `CorretorOrtograficoConfig`, etc.) — nunca `spellcheck`/`dictionary` em inglês nos identificadores do nosso código.
- Lógica pura (tokenização, diff, verificação/sugestão) vive em `src/features/` e é testada via Vitest, sem DOM real — mesmo padrão de `src/features/ferramentas-ia/`, `src/features/planka/`.
- Manipulação de DOM/CKEditor nos content-scripts não tem teste automatizado (não é simulável em Vitest) — protegida por `try`/`catch` com `console.error('[SEIRMG] ...')`, mesmo padrão já usado em `bootstrap()` de `src/content-scripts/documento_editar/index.ts`.
- **O dicionário pt-BR (~5.5MB de dados) e o `nspell` só podem ser carregados via `import()` dinâmico dentro do content script**, nunca por import estático no topo de `src/content-scripts/documento_editar/index.ts`. Esse content script roda em **toda** página do SEI (`matches: ['*://*.br/*controlador.php?acao=*', ...]`, ver `manifest.config.ts`), não só na tela do editor — um import estático inflaria em ~5.5MB o JS carregado em toda navegação no SEI, não só na tela de edição de documento.
- Nenhuma chamada de rede é feita por este recurso — dicionário e motor de sugestão rodam 100% localmente, dado que o texto de um documento SEI é sensível.
- Sem alteração no DOM/HTML real do conteúdo do CKEditor para desenhar o sublinhado (usar CSS Custom Highlight API) — preserva o histórico de desfazer (Ctrl+Z) e nunca corrompe o HTML salvo do documento.

---

### Task 1: Configuração (`CorretorOrtograficoConfig`)

**Files:**
- Modify: `src/lib/storage.ts`
- Test: `src/lib/storage.test.ts`

**Interfaces:**
- Produces: `export interface CorretorOrtograficoConfig { ativo: boolean; palavrasIgnoradas: string[] }`, campo `corretorOrtografico: CorretorOrtograficoConfig` em `SyncConfig` e em `DEFAULT_SYNC_CONFIG` (com `ativo: false, palavrasIgnoradas: []`).

- [ ] **Step 1: Escrever o teste que falha**

Adicione ao final do arquivo `src/lib/storage.test.ts` (dentro do `describe('createSyncConfigStore', ...)` já existente, como um novo `it` no mesmo nível dos outros):

```ts
  it('inclui corretorOrtografico desativado por padrão', async () => {
    const store = createSyncConfigStore(criarAreaFalsa())
    const config = await store.get()
    expect(config.corretorOrtografico.ativo).toBe(false)
    expect(config.corretorOrtografico.palavrasIgnoradas).toEqual([])
  })

  it('persiste alteração de corretorOrtografico', async () => {
    const area = criarAreaFalsa()
    const store = createSyncConfigStore(area)
    const config = await store.get()
    const atualizado = {
      ...config,
      corretorOrtografico: { ativo: true, palavrasIgnoradas: ['SEIRMG'] },
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/storage.test.ts`
Expected: FAIL — erro de tipo/runtime porque `config.corretorOrtografico` é `undefined` (a propriedade ainda não existe em `SyncConfig`/`DEFAULT_SYNC_CONFIG`).

- [ ] **Step 3: Implementar**

Em `src/lib/storage.ts`, adicione a interface logo após `FerramentasIAConfig` (por volta da linha 120):

```ts
export interface CorretorOrtograficoConfig {
  ativo: boolean
  palavrasIgnoradas: string[]
}
```

Adicione o campo em `SyncConfig` (dentro da interface, junto dos demais):

```ts
export interface SyncConfig {
  schemaVersion: 1
  featureFlags: FeatureFlags
  tema: ThemeConfig
  blocoAssinatura: BlocoAssinaturaConfig
  controleProcessos: ControleProcessosConfig
  pontoControle: PontoControleConfig
  documentoExterno: DocumentoExternoConfig
  ferramentasIA: FerramentasIAConfig
  corretorOrtografico: CorretorOrtograficoConfig
}
```

E o valor padrão em `DEFAULT_SYNC_CONFIG` (logo após o bloco `ferramentasIA: { ... }`):

```ts
  corretorOrtografico: {
    ativo: false,
    palavrasIgnoradas: [],
  },
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/storage.test.ts`
Expected: PASS (todos os testes do arquivo, incluindo os dois novos)

- [ ] **Step 5: Typecheck e commit**

Run: `npx tsc --noEmit`
Expected: sem erros

```bash
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "feat(corretor-ortografico): configuração persistida (ativo + palavras ignoradas)"
```

---

### Task 2: Tokenização de palavras

**Files:**
- Create: `src/features/corretor-ortografico/tokenizador.ts`
- Test: `src/features/corretor-ortografico/tokenizador.test.ts`

**Interfaces:**
- Produces: `export interface TokenPalavra { palavra: string; inicio: number; fim: number }`, `export function tokenizar(texto: string): TokenPalavra[]`

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/features/corretor-ortografico/tokenizador.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { tokenizar } from './tokenizador'

describe('tokenizar', () => {
  it('separa as palavras de uma frase simples com os offsets corretos', () => {
    const resultado = tokenizar('O despacho contem erro.')
    expect(resultado).toEqual([
      { palavra: 'O', inicio: 0, fim: 1 },
      { palavra: 'despacho', inicio: 2, fim: 10 },
      { palavra: 'contem', inicio: 11, fim: 17 },
      { palavra: 'erro', inicio: 18, fim: 22 },
    ])
  })

  it('ignora siglas em caixa alta (mais de uma letra)', () => {
    const resultado = tokenizar('Processo SEI 123.456 e RMG.')
    expect(resultado).toEqual([
      { palavra: 'Processo', inicio: 0, fim: 8 },
      { palavra: 'e', inicio: 21, fim: 22 },
    ])
  })

  it('ignora palavras dentro de um e-mail', () => {
    const resultado = tokenizar('Envie para fulano.beltrano@orgao.mg.gov.br por favor.')
    expect(resultado.map((token) => token.palavra)).toEqual(['Envie', 'para', 'por', 'favor'])
  })

  it('retorna array vazio para texto sem palavras', () => {
    expect(tokenizar('123 456 !!! ...')).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/features/corretor-ortografico/tokenizador.test.ts`
Expected: FAIL — não resolve o módulo `./tokenizador` (arquivo ainda não existe).

- [ ] **Step 3: Implementar**

Crie `src/features/corretor-ortografico/tokenizador.ts`:

```ts
export interface TokenPalavra {
  palavra: string
  inicio: number
  fim: number
}

const REGEX_PALAVRA = /\p{L}+(?:['-]\p{L}+)*/gu
const REGEX_EMAIL = /[\p{L}0-9._%+-]+@[\p{L}0-9.-]+\.[\p{L}]{2,}/gu

function ehSigla(palavra: string): boolean {
  return palavra.length > 1 && palavra === palavra.toUpperCase() && palavra !== palavra.toLowerCase()
}

function localizarIntervalosDeEmail(texto: string): Array<{ inicio: number; fim: number }> {
  return Array.from(texto.matchAll(REGEX_EMAIL)).flatMap((match) =>
    match.index === undefined ? [] : [{ inicio: match.index, fim: match.index + match[0].length }]
  )
}

export function tokenizar(texto: string): TokenPalavra[] {
  const intervalosEmail = localizarIntervalosDeEmail(texto)
  const tokens: TokenPalavra[] = []

  for (const match of texto.matchAll(REGEX_PALAVRA)) {
    if (match.index === undefined) continue
    const inicio = match.index
    const fim = inicio + match[0].length
    const palavra = match[0]

    const dentroDeEmail = intervalosEmail.some(
      (intervalo) => inicio >= intervalo.inicio && fim <= intervalo.fim
    )
    if (dentroDeEmail) continue
    if (ehSigla(palavra)) continue

    tokens.push({ palavra, inicio, fim })
  }

  return tokens
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/features/corretor-ortografico/tokenizador.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add src/features/corretor-ortografico/tokenizador.ts src/features/corretor-ortografico/tokenizador.test.ts
git commit -m "feat(corretor-ortografico): tokenização de palavras (ignora siglas, números e e-mails)"
```

---

### Task 3: Diff de parágrafos alterados

**Files:**
- Create: `src/features/corretor-ortografico/diffParagrafos.ts`
- Test: `src/features/corretor-ortografico/diffParagrafos.test.ts`

**Interfaces:**
- Produces: `export interface ParagrafoAtual { id: string; texto: string }`, `export interface ResultadoDiffParagrafos { novosOuAlterados: string[]; removidos: string[] }`, `export function diffarParagrafos(atuais: ParagrafoAtual[], snapshotAnterior: Map<string, string>): ResultadoDiffParagrafos`

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/features/corretor-ortografico/diffParagrafos.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { diffarParagrafos } from './diffParagrafos'

describe('diffarParagrafos', () => {
  it('marca como alterado um parágrafo que não existia no snapshot', () => {
    const resultado = diffarParagrafos([{ id: 'p0', texto: 'Texto novo.' }], new Map())
    expect(resultado).toEqual({ novosOuAlterados: ['p0'], removidos: [] })
  })

  it('não marca como alterado um parágrafo cujo texto não mudou', () => {
    const snapshot = new Map([['p0', 'Texto igual.']])
    const resultado = diffarParagrafos([{ id: 'p0', texto: 'Texto igual.' }], snapshot)
    expect(resultado).toEqual({ novosOuAlterados: [], removidos: [] })
  })

  it('marca como alterado um parágrafo cujo texto mudou', () => {
    const snapshot = new Map([['p0', 'Texto antigo.']])
    const resultado = diffarParagrafos([{ id: 'p0', texto: 'Texto editado.' }], snapshot)
    expect(resultado).toEqual({ novosOuAlterados: ['p0'], removidos: [] })
  })

  it('marca como removido um parágrafo que estava no snapshot mas não está mais nos atuais', () => {
    const snapshot = new Map([
      ['p0', 'Primeiro.'],
      ['p1', 'Segundo.'],
    ])
    const resultado = diffarParagrafos([{ id: 'p0', texto: 'Primeiro.' }], snapshot)
    expect(resultado).toEqual({ novosOuAlterados: [], removidos: ['p1'] })
  })

  it('lida com múltiplos parágrafos alterados, inalterados e removidos ao mesmo tempo', () => {
    const snapshot = new Map([
      ['p0', 'Fica igual.'],
      ['p1', 'Vai mudar.'],
      ['p2', 'Vai sumir.'],
    ])
    const resultado = diffarParagrafos(
      [
        { id: 'p0', texto: 'Fica igual.' },
        { id: 'p1', texto: 'Mudou.' },
        { id: 'p3', texto: 'É novo.' },
      ],
      snapshot
    )
    expect(resultado.novosOuAlterados.sort()).toEqual(['p1', 'p3'])
    expect(resultado.removidos).toEqual(['p2'])
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/features/corretor-ortografico/diffParagrafos.test.ts`
Expected: FAIL — módulo `./diffParagrafos` não existe ainda.

- [ ] **Step 3: Implementar**

Crie `src/features/corretor-ortografico/diffParagrafos.ts`:

```ts
export interface ParagrafoAtual {
  id: string
  texto: string
}

export interface ResultadoDiffParagrafos {
  novosOuAlterados: string[]
  removidos: string[]
}

export function diffarParagrafos(
  atuais: ParagrafoAtual[],
  snapshotAnterior: Map<string, string>
): ResultadoDiffParagrafos {
  const idsAtuais = new Set(atuais.map((paragrafo) => paragrafo.id))

  const novosOuAlterados = atuais
    .filter((paragrafo) => snapshotAnterior.get(paragrafo.id) !== paragrafo.texto)
    .map((paragrafo) => paragrafo.id)

  const removidos = Array.from(snapshotAnterior.keys()).filter((id) => !idsAtuais.has(id))

  return { novosOuAlterados, removidos }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/features/corretor-ortografico/diffParagrafos.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add src/features/corretor-ortografico/diffParagrafos.ts src/features/corretor-ortografico/diffParagrafos.test.ts
git commit -m "feat(corretor-ortografico): diff de parágrafos alterados/removidos"
```

---

### Task 4: Dicionário pt-BR vendorizado + verificador (`criarCorretor`)

> **Nota de revisão de plano:** a primeira tentativa desta task usava `nspell` como motor de sugestão. Descobrimos, na prática, que `nspell` expande antecipadamente (na hora de carregar o dicionário) todas as combinações de regras de afixo pra todas as ~312 mil palavras — e isso trava (14+ minutos, memória subindo sem parar) com o dicionário pt-BR real. Isso é um bug conhecido e documentado do próprio projeto (https://github.com/wooorm/nspell/issues/11: "The Italian (also Portuguese) languages hang the app that uses nspell"), não uma falha do ambiente. A versão abaixo já usa `hunspell-asm` (o mesmo motor Hunspell real, compilado pra WebAssembly, que aplica as regras de afixo sob demanda por palavra consultada, sem expandir tudo de uma vez — por isso não sofre desse problema).

**Files:**
- Create: `src/features/corretor-ortografico/dicionario/pt-br.aff` (vendorizado, ~980KB)
- Create: `src/features/corretor-ortografico/dicionario/pt-br.dic` (vendorizado, ~4.5MB)
- Create: `src/features/corretor-ortografico/dicionario/LICENSE.md`
- Create: `src/features/corretor-ortografico/corretor.ts`
- Test: `src/features/corretor-ortografico/corretor.test.ts`
- Modify: `package.json`
- Modify: `src/vite-env.d.ts`

**Interfaces:**
- Consumes: `tokenizar` de `./tokenizador` (Task 2)
- Produces: `export interface ErroOrtografico { palavra: string; inicio: number; fim: number; sugestoes: string[] }`, `export interface Corretor { verificarTexto: (texto: string) => ErroOrtografico[]; adicionarPalavra: (palavra: string) => void }`, `export async function criarCorretor(palavrasIgnoradas?: string[]): Promise<Corretor>` — **note bem: é `async`/`Promise`, diferente da assinatura síncrona de tentativas anteriores**, porque `hunspell-asm` carrega um módulo WebAssembly (`loadModule()` é assíncrono). Isso se propaga pra Task 5: quem chamar `criarCorretor(...)` precisa de `await`.

**Por que vendorizar em vez de importar o pacote npm direto:** o pacote `dictionary-pt` (que embute o dicionário VERO de português do Brasil) declara `"exports": "./index.js"` no `package.json`, o que bloqueia importar `dictionary-pt/index.aff` diretamente — e o próprio `index.js` do pacote usa `node:fs/promises` (só funciona em Node, não num content script de navegador). A solução é vendorizar os dois arquivos de dados (`.aff`/`.dic`, que são só texto UTF-8 no formato Hunspell) direto no nosso repositório e importá-los com o `?raw` do Vite — mesmo mecanismo que o projeto já usa pros ícones SVG (`import openaiIconSvg from '...svg?raw'` em `src/content-scripts/documento_editar/index.ts`).

**Por que `hunspell-asm` e não `nspell`:** ver a nota de revisão acima. `hunspell-asm` (https://github.com/kwonoj/hunspell-asm, MIT, TypeScript nativo — `"types": "./dist/types/index.d.ts"` no seu `package.json`, não precisa de `@types` separado) embrulha o Hunspell real compilado pra WebAssembly, aplicando afixos sob demanda por palavra, sem a explosão combinatória do `nspell`.

- [ ] **Step 1: Instalar as dependências**

Se uma tentativa anterior desta task deixou `nspell`/`@types/nspell` instalados, remova-os primeiro:

```bash
bun remove nspell @types/nspell
```

Depois instale a dependência correta:

```bash
bun add hunspell-asm
```

(`hunspell-asm` já inclui seus próprios tipos TypeScript — não precisa de um pacote `@types/` separado.)

- [ ] **Step 2: Vendorizar os arquivos do dicionário**

Se uma tentativa anterior já baixou e verificou `pt-br.aff`/`pt-br.dic`/`LICENSE.md` em `src/features/corretor-ortografico/dicionario/`, pule este passo — os arquivos de dados do dicionário não mudam com a troca de motor.

```powershell
New-Item -ItemType Directory -Force src/features/corretor-ortografico/dicionario
Invoke-WebRequest -Uri "https://unpkg.com/dictionary-pt@4.0.0/index.aff" -OutFile "src/features/corretor-ortografico/dicionario/pt-br.aff"
Invoke-WebRequest -Uri "https://unpkg.com/dictionary-pt@4.0.0/index.dic" -OutFile "src/features/corretor-ortografico/dicionario/pt-br.dic"
```

Verifique que baixou certo:

Run: `Get-Content -TotalCount 3 src/features/corretor-ortografico/dicionario/pt-br.aff`
Expected: a primeira linha é `SET UTF-8`

Run: `Get-Content -TotalCount 1 src/features/corretor-ortografico/dicionario/pt-br.dic`
Expected: `312368` (contagem de palavras do dicionário)

Crie `src/features/corretor-ortografico/dicionario/LICENSE.md`:

```markdown
# Dicionário pt-BR — origem e licença

Os arquivos `pt-br.aff` e `pt-br.dic` deste diretório são vendorizados a partir do
pacote npm [`dictionary-pt`](https://www.npmjs.com/package/dictionary-pt) v4.0.0
(projeto [wooorm/dictionaries](https://github.com/wooorm/dictionaries)), que por sua
vez embute o **VERO — Verificador Ortográfico Livre — versão 3.2**, o dicionário
Hunspell de português do Brasil usado pelo LibreOffice.

- Copyright (C) 2006–2013 Raimundo Santos Moura (<raimundo.smoura@gmail.com>)
- Licença dupla: GNU Lesser General Public License v3 (LGPLv3) OU Mozilla Public License (MPL)
- Fonte: https://unpkg.com/dictionary-pt@4.0.0/

Vendorizados diretamente (em vez de instalados via `node_modules`) porque o pacote
`dictionary-pt` restringe suas exportações a `./index.js` (que por sua vez só
funciona em Node.js via `node:fs/promises`) — não dá pra importar os arquivos
`.aff`/`.dic` de dentro do pacote num content script de extensão de navegador.
```

- [ ] **Step 3: Escrever o teste que falha**

Crie `src/features/corretor-ortografico/corretor.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { criarCorretor } from './corretor'

describe('criarCorretor', () => {
  it('não aponta erro em palavras corretas', async () => {
    const corretor = await criarCorretor()
    expect(corretor.verificarTexto('Este despacho foi enviado corretamente.')).toEqual([])
  })

  it('aponta erro em uma palavra incorreta e sugere a forma certa', async () => {
    const corretor = await criarCorretor()
    const erros = corretor.verificarTexto('Este processo contem um erro.')
    expect(erros).toHaveLength(1)
    expect(erros[0].palavra).toBe('contem')
    expect(erros[0].inicio).toBe(14)
    expect(erros[0].fim).toBe(20)
    expect(erros[0].sugestoes).toContain('contém')
  })

  it('limita a no máximo 5 sugestões', async () => {
    const corretor = await criarCorretor()
    const erros = corretor.verificarTexto('isso e um teste com palavra errda.')
    const erro = erros.find((item) => item.palavra === 'errda')
    expect(erro?.sugestoes.length).toBeLessThanOrEqual(5)
  })

  it('não aponta erro em palavra passada como já ignorada na criação', async () => {
    const corretor = await criarCorretor(['Seirmg'])
    const erros = corretor.verificarTexto('A extensão Seirmg ajuda no processo.')
    expect(erros.some((erro) => erro.palavra === 'Seirmg')).toBe(false)
  })

  it('para de apontar erro numa palavra depois de adicionarPalavra', async () => {
    const corretor = await criarCorretor()
    expect(corretor.verificarTexto('Isso e um jusia.').some((erro) => erro.palavra === 'jusia')).toBe(true)
    corretor.adicionarPalavra('jusia')
    expect(corretor.verificarTexto('Isso e um jusia.').some((erro) => erro.palavra === 'jusia')).toBe(false)
  })
})
```

Note: o teste usa `Seirmg` (com apenas a primeira letra maiúscula), não `SEIRMG` — uma sigla toda em caixa alta seria filtrada pelo `tokenizar` (Task 2) antes mesmo de chegar no dicionário, e o teste então não estaria de fato exercitando o parâmetro `palavrasIgnoradas` de `criarCorretor`. Note também que `criarCorretor` agora é `async` — cada teste precisa de `await` na chamada.

- [ ] **Step 4: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/features/corretor-ortografico/corretor.test.ts`
Expected: FAIL — módulo `./corretor` não existe ainda (ou, se uma tentativa anterior deixou um `corretor.ts` baseado em `nspell`, os testes vão falhar porque `criarCorretor()` sem `await` retorna uma Promise, não um `Corretor` — o que confirma que o arquivo antigo precisa ser reescrito no Step 5).

- [ ] **Step 5: Implementar**

Se `src/vite-env.d.ts` ainda não declara os módulos `*.aff?raw`/`*.dic?raw` (uma tentativa anterior pode já ter feito isso — confira antes), adicione, seguindo o padrão já existente para `*.svg?raw` no mesmo arquivo:

```ts
declare module '*.aff?raw' {
  const content: string
  export default content
}

declare module '*.dic?raw' {
  const content: string
  export default content
}
```

Crie (ou sobrescreva, se uma tentativa anterior deixou uma versão baseada em `nspell`) `src/features/corretor-ortografico/corretor.ts`:

```ts
import { loadModule } from 'hunspell-asm'
import affTexto from './dicionario/pt-br.aff?raw'
import dicTexto from './dicionario/pt-br.dic?raw'
import { tokenizar } from './tokenizador'

export interface ErroOrtografico {
  palavra: string
  inicio: number
  fim: number
  sugestoes: string[]
}

export interface Corretor {
  verificarTexto: (texto: string) => ErroOrtografico[]
  adicionarPalavra: (palavra: string) => void
}

export async function criarCorretor(palavrasIgnoradas: string[] = []): Promise<Corretor> {
  const fabrica = await loadModule()
  const codificador = new TextEncoder()
  const caminhoAff = fabrica.mountBuffer(codificador.encode(affTexto), 'pt-br.aff')
  const caminhoDic = fabrica.mountBuffer(codificador.encode(dicTexto), 'pt-br.dic')
  const hunspell = fabrica.create(caminhoAff, caminhoDic)

  palavrasIgnoradas.forEach((palavra) => hunspell.addWord(palavra))

  return {
    verificarTexto(texto: string): ErroOrtografico[] {
      return tokenizar(texto).flatMap((token) => {
        if (hunspell.spell(token.palavra)) return []
        return [
          {
            palavra: token.palavra,
            inicio: token.inicio,
            fim: token.fim,
            sugestoes: hunspell.suggest(token.palavra).slice(0, 5),
          },
        ]
      })
    },
    adicionarPalavra(palavra: string): void {
      hunspell.addWord(palavra)
    },
  }
}
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/features/corretor-ortografico/corretor.test.ts`
Expected: PASS (5 testes). Como o motor agora é WebAssembly aplicando afixos sob demanda (não expandindo o dicionário inteiro antecipadamente como o `nspell` fazia), a carga deve ser rápida — segundos, não minutos. **Se o teste ficar rodando por mais de ~30 segundos sem terminar, pare (Ctrl+C) e reporte BLOCKED** com o que observou — não deixe rodando indefinidamente “pra ver se termina”.

- [ ] **Step 7: Typecheck e commit**

Run: `npx tsc --noEmit`
Expected: sem erros

```bash
git add src/features/corretor-ortografico/dicionario/ src/features/corretor-ortografico/corretor.ts src/features/corretor-ortografico/corretor.test.ts src/vite-env.d.ts package.json bun.lock
git commit -m "feat(corretor-ortografico): dicionário pt-BR vendorizado + verificador com hunspell-asm"
```

---

### Task 5: Integração no editor de documentos (CKEditor)

**Files:**
- Modify: `src/content-scripts/documento_editar/index.ts`
- Create: `src/content-scripts/documento_editar/corretorOrtografico.ts`

**Interfaces:**
- Consumes: `criarCorretor`, `type Corretor`, `type ErroOrtografico` de `../../features/corretor-ortografico/corretor` (Task 4); `diffarParagrafos`, `type ParagrafoAtual` de `../../features/corretor-ortografico/diffParagrafos` (Task 3); `createSyncConfigStore`, `type CorretorOrtograficoConfig` de `../../lib/storage` (Task 1); `type EditorCKEditor` de `./index` (exportado neste task)
- Produces: `export async function iniciarCorretorOrtografico(editor: EditorCKEditor, config: CorretorOrtograficoConfig): Promise<void>`

Sem teste automatizado (manipulação de DOM/CKEditor real, não simulável em Vitest) — protegido por `try`/`catch`, seguindo o padrão já usado em `bootstrap()`.

- [ ] **Step 1: Ampliar a interface `EditorCKEditor` em `index.ts` e exportá-la**

Em `src/content-scripts/documento_editar/index.ts`, troque:

```ts
interface EditorCKEditor {
  getSelection: () => { getSelectedText: () => string } | null
  insertHtml: (html: string) => void
  editable?: () => { getText: () => string } | undefined
}
```

por:

```ts
export interface EditorCKEditor {
  getSelection: () => { getSelectedText: () => string } | null
  insertHtml: (html: string) => void
  insertText: (texto: string) => void
  editable?: () => { getText: () => string } | undefined
  document: {
    $: Document
    getBody: () => { $: HTMLElement }
    getWindow: () => { $: Window }
  }
}
```

- [ ] **Step 2: Ligar a inicialização do corretor em `bootstrap()`**

Em `src/content-scripts/documento_editar/index.ts`, troque a função `bootstrap` inteira por:

```ts
async function bootstrap(): Promise<void> {
  try {
    const config = await createSyncConfigStore().get()

    if (config.ferramentasIA.ativo) {
      injetarEstilos()
      esperarCKEditor(() => {
        const editor = obterInstanciaCKEditor()
        if (!editor) return
        montarBotaoFlutuante(editor, config.ferramentasIA)
      })
    }

    if (config.corretorOrtografico.ativo) {
      esperarCKEditor(() => {
        const editor = obterInstanciaCKEditor()
        if (!editor) return
        import('./corretorOrtografico')
          .then(({ iniciarCorretorOrtografico }) =>
            iniciarCorretorOrtografico(editor, config.corretorOrtografico)
          )
          .catch((error) => {
            console.error('[SEIRMG] Falha ao inicializar corretor ortográfico:', error)
          })
      })
    }
  } catch (error) {
    console.error('[SEIRMG] Falha ao inicializar recursos do editor de documentos:', error)
  }
}
```

- [ ] **Step 3: Rodar o typecheck (a ampliação da interface não pode quebrar nada existente)**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 4: Criar o módulo de integração**

Crie `src/content-scripts/documento_editar/corretorOrtografico.ts`:

```ts
import { criarCorretor, type Corretor, type ErroOrtografico } from '../../features/corretor-ortografico/corretor'
import { diffarParagrafos, type ParagrafoAtual } from '../../features/corretor-ortografico/diffParagrafos'
import { createSyncConfigStore, type CorretorOrtograficoConfig } from '../../lib/storage'
import type { EditorCKEditor } from './index'

const NOME_HIGHLIGHT = 'seirmg-erro-ortografico'
const ATRASO_DEBOUNCE_MS = 600

interface ErroComRange extends ErroOrtografico {
  range: Range
}

interface JanelaComHighlightApi {
  Highlight: new (...ranges: Range[]) => object
  CSS: { highlights: { set: (nome: string, destaque: object) => void } }
  getSelection: () => Selection | null
}

let corretor: Corretor | null = null
let proximoIdParagrafo = 0
let temporizadorDebounce: ReturnType<typeof setTimeout> | undefined
const textoAnteriorPorParagrafo = new Map<string, string>()
const errosPorParagrafo = new Map<string, ErroComRange[]>()

function obterParagrafos(corpo: HTMLElement): HTMLElement[] {
  const elementos = Array.from(corpo.querySelectorAll<HTMLElement>('p, li, td, th'))
  return elementos.length > 0 ? elementos : [corpo]
}

function obterOuCriarIdParagrafo(elemento: HTMLElement): string {
  const existente = elemento.getAttribute('data-seirmg-par-id')
  if (existente) return existente
  const novoId = `p${proximoIdParagrafo++}`
  elemento.setAttribute('data-seirmg-par-id', novoId)
  return novoId
}

function localizarPosicao(elemento: HTMLElement, offsetAlvo: number): { node: Text; offset: number } | null {
  const documentoDoElemento = elemento.ownerDocument
  const walker = documentoDoElemento.createTreeWalker(elemento, NodeFilter.SHOW_TEXT)
  let acumulado = 0
  let atual = walker.nextNode() as Text | null
  while (atual) {
    const tamanho = atual.data.length
    if (offsetAlvo <= acumulado + tamanho) {
      return { node: atual, offset: offsetAlvo - acumulado }
    }
    acumulado += tamanho
    atual = walker.nextNode() as Text | null
  }
  return null
}

function criarRangeDaPalavra(elemento: HTMLElement, inicio: number, fim: number): Range | null {
  const posInicio = localizarPosicao(elemento, inicio)
  const posFim = localizarPosicao(elemento, fim)
  if (!posInicio || !posFim) return null
  const range = elemento.ownerDocument.createRange()
  range.setStart(posInicio.node, posInicio.offset)
  range.setEnd(posFim.node, posFim.offset)
  return range
}

function obterJanelaComHighlight(editor: EditorCKEditor): JanelaComHighlightApi {
  return editor.document.getWindow().$ as unknown as JanelaComHighlightApi
}

function atualizarDestaque(editor: EditorCKEditor): void {
  const janela = obterJanelaComHighlight(editor)
  const todosOsRanges = Array.from(errosPorParagrafo.values()).flatMap((erros) =>
    erros.map((erro) => erro.range)
  )
  const destaque = new janela.Highlight(...todosOsRanges)
  janela.CSS.highlights.set(NOME_HIGHLIGHT, destaque)
}

function atualizarIndicador(): void {
  const totalErros = Array.from(errosPorParagrafo.values()).reduce((soma, erros) => soma + erros.length, 0)
  let indicador = document.getElementById('seirmg-indicador-corretor')
  if (!indicador) {
    indicador = document.createElement('div')
    indicador.id = 'seirmg-indicador-corretor'
    document.body.appendChild(indicador)
  }
  indicador.textContent =
    totalErros > 0 ? `Corretor: ${totalErros} erro(s) encontrado(s)` : 'Corretor: nenhum erro encontrado'
}

function reescanearAlterados(editor: EditorCKEditor): void {
  if (!corretor) return
  const corpo = editor.document.getBody().$
  const elementosParagrafo = obterParagrafos(corpo)

  const atuais = elementosParagrafo.map((elemento) => ({
    elemento,
    id: obterOuCriarIdParagrafo(elemento),
    texto: elemento.textContent ?? '',
  }))

  const paragrafosParaDiff: ParagrafoAtual[] = atuais.map(({ id, texto }) => ({ id, texto }))
  const { novosOuAlterados, removidos } = diffarParagrafos(paragrafosParaDiff, textoAnteriorPorParagrafo)

  removidos.forEach((id) => {
    textoAnteriorPorParagrafo.delete(id)
    errosPorParagrafo.delete(id)
  })

  novosOuAlterados.forEach((id) => {
    const paragrafo = atuais.find((item) => item.id === id)
    if (!paragrafo || !corretor) return
    textoAnteriorPorParagrafo.set(id, paragrafo.texto)

    const erros = corretor.verificarTexto(paragrafo.texto)
    const errosComRange = erros.flatMap((erro) => {
      const range = criarRangeDaPalavra(paragrafo.elemento, erro.inicio, erro.fim)
      return range ? [{ ...erro, range }] : []
    })
    errosPorParagrafo.set(id, errosComRange)
  })

  atualizarDestaque(editor)
  atualizarIndicador()
}

function agendarReescaneamento(editor: EditorCKEditor): void {
  if (temporizadorDebounce) clearTimeout(temporizadorDebounce)
  temporizadorDebounce = setTimeout(() => reescanearAlterados(editor), ATRASO_DEBOUNCE_MS)
}

function encontrarErroNoPonto(x: number, y: number): ErroComRange | null {
  for (const erros of errosPorParagrafo.values()) {
    for (const erro of erros) {
      const retangulos = Array.from(erro.range.getClientRects())
      const dentro = retangulos.some(
        (retangulo) => x >= retangulo.left && x <= retangulo.right && y >= retangulo.top && y <= retangulo.bottom
      )
      if (dentro) return erro
    }
  }
  return null
}

function fecharMenuSugestoes(documentoEditor: Document): void {
  documentoEditor.getElementById('seirmg-menu-corretor')?.remove()
}

function aplicarSugestao(erro: ErroComRange, sugestao: string, editor: EditorCKEditor): void {
  const janela = obterJanelaComHighlight(editor)
  const selecao = janela.getSelection()
  if (!selecao) return
  selecao.removeAllRanges()
  selecao.addRange(erro.range.cloneRange())
  editor.insertText(sugestao)
}

function ignorarOcorrencia(erro: ErroComRange, editor: EditorCKEditor): void {
  errosPorParagrafo.forEach((erros, id) => {
    const filtrados = erros.filter((item) => item !== erro)
    if (filtrados.length !== erros.length) errosPorParagrafo.set(id, filtrados)
  })
  atualizarDestaque(editor)
  atualizarIndicador()
}

async function adicionarAoDicionario(palavra: string, editor: EditorCKEditor): Promise<void> {
  if (!corretor) return
  corretor.adicionarPalavra(palavra)

  const store = createSyncConfigStore()
  const config = await store.get()
  if (!config.corretorOrtografico.palavrasIgnoradas.includes(palavra)) {
    await store.set({
      ...config,
      corretorOrtografico: {
        ...config.corretorOrtografico,
        palavrasIgnoradas: [...config.corretorOrtografico.palavrasIgnoradas, palavra],
      },
    })
  }

  errosPorParagrafo.forEach((erros, id) => {
    errosPorParagrafo.set(
      id,
      erros.filter((erro) => erro.palavra !== palavra)
    )
  })
  atualizarDestaque(editor)
  atualizarIndicador()
}

function abrirMenuSugestoes(
  erro: ErroComRange,
  x: number,
  y: number,
  editor: EditorCKEditor,
  documentoEditor: Document
): void {
  fecharMenuSugestoes(documentoEditor)

  const menu = documentoEditor.createElement('div')
  menu.id = 'seirmg-menu-corretor'
  menu.style.cssText = `position: fixed; left: ${x}px; top: ${y}px;`

  const tag = documentoEditor.createElement('div')
  tag.className = 'seirmg-menu-corretor-tag'
  tag.textContent = 'SEIRMG · corretor'
  menu.appendChild(tag)

  erro.sugestoes.forEach((sugestao) => {
    const item = documentoEditor.createElement('div')
    item.className = 'seirmg-menu-corretor-item'
    item.textContent = sugestao
    item.addEventListener('click', () => {
      aplicarSugestao(erro, sugestao, editor)
      fecharMenuSugestoes(documentoEditor)
    })
    menu.appendChild(item)
  })

  menu.appendChild(documentoEditor.createElement('hr'))

  const itemIgnorar = documentoEditor.createElement('div')
  itemIgnorar.className = 'seirmg-menu-corretor-item'
  itemIgnorar.textContent = 'Ignorar'
  itemIgnorar.addEventListener('click', () => {
    ignorarOcorrencia(erro, editor)
    fecharMenuSugestoes(documentoEditor)
  })
  menu.appendChild(itemIgnorar)

  const itemAdicionar = documentoEditor.createElement('div')
  itemAdicionar.className = 'seirmg-menu-corretor-item'
  itemAdicionar.textContent = 'Adicionar ao dicionário'
  itemAdicionar.addEventListener('click', () => {
    adicionarAoDicionario(erro.palavra, editor).catch((error) => {
      console.error('[SEIRMG] Falha ao adicionar palavra ao dicionário:', error)
    })
    fecharMenuSugestoes(documentoEditor)
  })
  menu.appendChild(itemAdicionar)

  documentoEditor.body.appendChild(menu)
  documentoEditor.addEventListener('click', () => fecharMenuSugestoes(documentoEditor), { once: true })
}

function tratarContextMenu(evento: MouseEvent, editor: EditorCKEditor, documentoEditor: Document): void {
  const erro = encontrarErroNoPonto(evento.clientX, evento.clientY)
  if (!erro) return
  evento.preventDefault()
  evento.stopPropagation()
  abrirMenuSugestoes(erro, evento.clientX, evento.clientY, editor, documentoEditor)
}

const ESTILO_MENU = `
  #seirmg-menu-corretor {
    min-width: 200px;
    background: #fff;
    border: 1px solid #0f8a6b;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0,0,0,.2);
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
    padding: 6px 0;
    z-index: 999999;
  }
  .seirmg-menu-corretor-tag {
    padding: 2px 12px 6px;
    margin-bottom: 4px;
    border-bottom: 1px solid #eee;
    font-size: 10px;
    letter-spacing: .05em;
    text-transform: uppercase;
    color: #0f8a6b;
    font-weight: bold;
  }
  .seirmg-menu-corretor-item {
    padding: 6px 12px;
    cursor: pointer;
  }
  .seirmg-menu-corretor-item:hover {
    background: #e5f6f1;
  }
  #seirmg-menu-corretor hr {
    border: none;
    border-top: 1px solid #eee;
    margin: 4px 0;
  }
`

const ESTILO_DESTAQUE = `::highlight(${NOME_HIGHLIGHT}) { text-decoration: red wavy underline; text-underline-offset: 2px; }`

const ESTILO_INDICADOR = `
  #seirmg-indicador-corretor {
    position: fixed;
    top: 58px;
    right: 20px;
    z-index: 10000;
    font-size: 11px;
    color: #666;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 10px;
    padding: 2px 10px;
  }
`

function injetarEstiloSeAusente(documentoAlvo: Document, id: string, css: string): void {
  if (documentoAlvo.getElementById(id)) return
  const estilo = documentoAlvo.createElement('style')
  estilo.id = id
  estilo.textContent = css
  documentoAlvo.head.appendChild(estilo)
}

export async function iniciarCorretorOrtografico(
  editor: EditorCKEditor,
  config: CorretorOrtograficoConfig
): Promise<void> {
  corretor = await criarCorretor(config.palavrasIgnoradas)

  const documentoEditor = editor.document.$
  const corpo = editor.document.getBody().$

  injetarEstiloSeAusente(documentoEditor, 'seirmg-estilo-destaque-corretor', ESTILO_DESTAQUE)
  injetarEstiloSeAusente(documentoEditor, 'seirmg-estilo-menu-corretor', ESTILO_MENU)
  injetarEstiloSeAusente(document, 'seirmg-estilo-indicador-corretor', ESTILO_INDICADOR)

  corpo.addEventListener('input', () => agendarReescaneamento(editor))
  corpo.addEventListener('contextmenu', (evento) => tratarContextMenu(evento, editor, documentoEditor), true)

  reescanearAlterados(editor)
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 6: Rodar a suíte completa de testes (garantir que nada quebrou)**

Run: `npx vitest run`
Expected: PASS em todos os arquivos

- [ ] **Step 7: Teste manual no SEI real**

1. Ative `corretorOrtografico.ativo` manualmente via `chrome.storage.sync` (ou complete a Task 6 primeiro e use a tela de Opções).
2. Abra um documento no editor do SEI, digite uma palavra errada (ex.: "contem"), espere ~1s.
3. Confirme visualmente: sublinhado ondulado vermelho aparece sob a palavra; o indicador "Corretor: 1 erro(s) encontrado(s)" aparece perto do botão de Ferramentas de IA.
4. Clique com o botão direito na palavra sublinhada → confirme que aparece o menu do SEIRMG (não o do CKEditor) com sugestões.
5. Clique numa sugestão → confirme que o texto é corrigido e que Ctrl+Z desfaz a correção.
6. Clique com o botão direito num trecho **sem** erro → confirme que o menu do CKEditor abre normalmente (cortar/copiar/colar), sem qualquer interferência.

- [ ] **Step 8: Commit**

```bash
git add src/content-scripts/documento_editar/index.ts src/content-scripts/documento_editar/corretorOrtografico.ts
git commit -m "feat(corretor-ortografico): integração no editor de documentos (sublinhado + menu de contexto)"
```

---

### Task 6: Aba de configuração no Options

**Files:**
- Modify: `src/options/index.html`
- Modify: `src/options/main.ts`

Sem teste automatizado (DOM da página de Opções, mesmo padrão das demais `carregarAbaX()` já existentes em `main.ts`).

- [ ] **Step 1: Adicionar o botão de aba e o painel no HTML**

Em `src/options/index.html`, adicione o botão de aba dentro de `<nav id="abas">` (por exemplo, logo após o de "Editor de Documentos"):

```html
        <button data-aba="corretor" class="aba-btn">Corretor Ortográfico</button>
```

E adicione o painel (por exemplo, logo após `</section>` do `painel-editor`, antes de `<section id="painel-ia"`):

```html
    <section id="painel-corretor" class="painel">
      <h2>Corretor Ortográfico</h2>
      <label>
        <input type="checkbox" id="corretor-ativo" />
        Ativar corretor ortográfico no editor de documentos
      </label>
      <h3>Palavras adicionadas ao dicionário</h3>
      <div id="corretor-palavras-lista"></div>
      <br />
      <button id="corretor-salvar">Salvar</button>
      <span id="corretor-status"></span>
    </section>
```

- [ ] **Step 2: Registrar o ícone da aba em `main.ts`**

Em `src/options/main.ts`, adicione o import do ícone junto dos outros (topo do arquivo):

```ts
import spellCheckIconSvg from 'lucide-static/icons/spell-check.svg?raw'
```

E adicione a entrada em `ICONES_ABA`:

```ts
  corretor: spellCheckIconSvg,
```

- [ ] **Step 3: Implementar `carregarAbaCorretor()`**

Não precisa de nenhum import novo de `../lib/storage` além do que já existe (`createSyncConfigStore`) — o tipo de `atualizado` é inferido a partir de `config`, mesmo padrão de `carregarAbaAssinatura`/`carregarAbaEditor`.

Adicione, junto da interface `RegraPontoControleEditavel` já existente no topo do arquivo, uma segunda interface auxiliar (o `montarListaEditavel` exige `T extends Record<string, string>`, por isso a assinatura de índice `[chave: string]: string`, mesmo padrão de `RegraPontoControleEditavel`):

```ts
interface PalavraIgnoradaEditavel {
  palavra: string
  [chave: string]: string
}
```

Adicione a função (por exemplo, logo após `carregarAbaEditor`):

```ts
async function carregarAbaCorretor(): Promise<void> {
  try {
    const store = createSyncConfigStore()
    const config = await store.get()

    const inputAtivo = document.getElementById('corretor-ativo') as HTMLInputElement | null
    const status = document.getElementById('corretor-status')

    if (inputAtivo) inputAtivo.checked = config.corretorOrtografico.ativo

    const containerPalavras = document.getElementById('corretor-palavras-lista')
    const listaPalavras = containerPalavras
      ? montarListaEditavel<PalavraIgnoradaEditavel>(
          containerPalavras,
          [{ chave: 'palavra', rotulo: 'Palavra', tipo: 'text' }],
          config.corretorOrtografico.palavrasIgnoradas.map((palavra) => ({ palavra }))
        )
      : null

    document.getElementById('corretor-salvar')?.addEventListener('click', async () => {
      try {
        const atualizado = {
          ...config,
          corretorOrtografico: {
            ativo: inputAtivo?.checked ?? false,
            palavrasIgnoradas: (listaPalavras?.obterItens() ?? []).map((item) => item.palavra),
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
        console.error('[SEIRMG] Falha ao salvar configuração do corretor ortográfico:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao carregar aba do corretor ortográfico:', error)
  }
}
```

Chame a função junto das demais, no final do arquivo:

```ts
carregarAbaCorretor()
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 5: Teste manual**

Run: `npm run dev`

1. Carregue a extensão no Chrome (modo desenvolvedor, `dist/`) e abra a página de Opções.
2. Confirme que a aba "Corretor Ortográfico" aparece com o ícone certo.
3. Marque o checkbox, clique Salvar, recarregue a página de Opções e confirme que o checkbox continua marcado.
4. Adicione uma palavra na lista, salve, recarregue, confirme que a palavra persistiu.

- [ ] **Step 6: Commit**

```bash
git add src/options/index.html src/options/main.ts
git commit -m "feat(corretor-ortografico): aba de configuração nas Opções"
```
