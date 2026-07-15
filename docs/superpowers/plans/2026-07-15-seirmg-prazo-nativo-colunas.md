# SEIRMG — Colunas Dias/Prazo com fonte nativa + correção de ordenação — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer as colunas "Dias" e "Prazo" da tabela de Controle de Processos (`#tblProcessosRecebidos`/`#tblProcessosGerados`/`#tblProcessosDetalhado`) usarem o ícone nativo "Controle de Prazo" do SEI como única fonte de dado (em vez do texto de marcador manual), e corrigir o bug de ordem no `bootstrap()` que impedia essas duas colunas de serem ordenáveis por clique no cabeçalho.

**Architecture:** Refatora `features/controle-processos/prazos.ts` (lógica pura testada) para expor `calcularDiasAteVencimento` e simplificar `classificarPrazo`, removendo o código morto do cálculo por marcador. Reescreve a parte de população das colunas em `content-scripts/procedimento_controlar/index.ts` para reaproveitar `obterControleDePrazoDaLinha` (já existente, já usada pelo painel de Favoritos) em vez de ler marcadores, e reordena o `bootstrap()`. Simplifica o schema `PrazosConfig` em `lib/storage.ts` de 4 limiares para 2, propagando a mudança pra `options/index.html` + `options/main.ts`.

**Tech Stack:** TypeScript, Vitest (jsdom), Vite/CRXJS (extensão Chrome MV3). Sem dependências novas.

## Global Constraints

- Sem fallback para o cálculo antigo por marcador — Controle de Prazo nativo é a única fonte (decisão validada com o usuário, spec `docs/superpowers/specs/2026-07-15-seirmg-prazo-nativo-colunas-design.md`).
- Coluna "Dias" sempre número puro (não o texto bruto do tooltip do SEI) — necessário pra ordenação numérica.
- Coluna "Prazo" sempre a data `dd/mm/aaaa` (não mais contagem de dias).
- Sem migração de config antiga — campos `alertaDias`/`criticoDias`/`alertaPrazo`/`criticoPrazo` somem, novos defaults `alerta`/`critico` valem pra quem já tinha config salva.
- Guard `try/catch` em todo wiring de DOM que já tem esse padrão no arquivo (nunca lançar, sempre `console.error('[SEIRMG] ...', error)`).
- Lógica pura testada em `features/`; wiring de DOM em `content-scripts/`/`options/` sem teste automatizado (padrão já estabelecido no projeto — verificado via build/typecheck).

---

## Task 1: Simplificar `prazos.ts` — nova `calcularDiasAteVencimento`, `classificarPrazo` sem `tipo`, remover código morto

**Files:**
- Modify: `src/features/controle-processos/prazos.ts`
- Test: `src/features/controle-processos/prazos.test.ts`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces:
  - `calcularDiasAteVencimento(dataTexto: string, agora: Date): number | null` — usada pela Task 3.
  - `classificarPrazo(valor: number, config: ConfiguracaoLimites): 'alerta' | 'critico' | null` (assinatura nova, sem `tipo`) — usada pela Task 3.
  - `ConfiguracaoLimites` (já existe, inalterada: `{ alerta: number; critico: number }`).
  - `extrairTextoMarcador`, `isValidDate` continuam exportadas, inalteradas — usadas pela Task 3 (dentro de `obterControleDePrazoDaLinha`).
  - Removidos (não usar em nenhuma task seguinte): `calcularDiasDoMarcador`, `extrairDataDoMarcador`, tipo `TipoCalculoPrazo`.

- [ ] **Step 1: Reescrever `prazos.test.ts` com os casos novos (arquivo completo)**

Substituir o conteúdo inteiro de `src/features/controle-processos/prazos.test.ts` por:

```ts
import { describe, expect, it } from 'vitest'
import { calcularDiasAteVencimento, classificarPrazo, extrairTextoMarcador, formatarDataBr, isValidDate } from './prazos'

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

describe('calcularDiasAteVencimento', () => {
  const agora = new Date(2026, 0, 10)

  it('calcula dias restantes até uma data futura', () => {
    expect(calcularDiasAteVencimento('20/01/2026', agora)).toBe(11)
  })

  it('calcula dias já vencidos (negativo) para uma data passada', () => {
    expect(calcularDiasAteVencimento('01/01/2026', agora)).toBe(-8)
  })

  it('retorna 1 quando a data de vencimento é hoje', () => {
    expect(calcularDiasAteVencimento('10/01/2026', agora)).toBe(1)
  })

  it('retorna null para texto de data inválido', () => {
    expect(calcularDiasAteVencimento('31/02/2026', agora)).toBeNull()
  })

  it('retorna null para texto fora do formato dd/mm/yyyy', () => {
    expect(calcularDiasAteVencimento('2026-01-20', agora)).toBeNull()
  })
})

describe('classificarPrazo', () => {
  const config = { alerta: 10, critico: 5 }

  it('classifica alerta quando entre crítico (inclusive) e alerta (exclusive)', () => {
    expect(classificarPrazo(5, config)).toBe('alerta')
    expect(classificarPrazo(9, config)).toBe('alerta')
  })

  it('classifica crítico quando abaixo do crítico', () => {
    expect(classificarPrazo(4, config)).toBe('critico')
  })

  it('classifica crítico para valores bem negativos (vencido há dias)', () => {
    expect(classificarPrazo(-10, config)).toBe('critico')
  })

  it('não classifica quando dentro do normal (>= alerta)', () => {
    expect(classificarPrazo(10, config)).toBeNull()
  })
})

describe('formatarDataBr', () => {
  it('formata com zero à esquerda em dia e mês', () => {
    expect(formatarDataBr(new Date(2026, 0, 5))).toBe('05/01/2026')
  })

  it('formata corretamente dia e mês de dois dígitos', () => {
    expect(formatarDataBr(new Date(2026, 10, 25))).toBe('25/11/2026')
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham (funções novas ainda não existem / assinatura antiga)**

Run: `cd C:\sei\seirmg && npx vitest run src/features/controle-processos/prazos.test.ts`
Expected: FAIL — `calcularDiasAteVencimento` não exportada e/ou erros de tipo em `classificarPrazo`.

- [ ] **Step 3: Reescrever `prazos.ts` (arquivo completo)**

Substituir o conteúdo inteiro de `src/features/controle-processos/prazos.ts` por:

```ts
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

function parseDataBr(dataStr: string): Date {
  const [dia, mes, ano] = dataStr.split('/').map(Number)
  return new Date(ano, mes - 1, dia)
}

export function calcularDiasAteVencimento(dataTexto: string, agora: Date): number | null {
  if (!isValidDate(dataTexto)) return null
  const msPorDia = 1000 * 60 * 60 * 24
  const data = parseDataBr(dataTexto)
  return Math.floor((data.getTime() - agora.getTime()) / msPorDia) + 1
}

export function formatarDataBr(data: Date): string {
  const dia = String(data.getDate()).padStart(2, '0')
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const ano = data.getFullYear()
  return `${dia}/${mes}/${ano}`
}

export interface ConfiguracaoLimites {
  alerta: number
  critico: number
}

export function classificarPrazo(valor: number, config: ConfiguracaoLimites): 'alerta' | 'critico' | null {
  if (valor >= config.critico && valor < config.alerta) return 'alerta'
  if (valor < config.critico) return 'critico'
  return null
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd C:\sei\seirmg && npx vitest run src/features/controle-processos/prazos.test.ts`
Expected: PASS (todos os `describe` acima).

- [ ] **Step 5: Typecheck**

Run: `cd C:\sei\seirmg && npx tsc --noEmit`
Expected: sem erros novos relacionados a `prazos.ts` (erros em `index.ts`/`main.ts`/`storage.ts` por causa dos imports antigos são esperados nesta etapa — corrigidos nas próximas tasks).

- [ ] **Step 6: Commit**

```bash
cd C:\sei\seirmg
git add src/features/controle-processos/prazos.ts src/features/controle-processos/prazos.test.ts
git commit -m "$(cat <<'EOF'
refactor: simplifica prazos.ts para o cálculo único "dias até vencer"

Remove calcularDiasDoMarcador/extrairDataDoMarcador/TipoCalculoPrazo
(cálculo por marcador manual, sem mais uso após a troca de fonte pro
Controle de Prazo nativo do SEI). Nova calcularDiasAteVencimento
calcula a partir de uma data já extraída; classificarPrazo perde o
parâmetro tipo, já que só resta um significado.
EOF
)"
```

---

## Task 2: Simplificar `PrazosConfig` em `lib/storage.ts`

**Files:**
- Modify: `src/lib/storage.ts:30-38` (interface `PrazosConfig`) e `src/lib/storage.ts:198-207` (defaults)
- Test: `src/lib/storage.test.ts:59-68`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: `PrazosConfig` com o shape `{ ativo: boolean; exibirDias: boolean; exibirPrazo: boolean; alerta: number; critico: number }` — usada pelas Tasks 3 e 4.

- [ ] **Step 1: Atualizar o teste de default em `storage.test.ts`**

Em `src/lib/storage.test.ts`, trocar (linhas 60-68):

```ts
      prazos: {
        ativo: true,
        exibirDias: true,
        exibirPrazo: true,
        alertaDias: 30,
        criticoDias: 60,
        alertaPrazo: 10,
        criticoPrazo: 5,
      },
```

por:

```ts
      prazos: {
        ativo: true,
        exibirDias: true,
        exibirPrazo: true,
        alerta: 10,
        critico: 5,
      },
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd C:\sei\seirmg && npx vitest run src/lib/storage.test.ts`
Expected: FAIL — o objeto retornado pelo default ainda tem `alertaDias`/`criticoDias`/`alertaPrazo`/`criticoPrazo`.

- [ ] **Step 3: Atualizar a interface `PrazosConfig` em `storage.ts`**

Em `src/lib/storage.ts`, trocar (linhas 30-38):

```ts
export interface PrazosConfig {
  ativo: boolean
  exibirDias: boolean
  exibirPrazo: boolean
  alertaDias: number
  criticoDias: number
  alertaPrazo: number
  criticoPrazo: number
}
```

por:

```ts
export interface PrazosConfig {
  ativo: boolean
  exibirDias: boolean
  exibirPrazo: boolean
  alerta: number
  critico: number
}
```

- [ ] **Step 4: Atualizar o default em `storage.ts`**

No mesmo arquivo, trocar (bloco `prazos` dentro do default de `controleProcessos`, por volta da linha 199-207):

```ts
    prazos: {
      ativo: true,
      exibirDias: true,
      exibirPrazo: true,
      alertaDias: 30,
      criticoDias: 60,
      alertaPrazo: 10,
      criticoPrazo: 5,
    },
```

por:

```ts
    prazos: {
      ativo: true,
      exibirDias: true,
      exibirPrazo: true,
      alerta: 10,
      critico: 5,
    },
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `cd C:\sei\seirmg && npx vitest run src/lib/storage.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd C:\sei\seirmg
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "$(cat <<'EOF'
refactor: simplifica PrazosConfig para um único par de limiares

alertaDias/criticoDias e alertaPrazo/criticoPrazo viram alerta/critico
— agora só existe um significado (dias até vencer, fonte nativa do
SEI), não faz mais sentido ter dois pares de limiares.
EOF
)"
```

---

## Task 3: Trocar a fonte das colunas Dias/Prazo em `content-scripts/procedimento_controlar/index.ts` + corrigir ordem do `bootstrap()`

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/index.ts`

**Interfaces:**
- Consumes:
  - `calcularDiasAteVencimento(dataTexto: string, agora: Date): number | null` (Task 1)
  - `classificarPrazo(valor: number, config: ConfiguracaoLimites): 'alerta' | 'critico' | null` (Task 1, nova assinatura)
  - `ControleProcessosConfig['prazos']` agora com `{ ativo, exibirDias, exibirPrazo, alerta, critico }` (Task 2)
  - `obterControleDePrazoDaLinha(linha: Element): ControleDePrazoFavorito | null` — já existe neste mesmo arquivo (linhas 554-566 antes desta task), não muda de assinatura.
- Produces: nada consumido por outra task (é o content script final, sem exports).

Sem teste automatizado para este arquivo (wiring de DOM, mesmo padrão já estabelecido no projeto — verificado via build/typecheck e depois manualmente no SEI real).

- [ ] **Step 1: Atualizar o import de `prazos.ts` no topo do arquivo**

`extrairTextoMarcador` continua necessária neste arquivo: é usada dentro de `obterControleDePrazoDaLinha`
(função já existente mais abaixo no arquivo, que este import do topo alimenta — só `calcularDiasDoMarcador`
e `TipoCalculoPrazo` deixam de ser usados, substituídos por `calcularDiasAteVencimento`).

Em `src/content-scripts/procedimento_controlar/index.ts`, trocar (linhas 1-6):

```ts
import {
  calcularDiasDoMarcador,
  classificarPrazo,
  extrairTextoMarcador,
  type TipoCalculoPrazo,
} from '../../features/controle-processos/prazos'
```

por:

```ts
import {
  calcularDiasAteVencimento,
  classificarPrazo,
  extrairTextoMarcador,
} from '../../features/controle-processos/prazos'
```

- [ ] **Step 2: Substituir `definirTiposPrazo` + `aplicarUmTipoDePrazo` + `aplicarPrazosEmLinhas` + `aplicarPrazos` por uma única implementação baseada em `obterControleDePrazoDaLinha`**

Localizar o bloco atual (por volta das linhas 371-449):

```ts
function definirTiposPrazo(
  config: ControleProcessosConfig['prazos']
): Array<{ tipo: TipoCalculoPrazo; exibir: boolean; rotulo: string; limites: { alerta: number; critico: number } }> {
  return [
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
}

function aplicarUmTipoDePrazo(
  linhas: Element[],
  tipo: TipoCalculoPrazo,
  limites: { alerta: number; critico: number }
): void {
  linhas.forEach((linha) => {
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
}

function aplicarPrazosEmLinhas(config: ControleProcessosConfig['prazos'], linhas: Element[]): void {
  if (!config.ativo) return
  definirTiposPrazo(config).forEach(({ tipo, exibir, limites }) => {
    if (!exibir) return
    aplicarUmTipoDePrazo(linhas, tipo, limites)
  })
}

function aplicarPrazos(config: ControleProcessosConfig['prazos']): void {
  if (!config.ativo) return

  IDS_TABELAS.forEach((idTabela) => {
    const tabela = document.querySelector(idTabela)
    if (!tabela) return

    definirTiposPrazo(config).forEach(({ tipo, exibir, rotulo, limites }) => {
      if (!exibir) return

      const theadRow = tabela.querySelector('thead > tr')
      if (theadRow) {
        const th = document.createElement('th')
        th.className = 'infraTh'
        th.textContent = rotulo
        theadRow.appendChild(th)
      }

      aplicarUmTipoDePrazo(linhasDaTabela(idTabela), tipo, limites)
    })
  })
}
```

Substituir por:

```ts
function aplicarPrazoNaLinha(linha: Element, config: ControleProcessosConfig['prazos']): void {
  const prazo = obterControleDePrazoDaLinha(linha)
  const dias = prazo ? calcularDiasAteVencimento(prazo.dataTexto, new Date()) : null

  if (config.exibirDias) {
    const td = document.createElement('td')
    td.setAttribute('valign', 'top')
    td.setAttribute('align', 'center')
    td.textContent = dias === null ? '' : String(dias)
    linha.appendChild(td)
  }

  if (config.exibirPrazo) {
    const td = document.createElement('td')
    td.setAttribute('valign', 'top')
    td.setAttribute('align', 'center')
    td.textContent = prazo?.dataTexto ?? ''
    linha.appendChild(td)
  }

  if (dias !== null) {
    const classificacao = classificarPrazo(dias, { alerta: config.alerta, critico: config.critico })
    if (classificacao === 'alerta') linha.classList.add('infraTrseippalerta')
    if (classificacao === 'critico') linha.classList.add('infraTrseippcritico')
  }
}

function aplicarPrazosEmLinhas(config: ControleProcessosConfig['prazos'], linhas: Element[]): void {
  if (!config.ativo) return
  linhas.forEach((linha) => aplicarPrazoNaLinha(linha, config))
}

function aplicarPrazos(config: ControleProcessosConfig['prazos']): void {
  if (!config.ativo) return

  IDS_TABELAS.forEach((idTabela) => {
    const tabela = document.querySelector(idTabela)
    if (!tabela) return

    const theadRow = tabela.querySelector('thead > tr')
    if (theadRow) {
      if (config.exibirDias) {
        const th = document.createElement('th')
        th.className = 'infraTh'
        th.textContent = 'Dias'
        theadRow.appendChild(th)
      }
      if (config.exibirPrazo) {
        const th = document.createElement('th')
        th.className = 'infraTh'
        th.textContent = 'Prazo'
        theadRow.appendChild(th)
      }
    }

    aplicarPrazosEmLinhas(config, linhasDaTabela(idTabela))
  })
}
```

**Nota importante de ordem no arquivo:** `obterControleDePrazoDaLinha` é declarada mais abaixo no arquivo (função `function obterControleDePrazoDaLinha(linha: Element): ControleDePrazoFavorito | null`, por volta da linha 554 antes desta task). Como é uma function declaration (hoisted), pode ser chamada de `aplicarPrazoNaLinha` mesmo estando definida depois no arquivo — não precisa mover nada.

- [ ] **Step 3: Corrigir a ordem do `bootstrap()`**

Localizar `async function bootstrap()` (por volta da linha 1640 antes desta task):

```ts
async function bootstrap(): Promise<void> {
  try {
    injetarEstilos()
    corrigirTabelasNativas()
    montarBuscaRapida()
    montarSelecaoMultipla()
    montarConfirmarAntesDeConcluir()
    montarFiltroBloco()
    montarOrdenacaoTabelas()
    await montarFiltroAtribuicao()

    const config = await createSyncConfigStore().get()
    aplicarPrazos(config.controleProcessos.prazos)
    aplicarCorProcesso(config.controleProcessos.coresProcesso)
    aplicarEspecificacao(config.controleProcessos.especificacao)
    montarAgrupamento(config)
```

Substituir por (só muda a posição do bloco `config`/`aplicarPrazos`, que agora roda antes de `montarOrdenacaoTabelas()` — o resto do corpo da função, dali pra baixo, continua exatamente igual):

```ts
async function bootstrap(): Promise<void> {
  try {
    injetarEstilos()
    corrigirTabelasNativas()

    const config = await createSyncConfigStore().get()
    aplicarPrazos(config.controleProcessos.prazos)

    montarBuscaRapida()
    montarSelecaoMultipla()
    montarConfirmarAntesDeConcluir()
    montarFiltroBloco()
    montarOrdenacaoTabelas()
    await montarFiltroAtribuicao()

    aplicarCorProcesso(config.controleProcessos.coresProcesso)
    aplicarEspecificacao(config.controleProcessos.especificacao)
    montarAgrupamento(config)
```

- [ ] **Step 4: Typecheck**

Run: `cd C:\sei\seirmg && npx tsc --noEmit`
Expected: sem erros (nenhuma referência restante a `calcularDiasDoMarcador`, `TipoCalculoPrazo`, `alertaDias`, `criticoDias`, `alertaPrazo`, `criticoPrazo`, `definirTiposPrazo` ou `aplicarUmTipoDePrazo`).

- [ ] **Step 5: Build**

Run: `cd C:\sei\seirmg && npm run build`
Expected: build sem erros.

- [ ] **Step 6: Commit**

```bash
cd C:\sei\seirmg
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "$(cat <<'EOF'
fix: colunas Dias/Prazo usam o Controle de Prazo nativo e ficam ordenáveis

As colunas nativas de Controle de Processos dependiam de um marcador
manual (convenção do Sei++), por isso ficavam vazias na maioria das
linhas. Agora reaproveitam obterControleDePrazoDaLinha, a mesma fonte
já validada ao vivo no painel de Favoritos — "Dias" mostra a contagem
até o vencimento (número puro) e "Prazo" mostra a data de vencimento.

Também corrige a ordem do bootstrap(): aplicarPrazos() (que cria os
<th> de Dias/Prazo) agora roda antes de montarOrdenacaoTabelas(), que
só anexa o listener de clique nos <th> já presentes no DOM — por isso
essas duas colunas nunca ficavam ordenáveis, mesmo as outras já sendo
desde o Lote E3.
EOF
)"
```

---

## Task 4: Atualizar a aba "Processos" das Opções (`options/index.html` + `options/main.ts`)

**Files:**
- Modify: `src/options/index.html:79-99`
- Modify: `src/options/main.ts:215-245` (leitura dos inputs), `src/options/main.ts:299-310` (gravação)

**Interfaces:**
- Consumes: `PrazosConfig` com `{ ativo, exibirDias, exibirPrazo, alerta, critico }` (Task 2).
- Produces: nada consumido por outra task.

- [ ] **Step 1: Atualizar o HTML da seção "Prazos"**

Em `src/options/index.html`, trocar (linhas 79-99):

```html
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
```

por:

```html
      <label>
        <input type="checkbox" id="processos-prazos-exibir-dias" />
        Exibir coluna Dias
      </label>
      <label>
        <input type="checkbox" id="processos-prazos-exibir-prazo" />
        Exibir coluna Prazo
      </label>
      <br />
      <label>
        Alerta (dias até vencer):
        <input type="number" id="processos-prazos-alerta" min="0" />
      </label>
      <label>
        Crítico (dias até vencer):
        <input type="number" id="processos-prazos-critico" min="0" />
      </label>
```

- [ ] **Step 2: Atualizar a leitura dos inputs em `carregarAbaProcessos` (`main.ts`)**

Em `src/options/main.ts`, trocar (linhas 216-221):

```ts
    const inputExibirDias = document.getElementById('processos-prazos-exibir-dias') as HTMLInputElement | null
    const inputAlertaDias = document.getElementById('processos-prazos-alerta-dias') as HTMLInputElement | null
    const inputCriticoDias = document.getElementById('processos-prazos-critico-dias') as HTMLInputElement | null
    const inputExibirPrazo = document.getElementById('processos-prazos-exibir-prazo') as HTMLInputElement | null
    const inputAlertaPrazo = document.getElementById('processos-prazos-alerta-prazo') as HTMLInputElement | null
    const inputCriticoPrazo = document.getElementById('processos-prazos-critico-prazo') as HTMLInputElement | null
```

por:

```ts
    const inputExibirDias = document.getElementById('processos-prazos-exibir-dias') as HTMLInputElement | null
    const inputExibirPrazo = document.getElementById('processos-prazos-exibir-prazo') as HTMLInputElement | null
    const inputAlerta = document.getElementById('processos-prazos-alerta') as HTMLInputElement | null
    const inputCritico = document.getElementById('processos-prazos-critico') as HTMLInputElement | null
```

E trocar (linhas 240-245):

```ts
    if (inputExibirDias) inputExibirDias.checked = config.controleProcessos.prazos.exibirDias
    if (inputAlertaDias) inputAlertaDias.value = String(config.controleProcessos.prazos.alertaDias)
    if (inputCriticoDias) inputCriticoDias.value = String(config.controleProcessos.prazos.criticoDias)
    if (inputExibirPrazo) inputExibirPrazo.checked = config.controleProcessos.prazos.exibirPrazo
    if (inputAlertaPrazo) inputAlertaPrazo.value = String(config.controleProcessos.prazos.alertaPrazo)
    if (inputCriticoPrazo) inputCriticoPrazo.value = String(config.controleProcessos.prazos.criticoPrazo)
```

por:

```ts
    if (inputExibirDias) inputExibirDias.checked = config.controleProcessos.prazos.exibirDias
    if (inputExibirPrazo) inputExibirPrazo.checked = config.controleProcessos.prazos.exibirPrazo
    if (inputAlerta) inputAlerta.value = String(config.controleProcessos.prazos.alerta)
    if (inputCritico) inputCritico.value = String(config.controleProcessos.prazos.critico)
```

- [ ] **Step 3: Atualizar a gravação em `carregarAbaProcessos` (`main.ts`)**

No mesmo arquivo, trocar (linhas 302-310):

```ts
            prazos: {
              ativo: inputPrazosAtivo?.checked ?? true,
              exibirDias: inputExibirDias?.checked ?? true,
              exibirPrazo: inputExibirPrazo?.checked ?? true,
              alertaDias: Number(inputAlertaDias?.value ?? 30),
              criticoDias: Number(inputCriticoDias?.value ?? 60),
              alertaPrazo: Number(inputAlertaPrazo?.value ?? 10),
              criticoPrazo: Number(inputCriticoPrazo?.value ?? 5),
            },
```

por:

```ts
            prazos: {
              ativo: inputPrazosAtivo?.checked ?? true,
              exibirDias: inputExibirDias?.checked ?? true,
              exibirPrazo: inputExibirPrazo?.checked ?? true,
              alerta: Number(inputAlerta?.value ?? 10),
              critico: Number(inputCritico?.value ?? 5),
            },
```

- [ ] **Step 4: Typecheck**

Run: `cd C:\sei\seirmg && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Build**

Run: `cd C:\sei\seirmg && npm run build`
Expected: build sem erros.

- [ ] **Step 6: Commit**

```bash
cd C:\sei\seirmg
git add src/options/index.html src/options/main.ts
git commit -m "$(cat <<'EOF'
refactor: aba Processos usa um único par Alerta/Crítico para Dias e Prazo

Acompanha a simplificação de PrazosConfig (alertaDias/criticoDias +
alertaPrazo/criticoPrazo -> alerta/critico) — os dois limiares antigos
tinham significados diferentes (dias decorridos vs. dias até vencer);
agora só resta "dias até vencer", então um único par serve pras duas
colunas.
EOF
)"
```

---

## Task 5: Rodar a suíte completa e verificar manualmente

**Files:** nenhum arquivo novo — task de verificação.

**Interfaces:** nenhuma.

- [ ] **Step 1: Rodar a suíte de testes inteira**

Run: `cd C:\sei\seirmg && npx vitest run`
Expected: todos os testes passam (nenhuma referência restante às funções/campos removidos nas Tasks 1-2 em outros arquivos de teste).

- [ ] **Step 2: Typecheck do projeto inteiro**

Run: `cd C:\sei\seirmg && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Lint**

Run: `cd C:\sei\seirmg && npx eslint src`
Expected: sem erros.

- [ ] **Step 4: Build final**

Run: `cd C:\sei\seirmg && npm run build`
Expected: build sem erros, `dist/` gerado.

- [ ] **Step 5: Verificação manual (⚠️ requer instância SEI real)**

Carregar `dist/` como extensão descompactada no Chrome, abrir a tela de Controle de Processos
(`acao=procedimento_controlar`) numa instância SEI real, e confirmar:
- Colunas "Dias" e "Prazo" aparecem preenchidas para processos que têm o ícone nativo "Controle de Prazo"
  definido (data em "Prazo", número em "Dias"), e vazias para os que não têm.
- Clicar no cabeçalho "Dias" ordena numericamente (crescente no primeiro clique, decrescente no segundo).
- Clicar no cabeçalho "Prazo" ordena por data.
- Linhas com prazo classificado como alerta/crítico continuam recebendo a cor de destaque
  (`infraTrseippalerta`/`infraTrseippcritico`).
- Painel de Favoritos continua mostrando prazo normalmente (não deve ter regressão, já que
  `obterControleDePrazoDaLinha` não mudou).
- Aba "Processos" das Opções: os novos campos "Alerta (dias até vencer)"/"Crítico (dias até vencer)"
  aparecem, salvam e recarregam corretamente.

Caso algum ponto falhe, ver o aviso de risco padrão do projeto (mesmo tratamento de todo lote que só pode
ser confirmado numa instância SEI real, ex. Lote F/K/Q) — reportar o comportamento real observado antes de
qualquer ajuste.

- [ ] **Step 6: Atualizar `docs/ROADMAP-LOTES.md`**

Adicionar uma entrada em "Já entregue" descrevendo esta melhoria (fonte nativa pras colunas Dias/Prazo +
correção de ordenação), removendo a menção pendente no item M que dizia "Falta ainda: aplicar essa mesma
fonte na coluna 'Dias/Prazo' da tabela nativa".

---
