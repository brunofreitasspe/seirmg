# SEIRMG — Lote D: Controle de Processos — Prazos, Cor por Especificação e Especificação na Listagem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar `incluirCalculoPrazos.js`, `marcarCorProcesso.js`, `mostrarEspecificacao.js` e `listaPorEspecificacao.js` do Sei++ para o SEIRMG, atuando sobre as tabelas da tela Controle de Processos (`acao=procedimento_controlar`), mais um componente de lista editável genérico e reutilizável para a UI de regras "especificação → cor".

**Architecture:** Ver `docs/superpowers/specs/2026-07-07-seirmg-lote-d-controle-processos-design.md`. Mesmo padrão já estabelecido: lógica pura testável em `features/`, componente de UI reutilizável testável em `options/` (segue o precedente de `tabs.ts`/`tabs.test.ts`), wiring fino não-testado em `content-scripts/`/`options/main.ts`.

**Tech Stack:** TypeScript, Vite, `@crxjs/vite-plugin`, Bun, Vitest — mesma infraestrutura já existente. Nenhuma dependência nova.

## Global Constraints

- Nenhuma permissão nova, nenhum host novo — só um bloco a mais de `content_scripts`, `matches` restrito a `acao=procedimento_controlar*`.
- Cada extração de texto do atributo `onmouseover` é portada fielmente e separadamente por arquivo original (não unificar em uma função só) — os 3 arquivos usam limites de substring ligeiramente diferentes; sem acesso a uma instância SEI ao vivo para confirmar equivalência, o porte literal evita regressão silenciosa.
- Todo listener/callback assíncrono novo segue o padrão já estabelecido: guard `try/catch`, loga via `console.error('[SEIRMG] ...', error)`, nunca lança exceção não tratada.
- `montarListaEditavel` é genérico (`campos` configurável, não hardcoded para "valor/cor") — o lote seguinte (ponto de controle) vai reaproveitá-lo sem alterações.

---

## Mapa de arquivos (visão geral)

```
seirmg/
├── manifest.config.ts (modificado)
├── src/
│   ├── lib/storage.ts (modificado)
│   ├── features/controle-processos/
│   │   ├── prazos.ts (+ .test.ts, novo)
│   │   ├── corProcesso.ts (+ .test.ts, novo)
│   │   └── especificacao.ts (+ .test.ts, novo)
│   ├── options/
│   │   ├── listaEditavel.ts (+ .test.ts, novo)
│   │   ├── index.html (modificado)
│   │   └── main.ts (modificado)
│   └── content-scripts/procedimento_controlar/index.ts (novo)
```

---

### Task 1: `lib/storage.ts` — schema de `controleProcessos`

**Files:**
- Modify: `C:\sei\seirmg\src\lib\storage.ts`
- Modify: `C:\sei\seirmg\src\lib\storage.test.ts`

**Interfaces:**
- Consumes: nenhuma
- Produces: `ConfiguracaoCor { valor: string; cor: string }`; `PrazosConfig { ativo, exibirDias, exibirPrazo, alertaDias, criticoDias, alertaPrazo, criticoPrazo }`; `CoresProcessoConfig { ativo, regras: ConfiguracaoCor[] }`; `ModoEspecificacao = 'mostrar' | 'substituir'`; `EspecificacaoConfig { ativo, modo }`; `ControleProcessosConfig { prazos, coresProcesso, especificacao }`; `SyncConfig.controleProcessos: ControleProcessosConfig`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final do `describe('createSyncConfigStore', ...)` já existente em `src/lib/storage.test.ts`:

```ts
  it('inclui controleProcessos padrão quando vazio', async () => {
    const store = createSyncConfigStore(criarAreaFalsa())
    expect((await store.get()).controleProcessos).toEqual({
      prazos: {
        ativo: true,
        exibirDias: true,
        exibirPrazo: true,
        alertaDias: 30,
        criticoDias: 60,
        alertaPrazo: 10,
        criticoPrazo: 5,
      },
      coresProcesso: { ativo: true, regras: [] },
      especificacao: { ativo: true, modo: 'mostrar' },
    })
  })

  it('persiste alteração de controleProcessos', async () => {
    const area = criarAreaFalsa()
    const store = createSyncConfigStore(area)
    const atualizado = {
      ...DEFAULT_SYNC_CONFIG,
      controleProcessos: {
        ...DEFAULT_SYNC_CONFIG.controleProcessos,
        coresProcesso: {
          ativo: false,
          regras: [{ valor: 'orçamento', cor: '#ff0000' }],
        },
      },
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/lib/storage.test.ts`
Expected: FAIL — `controleProcessos` é `undefined` (campo ainda não existe em `SyncConfig`/`DEFAULT_SYNC_CONFIG`)

- [ ] **Step 3: Implementar em `src/lib/storage.ts`**

Adicionar as interfaces novas (antes de `SyncConfig`, depois de `ProcessosNovosConfig`):

```ts
export interface ConfiguracaoCor {
  valor: string
  cor: string
}

export interface PrazosConfig {
  ativo: boolean
  exibirDias: boolean
  exibirPrazo: boolean
  alertaDias: number
  criticoDias: number
  alertaPrazo: number
  criticoPrazo: number
}

export interface CoresProcessoConfig {
  ativo: boolean
  regras: ConfiguracaoCor[]
}

export type ModoEspecificacao = 'mostrar' | 'substituir'

export interface EspecificacaoConfig {
  ativo: boolean
  modo: ModoEspecificacao
}

export interface ControleProcessosConfig {
  prazos: PrazosConfig
  coresProcesso: CoresProcessoConfig
  especificacao: EspecificacaoConfig
}
```

Modificar `SyncConfig` (adicionar o campo `controleProcessos` depois de `processosNovos`):

```ts
export interface SyncConfig {
  schemaVersion: 1
  featureFlags: FeatureFlags
  tema: ThemeConfig
  blocoAssinatura: BlocoAssinaturaConfig
  processosNovos: ProcessosNovosConfig
  controleProcessos: ControleProcessosConfig
}
```

Modificar `DEFAULT_SYNC_CONFIG` (adicionar `controleProcessos` depois de `processosNovos`):

```ts
  controleProcessos: {
    prazos: {
      ativo: true,
      exibirDias: true,
      exibirPrazo: true,
      alertaDias: 30,
      criticoDias: 60,
      alertaPrazo: 10,
      criticoPrazo: 5,
    },
    coresProcesso: {
      ativo: true,
      regras: [],
    },
    especificacao: {
      ativo: true,
      modo: 'mostrar',
    },
  },
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/lib/storage.test.ts`
Expected: PASS (14 testes — 12 já existentes + 2 novos)

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "feat(storage): add controleProcessos config schema"
```

---

### Task 2: `features/controle-processos/prazos.ts`

**Files:**
- Create: `C:\sei\seirmg\src\features\controle-processos\prazos.ts`
- Test: `C:\sei\seirmg\src\features\controle-processos\prazos.test.ts`

**Contexto**: porte de `C:\sei\seiplus\cs_modules\procedimento_controlar\incluirCalculoPrazos.js`.

**Interfaces:**
- Consumes: nenhuma
- Produces: `type TipoCalculoPrazo = 'prazo' | 'qtddias'`; `extrairTextoMarcador(onmouseover: string): string`; `isValidDate(dataString: string): boolean`; `calcularDiasDoMarcador(textosMarcadores: string[], tipo: TipoCalculoPrazo, agora: Date): number | null`; `interface ConfiguracaoLimites { alerta: number; critico: number }`; `classificarPrazo(valor: number, tipo: TipoCalculoPrazo, config: ConfiguracaoLimites): 'alerta' | 'critico' | null`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/features/controle-processos/prazos.test.ts
import { describe, expect, it } from 'vitest'
import { calcularDiasDoMarcador, classificarPrazo, extrairTextoMarcador, isValidDate } from './prazos'

describe('extrairTextoMarcador', () => {
  it('extrai o texto entre as duas primeiras aspas simples', () => {
    expect(extrairTextoMarcador("mostrarDica(this,'Concluído em 01/01/2026')")).toBe(
      'Concluído em 01/01/2026'
    )
  })

  it('retorna string vazia quando não há aspas suficientes', () => {
    expect(extrairTextoMarcador('semAspas')).toBe('')
  })
})

describe('isValidDate', () => {
  it('aceita datas válidas no formato dd/mm/yyyy', () => {
    expect(isValidDate('01/01/2026')).toBe(true)
  })

  it('rejeita datas com dia inválido', () => {
    expect(isValidDate('31/02/2026')).toBe(false)
  })

  it('rejeita strings fora do formato', () => {
    expect(isValidDate('2026-01-01')).toBe(false)
  })

  it('rejeita string vazia', () => {
    expect(isValidDate('')).toBe(false)
  })
})

describe('calcularDiasDoMarcador', () => {
  const agora = new Date(2026, 0, 10)

  it('calcula dias corridos (qtddias) desde a data do marcador', () => {
    expect(calcularDiasDoMarcador(['aberto em 01/01/2026'], 'qtddias', agora)).toBe(9)
  })

  it('calcula dias restantes (prazo) até a data do marcador, exigindo prefixo "ate "', () => {
    expect(calcularDiasDoMarcador(['ate 20/01/2026'], 'prazo', agora)).toBe(11)
  })

  it('ignora marcador de prazo sem o prefixo "ate "', () => {
    expect(calcularDiasDoMarcador(['aberto em 20/01/2026'], 'prazo', agora)).toBeNull()
  })

  it('usa o primeiro marcador válido e ignora os inválidos anteriores', () => {
    expect(calcularDiasDoMarcador(['texto sem data', 'ate 20/01/2026'], 'prazo', agora)).toBe(11)
  })

  it('retorna null quando nenhum marcador tem data válida', () => {
    expect(calcularDiasDoMarcador(['sem data aqui'], 'qtddias', agora)).toBeNull()
  })

  it('normaliza acento e caixa antes de interpretar o prefixo', () => {
    expect(calcularDiasDoMarcador(['ATÉ 20/01/2026'], 'prazo', agora)).toBe(11)
  })
})

describe('classificarPrazo', () => {
  const configDias = { alerta: 30, critico: 60 }
  const configPrazo = { alerta: 10, critico: 5 }

  it('qtddias: classifica alerta quando entre alerta (exclusive) e crítico (inclusive)', () => {
    expect(classificarPrazo(31, 'qtddias', configDias)).toBe('alerta')
    expect(classificarPrazo(60, 'qtddias', configDias)).toBe('alerta')
  })

  it('qtddias: classifica crítico quando acima do crítico', () => {
    expect(classificarPrazo(61, 'qtddias', configDias)).toBe('critico')
  })

  it('qtddias: não classifica quando dentro do normal', () => {
    expect(classificarPrazo(30, 'qtddias', configDias)).toBeNull()
  })

  it('prazo: classifica alerta quando entre crítico (inclusive) e alerta (exclusive)', () => {
    expect(classificarPrazo(5, 'prazo', configPrazo)).toBe('alerta')
    expect(classificarPrazo(9, 'prazo', configPrazo)).toBe('alerta')
  })

  it('prazo: classifica crítico quando abaixo do crítico', () => {
    expect(classificarPrazo(4, 'prazo', configPrazo)).toBe('critico')
  })

  it('prazo: não classifica quando dentro do normal', () => {
    expect(classificarPrazo(10, 'prazo', configPrazo)).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/features/controle-processos/prazos.test.ts`
Expected: FAIL — `Cannot find module './prazos'`

- [ ] **Step 3: Implementar `src/features/controle-processos/prazos.ts`**

```ts
export type TipoCalculoPrazo = 'prazo' | 'qtddias'

export function extrairTextoMarcador(onmouseover: string): string {
  const primeiraAspas = onmouseover.indexOf("'")
  const segundaAspas = onmouseover.indexOf("'", primeiraAspas + 1)
  return onmouseover.substring(primeiraAspas + 1, segundaAspas)
}

export function isValidDate(dataString: string): boolean {
  const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/
  const match = dataString.match(regex)
  if (!match) return false

  const dia = parseInt(match[1], 10)
  const mes = parseInt(match[2], 10) - 1
  const ano = parseInt(match[3], 10)

  const data = new Date(ano, mes, dia)

  return data.getFullYear() === ano && data.getMonth() === mes && data.getDate() === dia
}

function calcularDiferencaDias(dataStr: string, tipo: TipoCalculoPrazo, agora: Date): number {
  const [dia, mes, ano] = dataStr.split('/').map(Number)
  const data = new Date(ano, mes - 1, dia)
  const msPorDia = 1000 * 60 * 60 * 24

  if (tipo === 'qtddias') {
    return Math.floor((agora.getTime() - data.getTime()) / msPorDia)
  }
  return Math.floor((data.getTime() - agora.getTime()) / msPorDia) + 1
}

export function calcularDiasDoMarcador(
  textosMarcadores: string[],
  tipo: TipoCalculoPrazo,
  agora: Date
): number | null {
  for (const textoOriginal of textosMarcadores) {
    const texto = textoOriginal.toLowerCase().replace('é', 'e')
    let dataStr: string

    if (tipo === 'prazo') {
      if (texto.indexOf('ate ') !== 0) continue
      dataStr = texto.substr(4, 10)
    } else {
      dataStr = texto.substr(0, 10)
    }

    if (isValidDate(dataStr)) {
      return calcularDiferencaDias(dataStr, tipo, agora)
    }
  }
  return null
}

export interface ConfiguracaoLimites {
  alerta: number
  critico: number
}

export function classificarPrazo(
  valor: number,
  tipo: TipoCalculoPrazo,
  config: ConfiguracaoLimites
): 'alerta' | 'critico' | null {
  if (tipo === 'qtddias') {
    if (valor > config.alerta && valor <= config.critico) return 'alerta'
    if (valor > config.critico) return 'critico'
  } else {
    if (valor >= config.critico && valor < config.alerta) return 'alerta'
    if (valor < config.critico) return 'critico'
  }
  return null
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/features/controle-processos/prazos.test.ts`
Expected: PASS (18 testes)

- [ ] **Step 5: Commit**

```bash
git add src/features/controle-processos/prazos.ts src/features/controle-processos/prazos.test.ts
git commit -m "feat(controle-processos): add prazo/dias calculation and classification helpers"
```

---

### Task 3: `features/controle-processos/corProcesso.ts`

**Files:**
- Create: `C:\sei\seirmg\src\features\controle-processos\corProcesso.ts`
- Test: `C:\sei\seirmg\src\features\controle-processos\corProcesso.test.ts`

**Contexto**: porte de `C:\sei\seiplus\cs_modules\procedimento_controlar\marcarCorProcesso.js`.

**Interfaces:**
- Consumes: `ConfiguracaoCor` (Task 1, `../../lib/storage`)
- Produces: `extrairEspecificacaoParaCor(onmouseover: string): string`; `escolherCorProcesso(especificacao: string, configuracoes: ConfiguracaoCor[]): string | null`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/features/controle-processos/corProcesso.test.ts
import { describe, expect, it } from 'vitest'
import { escolherCorProcesso, extrairEspecificacaoParaCor } from './corProcesso'

describe('extrairEspecificacaoParaCor', () => {
  it('extrai a especificação entre ( \' e ) e normaliza para minúsculo', () => {
    expect(extrairEspecificacaoParaCor("mostrarDica('Recursos Humanos')")).toBe('recursos humanos')
  })
})

describe('escolherCorProcesso', () => {
  const configuracoes = [
    { valor: 'orçamento', cor: '#ff0000' },
    { valor: 'pessoal', cor: '#00ff00' },
  ]

  it('escolhe a cor da primeira regra cujo valor aparece na especificação', () => {
    expect(escolherCorProcesso('processo de pessoal ativo', configuracoes)).toBe('#00ff00')
  })

  it('retorna null quando nenhuma regra casa', () => {
    expect(escolherCorProcesso('processo de compras', configuracoes)).toBeNull()
  })

  it('retorna null quando a lista de configurações está vazia', () => {
    expect(escolherCorProcesso('qualquer coisa', [])).toBeNull()
  })

  it('ignora regras com valor vazio', () => {
    expect(escolherCorProcesso('texto qualquer', [{ valor: '', cor: '#000' }])).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/features/controle-processos/corProcesso.test.ts`
Expected: FAIL — `Cannot find module './corProcesso'`

- [ ] **Step 3: Implementar `src/features/controle-processos/corProcesso.ts`**

```ts
import type { ConfiguracaoCor } from '../../lib/storage'

export function extrairEspecificacaoParaCor(onmouseover: string): string {
  const inicio = onmouseover.indexOf("('") + 2
  const fim = onmouseover.indexOf(')') - 1
  return onmouseover.substring(inicio, fim).toLowerCase()
}

export function escolherCorProcesso(
  especificacao: string,
  configuracoes: ConfiguracaoCor[]
): string | null {
  return configuracoes.reduce<string | null>((corEscolhida, config) => {
    return !corEscolhida && config.valor && especificacao.includes(config.valor.toLowerCase())
      ? config.cor
      : corEscolhida
  }, null)
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/features/controle-processos/corProcesso.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add src/features/controle-processos/corProcesso.ts src/features/controle-processos/corProcesso.test.ts
git commit -m "feat(controle-processos): add process color-by-specification helpers"
```

---

### Task 4: `features/controle-processos/especificacao.ts`

**Files:**
- Create: `C:\sei\seirmg\src\features\controle-processos\especificacao.ts`
- Test: `C:\sei\seirmg\src\features\controle-processos\especificacao.test.ts`

**Contexto**: porte de `C:\sei\seiplus\cs_modules\procedimento_controlar\mostrarEspecificacao.js` (modo `mostrar`) e `listaPorEspecificacao.js` (modo `substituir`).

**Interfaces:**
- Consumes: nenhuma
- Produces: `extrairEspecificacaoParaExibicao(onmouseover: string): string`; `extrairEspecificacaoParaLista(onmouseover: string): string`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/features/controle-processos/especificacao.test.ts
import { describe, expect, it } from 'vitest'
import { extrairEspecificacaoParaExibicao, extrairEspecificacaoParaLista } from './especificacao'

describe('extrairEspecificacaoParaExibicao', () => {
  it('extrai o texto entre ( \' e a vírgula do primeiro argumento', () => {
    expect(extrairEspecificacaoParaExibicao("mostrarDica('Recursos Humanos','outro')")).toBe(
      'Recursos Humanos'
    )
  })
})

describe('extrairEspecificacaoParaLista', () => {
  it('extrai o texto entre as duas primeiras aspas simples', () => {
    expect(extrairEspecificacaoParaLista("mostrarDica('Recursos Humanos','outro')")).toBe(
      'Recursos Humanos'
    )
  })

  it('retorna string vazia quando não há aspas', () => {
    expect(extrairEspecificacaoParaLista('semAspas')).toBe('')
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/features/controle-processos/especificacao.test.ts`
Expected: FAIL — `Cannot find module './especificacao'`

- [ ] **Step 3: Implementar `src/features/controle-processos/especificacao.ts`**

```ts
export function extrairEspecificacaoParaExibicao(onmouseover: string): string {
  const inicio = onmouseover.indexOf("('") + 2
  const fim = onmouseover.indexOf(',') - 1
  return onmouseover.substring(inicio, fim)
}

export function extrairEspecificacaoParaLista(onmouseover: string): string {
  return onmouseover.split("'")[1] ?? ''
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/features/controle-processos/especificacao.test.ts`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add src/features/controle-processos/especificacao.ts src/features/controle-processos/especificacao.test.ts
git commit -m "feat(controle-processos): add especificação extraction helpers (mostrar/substituir)"
```

---

### Task 5: `options/listaEditavel.ts` — componente de lista editável genérico

**Files:**
- Create: `C:\sei\seirmg\src\options\listaEditavel.ts`
- Test: `C:\sei\seirmg\src\options\listaEditavel.test.ts`

**Contexto**: utilitário DOM puro (sem `chrome.*`), segue o precedente de `tabs.ts`/`tabs.test.ts` — testável via jsdom apesar de não ser "lógica pura" no sentido estrito. `campos` é genérico para ser reaproveitado pelo lote do ponto de controle depois, sem alterações.

**Interfaces:**
- Consumes: nenhuma
- Produces: `interface CampoListaEditavel { chave: string; rotulo: string; tipo: 'text' | 'color' }`; `interface ListaEditavelControle<T> { obterItens: () => T[] }`; `montarListaEditavel<T extends Record<string, string>>(container: HTMLElement, campos: CampoListaEditavel[], itensIniciais: T[]): ListaEditavelControle<T>`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/options/listaEditavel.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { montarListaEditavel } from './listaEditavel'

const campos = [
  { chave: 'valor', rotulo: 'Especificação contém', tipo: 'text' as const },
  { chave: 'cor', rotulo: 'Cor', tipo: 'color' as const },
]

describe('montarListaEditavel', () => {
  let container: HTMLElement

  beforeEach(() => {
    document.body.innerHTML = '<div id="container"></div>'
    container = document.getElementById('container') as HTMLElement
  })

  it('renderiza uma linha por item inicial, com os valores preenchidos', () => {
    montarListaEditavel(container, campos, [{ valor: 'orçamento', cor: '#ff0000' }])

    const inputs = container.querySelectorAll('input')
    expect(inputs).toHaveLength(2)
    expect((inputs[0] as HTMLInputElement).value).toBe('orçamento')
    expect((inputs[1] as HTMLInputElement).value).toBe('#ff0000')
  })

  it('adiciona uma linha vazia ao clicar em Adicionar', () => {
    montarListaEditavel(container, campos, [])
    const botaoAdicionar = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Adicionar'
    )
    botaoAdicionar?.click()

    expect(container.querySelectorAll('.seirmg-lista-editavel-linha')).toHaveLength(1)
  })

  it('remove a linha ao clicar em Remover', () => {
    montarListaEditavel(container, campos, [{ valor: 'orçamento', cor: '#ff0000' }])
    const botaoRemover = container.querySelector('button') as HTMLButtonElement
    botaoRemover.click()

    expect(container.querySelectorAll('.seirmg-lista-editavel-linha')).toHaveLength(0)
  })

  it('obterItens reflete o estado atual, ignorando linhas com o campo de texto vazio', () => {
    const controle = montarListaEditavel(container, campos, [{ valor: 'orçamento', cor: '#ff0000' }])
    const botaoAdicionar = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Adicionar'
    )
    botaoAdicionar?.click()

    expect(controle.obterItens()).toEqual([{ valor: 'orçamento', cor: '#ff0000' }])
  })

  it('obterItens reflete edições feitas nos inputs', () => {
    const controle = montarListaEditavel(container, campos, [{ valor: 'x', cor: '#000000' }])
    const inputValor = container.querySelector('input[name="valor"]') as HTMLInputElement
    inputValor.value = 'pessoal'

    expect(controle.obterItens()).toEqual([{ valor: 'pessoal', cor: '#000000' }])
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/options/listaEditavel.test.ts`
Expected: FAIL — `Cannot find module './listaEditavel'`

- [ ] **Step 3: Implementar `src/options/listaEditavel.ts`**

```ts
export interface CampoListaEditavel {
  chave: string
  rotulo: string
  tipo: 'text' | 'color'
}

export interface ListaEditavelControle<T extends Record<string, string>> {
  obterItens: () => T[]
}

function criarLinha(campos: CampoListaEditavel[], valores: Record<string, string>): HTMLDivElement {
  const linha = document.createElement('div')
  linha.className = 'seirmg-lista-editavel-linha'

  campos.forEach((campo) => {
    const input = document.createElement('input')
    input.type = campo.tipo
    input.name = campo.chave
    input.placeholder = campo.rotulo
    input.value = valores[campo.chave] ?? (campo.tipo === 'color' ? '#017fff' : '')
    linha.appendChild(input)
  })

  const botaoRemover = document.createElement('button')
  botaoRemover.type = 'button'
  botaoRemover.textContent = 'Remover'
  botaoRemover.addEventListener('click', () => linha.remove())
  linha.appendChild(botaoRemover)

  return linha
}

export function montarListaEditavel<T extends Record<string, string>>(
  container: HTMLElement,
  campos: CampoListaEditavel[],
  itensIniciais: T[]
): ListaEditavelControle<T> {
  container.innerHTML = ''

  const linhas = document.createElement('div')
  linhas.className = 'seirmg-lista-editavel-linhas'
  container.appendChild(linhas)

  itensIniciais.forEach((item) => {
    linhas.appendChild(criarLinha(campos, item))
  })

  const botaoAdicionar = document.createElement('button')
  botaoAdicionar.type = 'button'
  botaoAdicionar.textContent = 'Adicionar'
  botaoAdicionar.addEventListener('click', () => {
    linhas.appendChild(criarLinha(campos, {}))
  })
  container.appendChild(botaoAdicionar)

  return {
    obterItens(): T[] {
      return Array.from(linhas.children).flatMap((linha) => {
        const item: Record<string, string> = {}
        let algumPreenchido = false

        campos.forEach((campo) => {
          const input = linha.querySelector<HTMLInputElement>(`input[name="${campo.chave}"]`)
          const valor = input?.value ?? ''
          item[campo.chave] = valor
          if (valor && campo.tipo === 'text') algumPreenchido = true
        })

        return algumPreenchido ? [item as T] : []
      })
    },
  }
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/options/listaEditavel.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add src/options/listaEditavel.ts src/options/listaEditavel.test.ts
git commit -m "feat(options): add generic reusable editable list component"
```

---

### Task 6: `content-scripts/procedimento_controlar/index.ts` + `manifest.config.ts`

**Files:**
- Create: `C:\sei\seirmg\src\content-scripts\procedimento_controlar\index.ts`
- Modify: `C:\sei\seirmg\manifest.config.ts`

**Contexto**: wiring fino, conecta DOM às 3 funções puras já testadas. Não é coberto por TDD — verificado via build. Adaptação em relação ao original `mostrarEspecificacao.js`: em vez de mirar uma coluna fixa por índice (`td:nth-child(column)`, cujo índice exato por versão do SEI não dá pra confirmar sem uma instância ao vivo), o modo `mostrar` insere o `<span>` de subtítulo logo após o link do processo — mesmo efeito visual, sem depender de um índice de coluna não verificável.

**Interfaces:**
- Consumes: `calcularDiasDoMarcador`, `classificarPrazo`, `extrairTextoMarcador`, `TipoCalculoPrazo` (Task 2); `escolherCorProcesso`, `extrairEspecificacaoParaCor` (Task 3); `extrairEspecificacaoParaExibicao`, `extrairEspecificacaoParaLista` (Task 4); `createSyncConfigStore`, `ControleProcessosConfig` (Task 1, `../../lib/storage`)

- [ ] **Step 1: Criar `src/content-scripts/procedimento_controlar/index.ts`**

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

- [ ] **Step 2: Adicionar o bloco novo em `manifest.config.ts`**

No array `content_scripts`, adicionar (depois do bloco de `rel_bloco_protocolo_listar`):

```ts
    {
      matches: [
        '*://*.br/*controlador.php?acao=procedimento_controlar*',
        '*://*.org/*controlador.php?acao=procedimento_controlar*',
      ],
      js: ['src/content-scripts/procedimento_controlar/index.ts'],
      run_at: 'document_idle',
    },
```

- [ ] **Step 3: Rodar toda a suíte de testes para confirmar que nada quebrou**

Run: `cd C:\sei\seirmg && bunx vitest run`
Expected: todos os testes continuam passando (128 testes no total — 95 antes deste plano + 2 (Task 1) + 18 (Task 2) + 5 (Task 3) + 3 (Task 4) + 5 (Task 5) = 128)

- [ ] **Step 4: Rodar o build**

Run: `bun run build`
Expected: sucesso, sem erros de tipo. Se houver erro, rode `bun run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/content-scripts/procedimento_controlar/index.ts manifest.config.ts
git commit -m "feat(controle-processos): wire prazos, cor por especificação and especificação content script"
```

---

### Task 7: `options/index.html` + `options/main.ts` — aba Processos

**Files:**
- Modify: `C:\sei\seirmg\src\options\index.html`
- Modify: `C:\sei\seirmg\src\options\main.ts`

**Contexto**: DOM-heavy, não coberto por TDD, verificado via build. Primeira implementação real da aba Processos (hoje placeholder).

**Interfaces:**
- Consumes: `createSyncConfigStore`, `type ConfiguracaoCor`, `type ModoEspecificacao` (`../lib/storage`); `montarListaEditavel` (Task 5, `./listaEditavel`)

- [ ] **Step 1: Substituir a seção `#painel-processos` em `src/options/index.html`**

Trecho atual:

```html
    <section id="painel-processos" class="painel">
      <p>Em breve: prazos, cores de marcadores e agrupamento.</p>
    </section>
```

Substituir por:

```html
    <section id="painel-processos" class="painel">
      <h2>Processos</h2>
      <h3>Prazos</h3>
      <label>
        <input type="checkbox" id="processos-prazos-ativo" />
        Ativar cálculo de prazos
      </label>
      <br />
      <label>
        <input type="checkbox" id="processos-prazos-exibir-dias" />
        Exibir coluna Dias
      </label>
      <label>
        Alerta (dias):
        <input type="number" id="processos-prazos-alerta-dias" min="0" />
      </label>
      <label>
        Crítico (dias):
        <input type="number" id="processos-prazos-critico-dias" min="0" />
      </label>
      <br />
      <label>
        <input type="checkbox" id="processos-prazos-exibir-prazo" />
        Exibir coluna Prazo
      </label>
      <label>
        Alerta (prazo):
        <input type="number" id="processos-prazos-alerta-prazo" min="0" />
      </label>
      <label>
        Crítico (prazo):
        <input type="number" id="processos-prazos-critico-prazo" min="0" />
      </label>

      <h3>Cor por especificação</h3>
      <label>
        <input type="checkbox" id="processos-cores-ativo" />
        Ativar cor do processo por especificação
      </label>
      <div id="processos-cores-lista"></div>

      <h3>Especificação na listagem</h3>
      <label>
        <input type="checkbox" id="processos-especificacao-ativo" />
        Ativar especificação na listagem
      </label>
      <br />
      <label>
        Modo:
        <select id="processos-especificacao-modo">
          <option value="mostrar">Mostrar como subtítulo</option>
          <option value="substituir">Substituir número do processo</option>
        </select>
      </label>

      <br />
      <button id="processos-salvar">Salvar</button>
      <span id="processos-status"></span>
    </section>
```

- [ ] **Step 2: Adicionar `carregarAbaProcessos` em `src/options/main.ts`**

Modificar o import do topo do arquivo:

Atual:

```ts
import { createSyncConfigStore, type ThemePreset } from '../lib/storage'
```

Substituir por:

```ts
import { createSyncConfigStore, type ConfiguracaoCor, type ModoEspecificacao, type ThemePreset } from '../lib/storage'
import { montarListaEditavel } from './listaEditavel'
```

Trecho final do arquivo, atual:

```ts
carregarAbaAparencia()
carregarAbaGeral()
carregarAbaAssinatura()
carregarSecaoProcessosNovos()
```

Substituir por (adiciona `carregarAbaProcessos` antes das quatro funções já existentes, sem tocar nelas):

```ts
async function carregarAbaProcessos(): Promise<void> {
  try {
    const store = createSyncConfigStore()
    const config = await store.get()

    const inputPrazosAtivo = document.getElementById('processos-prazos-ativo') as HTMLInputElement | null
    const inputExibirDias = document.getElementById('processos-prazos-exibir-dias') as HTMLInputElement | null
    const inputAlertaDias = document.getElementById('processos-prazos-alerta-dias') as HTMLInputElement | null
    const inputCriticoDias = document.getElementById('processos-prazos-critico-dias') as HTMLInputElement | null
    const inputExibirPrazo = document.getElementById('processos-prazos-exibir-prazo') as HTMLInputElement | null
    const inputAlertaPrazo = document.getElementById('processos-prazos-alerta-prazo') as HTMLInputElement | null
    const inputCriticoPrazo = document.getElementById('processos-prazos-critico-prazo') as HTMLInputElement | null
    const inputCoresAtivo = document.getElementById('processos-cores-ativo') as HTMLInputElement | null
    const inputEspecificacaoAtivo = document.getElementById(
      'processos-especificacao-ativo'
    ) as HTMLInputElement | null
    const selectModo = document.getElementById('processos-especificacao-modo') as HTMLSelectElement | null
    const status = document.getElementById('processos-status')

    if (inputPrazosAtivo) inputPrazosAtivo.checked = config.controleProcessos.prazos.ativo
    if (inputExibirDias) inputExibirDias.checked = config.controleProcessos.prazos.exibirDias
    if (inputAlertaDias) inputAlertaDias.value = String(config.controleProcessos.prazos.alertaDias)
    if (inputCriticoDias) inputCriticoDias.value = String(config.controleProcessos.prazos.criticoDias)
    if (inputExibirPrazo) inputExibirPrazo.checked = config.controleProcessos.prazos.exibirPrazo
    if (inputAlertaPrazo) inputAlertaPrazo.value = String(config.controleProcessos.prazos.alertaPrazo)
    if (inputCriticoPrazo) inputCriticoPrazo.value = String(config.controleProcessos.prazos.criticoPrazo)
    if (inputCoresAtivo) inputCoresAtivo.checked = config.controleProcessos.coresProcesso.ativo
    if (inputEspecificacaoAtivo) {
      inputEspecificacaoAtivo.checked = config.controleProcessos.especificacao.ativo
    }
    if (selectModo) selectModo.value = config.controleProcessos.especificacao.modo

    const containerCores = document.getElementById('processos-cores-lista')
    const listaCores = containerCores
      ? montarListaEditavel<ConfiguracaoCor>(
          containerCores,
          [
            { chave: 'valor', rotulo: 'Especificação contém', tipo: 'text' },
            { chave: 'cor', rotulo: 'Cor', tipo: 'color' },
          ],
          config.controleProcessos.coresProcesso.regras
        )
      : null

    document.getElementById('processos-salvar')?.addEventListener('click', async () => {
      try {
        const atualizado = {
          ...config,
          controleProcessos: {
            prazos: {
              ativo: inputPrazosAtivo?.checked ?? true,
              exibirDias: inputExibirDias?.checked ?? true,
              exibirPrazo: inputExibirPrazo?.checked ?? true,
              alertaDias: Number(inputAlertaDias?.value ?? 30),
              criticoDias: Number(inputCriticoDias?.value ?? 60),
              alertaPrazo: Number(inputAlertaPrazo?.value ?? 10),
              criticoPrazo: Number(inputCriticoPrazo?.value ?? 5),
            },
            coresProcesso: {
              ativo: inputCoresAtivo?.checked ?? true,
              regras: listaCores?.obterItens() ?? [],
            },
            especificacao: {
              ativo: inputEspecificacaoAtivo?.checked ?? true,
              modo: (selectModo?.value ?? 'mostrar') as ModoEspecificacao,
            },
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
        console.error('[SEIRMG] Falha ao salvar configuração de Processos:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao carregar aba Processos:', error)
  }
}

carregarAbaProcessos()
carregarAbaAparencia()
carregarAbaGeral()
carregarAbaAssinatura()
carregarSecaoProcessosNovos()
```

- [ ] **Step 3: Rodar toda a suíte e o build**

Run: `cd C:\sei\seirmg && bunx vitest run && bun run build`
Expected: todos os testes continuam passando (128), build sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/options/index.html src/options/main.ts
git commit -m "feat(options): implement Processos tab (prazos, cor por especificação, especificação)"
```

---

### Task 8: Checagem final (typecheck/lint/test/build/manifest)

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
Expected: os 4 comandos terminam com código de saída 0. `bun run test` reporta 128 testes, todos passando.

- [ ] **Step 2: Validar o `manifest.json` gerado e confirmar que as permissões não mudaram**

Run: `node -e "const m = JSON.parse(require('fs').readFileSync('dist/manifest.json', 'utf8')); console.log('manifest.json válido'); console.log(JSON.stringify(m.permissions))"`
Expected: `manifest.json válido` seguido de `["storage","notifications","alarms","tabs"]` — exatamente as mesmas permissões de antes.

---

## Self-Review (checklist do autor do plano)

1. **Cobertura da spec**: schema `controleProcessos` (Task 1), `prazos.ts`/`corProcesso.ts`/`especificacao.ts` (Tasks 2-4), `listaEditavel.ts` genérico e reutilizável (Task 5), wiring completo no content script novo + manifest (Task 6), aba Processos com as 3 seções (Task 7). Todas as seções da spec têm task correspondente.
2. **Placeholders**: nenhum "TBD"/"TODO"; todo código de teste e implementação está completo e literal.
3. **Consistência de tipos**: `ConfiguracaoCor` (Task 1, `lib/storage`) consumido identicamente por `corProcesso.ts` (Task 3), pelo content script (Task 6) e pela aba Processos (Task 7) via `montarListaEditavel<ConfiguracaoCor>`. `TipoCalculoPrazo`/`ConfiguracaoLimites` (Task 2) usados identicamente no content script (Task 6). `CampoListaEditavel`/`ListaEditavelControle<T>` (Task 5) genéricos, sem acoplamento a "valor/cor" — prontos para reaproveitamento pelo lote do ponto de controle.
4. **Contagem de testes**: 95 (baseline antes deste plano) + 2 (Task 1) + 18 (Task 2) + 5 (Task 3) + 3 (Task 4) + 5 (Task 5) = 128 testes esperados ao final da Task 6 em diante.
