# Informações adicionais no painel lateral da árvore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar Nível de Acesso, Especificação, Assuntos e Observação (da unidade atual) ao painel lateral que já é injetado automaticamente na árvore do processo (SEIRMG), reaproveitando o fetch que esse painel já faz hoje — sem nenhuma requisição de rede nova.

**Architecture:** Quatro novas funções puras de extração em `features/procedimento-visualizar/painelLateral.ts` (mesmo padrão de `extrairTipoProcesso`/`extrairInteressados`, já existentes), consumindo o mesmo `Document` já parseado por `montarPainelTipoEInteressados` em `content-scripts/procedimento_visualizar/index.ts`. Quatro novas funções de renderização no content script (mesmo padrão de `renderizarInteressados`), chamadas na ordem: Tipo → Nível de Acesso → Especificação → Assuntos → Interessados → Observação.

**Tech Stack:** TypeScript, Vite, Vitest, Bun.

## Global Constraints

- Nenhum fetch novo — as 4 funções de extração recebem o `Document` que `montarPainelTipoEInteressados` já busca via `fetchText(extrairUrlEdicaoProcesso(...))`.
- Nenhum toggle/estado "sob demanda" — os campos aparecem automaticamente, igual às seções já existentes (Tipo, Interessados, Atribuição).
- Seletores (`rdoNivelAcesso`, `selHipoteseLegal`, `selAssuntos`, `txaObservacoes`, `txtDescricao`) são baseados nos nomes de campo que o Sei Pro usa para essa mesma tela — **não confirmados contra uma instância SEI real**. Sinalizar como pendente de validação manual, mesmo tratamento já usado em `extrairAtribuicao` neste mesmo arquivo.
- Campo vazio (sem assuntos, sem observação etc.) mostra um texto neutro em vez de ficar em branco — mesma convenção já usada em `renderizarInteressados` para lista vazia.
- Qualquer falha de leitura de DOM segue a política já estabelecida no projeto: try/catch com `console.error('[SEIRMG] ...', error)`, sem travar o restante do painel (já garantido pelo `try/catch` existente em `montarPainelLateral`, que envolve toda a cadeia).
- Fora de escopo (não implementar nesta rodada): Marcador, edição inline de qualquer campo, observações de todas as unidades (só a da unidade atual).

---

### Task 1: Quatro funções puras de extração em `painelLateral.ts`

**Files:**
- Modify: `src/features/procedimento-visualizar/painelLateral.ts`
- Test: `src/features/procedimento-visualizar/painelLateral.test.ts`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces:
  - `export interface NivelAcessoExtraido { nivel: 'Público' | 'Restrito' | 'Sigiloso' | ''; hipoteseLegal: string | null }`
  - `export function extrairNivelAcesso(doc: Document): NivelAcessoExtraido`
  - `export function extrairAssuntos(doc: Document): string[]`
  - `export function extrairObservacao(doc: Document): string`
  - `export function extrairEspecificacao(doc: Document): string`
  - Essas 4 assinaturas são consumidas pela Task 2.

- [ ] **Step 1: Escrever os testes que falham para as 4 funções**

Adicionar ao final de `src/features/procedimento-visualizar/painelLateral.test.ts` (mantendo os imports e testes existentes no topo do arquivo, só acrescentando ao import e ao final do arquivo):

Atualizar a linha de import no topo do arquivo (linha 2-8 atual) para:

```ts
import {
  extrairUrlEdicaoProcesso,
  extrairTipoProcesso,
  extrairInteressados,
  obterUnidadeAtual,
  extrairAtribuicao,
  extrairNivelAcesso,
  extrairAssuntos,
  extrairObservacao,
  extrairEspecificacao,
} from './painelLateral'
```

Acrescentar ao final do arquivo (depois do último `describe('extrairAtribuicao', ...)`):

```ts
describe('extrairNivelAcesso', () => {
  it('retorna Público quando rdoNivelAcesso = 0', () => {
    const doc = montarDocumento(`
      <input type="radio" name="rdoNivelAcesso" value="0" checked>
      <input type="radio" name="rdoNivelAcesso" value="1">
    `)
    expect(extrairNivelAcesso(doc)).toEqual({ nivel: 'Público', hipoteseLegal: null })
  })

  it('retorna Restrito com a hipótese legal selecionada quando rdoNivelAcesso = 1', () => {
    const doc = montarDocumento(`
      <input type="radio" name="rdoNivelAcesso" value="1" checked>
      <select id="selHipoteseLegal">
        <option value="1">Outra hipótese</option>
        <option value="2" selected>Informação Pessoal</option>
      </select>
    `)
    expect(extrairNivelAcesso(doc)).toEqual({ nivel: 'Restrito', hipoteseLegal: 'Informação Pessoal' })
  })

  it('retorna Sigiloso quando rdoNivelAcesso = 2', () => {
    const doc = montarDocumento(`<input type="radio" name="rdoNivelAcesso" value="2" checked>`)
    expect(extrairNivelAcesso(doc)).toEqual({ nivel: 'Sigiloso', hipoteseLegal: null })
  })

  it('retorna nível vazio quando não há rádio marcado', () => {
    expect(extrairNivelAcesso(montarDocumento('<div></div>'))).toEqual({ nivel: '', hipoteseLegal: null })
  })
})

describe('extrairAssuntos', () => {
  it('extrai o texto de cada option', () => {
    const doc = montarDocumento(`
      <select id="selAssuntos">
        <option value="1">Recursos Humanos</option>
        <option value="2">Licitação</option>
      </select>
    `)
    expect(extrairAssuntos(doc)).toEqual(['Recursos Humanos', 'Licitação'])
  })

  it('ignora options com texto vazio', () => {
    const doc = montarDocumento(`
      <select id="selAssuntos">
        <option value=""></option>
        <option value="1">Licitação</option>
      </select>
    `)
    expect(extrairAssuntos(doc)).toEqual(['Licitação'])
  })

  it('retorna lista vazia quando não há select', () => {
    expect(extrairAssuntos(montarDocumento('<div></div>'))).toEqual([])
  })
})

describe('extrairObservacao', () => {
  it('extrai o texto da textarea', () => {
    const doc = montarDocumento(`<textarea id="txaObservacoes">Aguardando retorno da unidade.</textarea>`)
    expect(extrairObservacao(doc)).toBe('Aguardando retorno da unidade.')
  })

  it('retorna string vazia quando a textarea está vazia', () => {
    const doc = montarDocumento(`<textarea id="txaObservacoes"></textarea>`)
    expect(extrairObservacao(doc)).toBe('')
  })

  it('retorna string vazia quando não há textarea', () => {
    expect(extrairObservacao(montarDocumento('<div></div>'))).toBe('')
  })
})

describe('extrairEspecificacao', () => {
  it('extrai o valor do campo de texto', () => {
    const doc = montarDocumento(`<input type="text" id="txtDescricao" value="Contrato de manutenção predial">`)
    expect(extrairEspecificacao(doc)).toBe('Contrato de manutenção predial')
  })

  it('retorna string vazia quando o campo está vazio', () => {
    const doc = montarDocumento(`<input type="text" id="txtDescricao" value="">`)
    expect(extrairEspecificacao(doc)).toBe('')
  })

  it('retorna string vazia quando não há o campo', () => {
    expect(extrairEspecificacao(montarDocumento('<div></div>'))).toBe('')
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham (funções ainda não existem)**

Run: `bun run test -- painelLateral` (a partir de `C:\sei\seirmg`)
Expected: FAIL — `extrairNivelAcesso`/`extrairAssuntos`/`extrairObservacao`/`extrairEspecificacao` não exportados por `./painelLateral` (erro de import/undefined).

- [ ] **Step 3: Implementar as 4 funções**

Acrescentar ao final de `src/features/procedimento-visualizar/painelLateral.ts` (depois de `extrairAtribuicao`):

```ts
export interface NivelAcessoExtraido {
  nivel: 'Público' | 'Restrito' | 'Sigiloso' | ''
  hipoteseLegal: string | null
}

export function extrairNivelAcesso(doc: Document): NivelAcessoExtraido {
  const valor = doc.querySelector<HTMLInputElement>('input[name="rdoNivelAcesso"]:checked')?.value

  if (valor === '0') return { nivel: 'Público', hipoteseLegal: null }
  if (valor === '2') return { nivel: 'Sigiloso', hipoteseLegal: null }
  if (valor === '1') {
    const hipotese = doc.querySelector<HTMLSelectElement>('#selHipoteseLegal')?.selectedOptions[0]?.textContent?.trim()
    return { nivel: 'Restrito', hipoteseLegal: hipotese || null }
  }
  return { nivel: '', hipoteseLegal: null }
}

export function extrairAssuntos(doc: Document): string[] {
  return Array.from(doc.querySelectorAll('#selAssuntos option'))
    .map((option) => option.textContent?.trim() ?? '')
    .filter((texto) => texto !== '')
}

export function extrairObservacao(doc: Document): string {
  return doc.querySelector<HTMLTextAreaElement>('#txaObservacoes')?.value.trim() ?? ''
}

export function extrairEspecificacao(doc: Document): string {
  return doc.querySelector<HTMLInputElement>('#txtDescricao')?.value.trim() ?? ''
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bun run test -- painelLateral`
Expected: PASS, todos os `describe` do arquivo (existentes + os 4 novos).

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/features/procedimento-visualizar/painelLateral.ts src/features/procedimento-visualizar/painelLateral.test.ts
git commit -m "feat: extrai nível de acesso, assuntos, observação e especificação do processo"
```

---

### Task 2: Renderizar os 4 campos novos no painel lateral da árvore

**Files:**
- Modify: `src/content-scripts/procedimento_visualizar/index.ts`

**Interfaces:**
- Consumes: `extrairNivelAcesso`, `extrairAssuntos`, `extrairObservacao`, `extrairEspecificacao`, `type NivelAcessoExtraido` (Task 1, `../../features/procedimento-visualizar/painelLateral`).
- Produces: nenhuma interface nova exposta a outros arquivos — as novas funções de renderização (`renderizarNivelAcesso`, `renderizarAssuntos`, `renderizarTextoSimples`) ficam privadas a este content script, mesmo padrão de `renderizarInteressados`/`renderizarAtribuicao` já existentes nele.

- [ ] **Step 1: Atualizar o import de `painelLateral`**

Em `src/content-scripts/procedimento_visualizar/index.ts`, substituir o bloco de import (linhas 11-19 atuais):

```ts
import {
  extrairUrlEdicaoProcesso,
  extrairTipoProcesso,
  extrairInteressados,
  obterUnidadeAtual,
  extrairAtribuicao,
  type InteressadoExtraido,
  type DadosAtribuicao,
} from '../../features/procedimento-visualizar/painelLateral'
```

por:

```ts
import {
  extrairUrlEdicaoProcesso,
  extrairTipoProcesso,
  extrairInteressados,
  obterUnidadeAtual,
  extrairAtribuicao,
  extrairNivelAcesso,
  extrairAssuntos,
  extrairObservacao,
  extrairEspecificacao,
  type InteressadoExtraido,
  type DadosAtribuicao,
  type NivelAcessoExtraido,
} from '../../features/procedimento-visualizar/painelLateral'
```

- [ ] **Step 2: Adicionar as funções de renderização**

Inserir logo depois da função `renderizarInteressados` existente (depois da linha `}` que fecha essa função, antes de `renderizarAtribuicao`):

```ts
function renderizarNivelAcesso(container: HTMLElement, dados: NivelAcessoExtraido): void {
  container.appendChild(criarSeparador('Nível de Acesso'))
  const p = document.createElement('p')
  p.className = 'seirmg-nivel-acesso'
  if (!dados.nivel) {
    p.textContent = 'Não especificado.'
  } else if (dados.hipoteseLegal) {
    p.textContent = `${dados.nivel}: ${dados.hipoteseLegal}`
  } else {
    p.textContent = dados.nivel
  }
  container.appendChild(p)
}

function renderizarAssuntos(container: HTMLElement, assuntos: string[]): void {
  container.appendChild(criarSeparador('Assuntos'))
  const div = document.createElement('div')
  div.id = 'seirmg-assuntos'

  if (assuntos.length === 0) {
    const p = document.createElement('p')
    p.className = 'seirmg-assunto'
    p.textContent = 'Nenhum assunto especificado.'
    div.appendChild(p)
  } else {
    assuntos.forEach((assunto) => {
      const p = document.createElement('p')
      p.className = 'seirmg-assunto'
      p.textContent = assunto
      div.appendChild(p)
    })
  }

  container.appendChild(div)
}

function renderizarTextoSimples(container: HTMLElement, titulo: string, classe: string, texto: string, vazio: string): void {
  container.appendChild(criarSeparador(titulo))
  const p = document.createElement('p')
  p.className = classe
  p.textContent = texto || vazio
  container.appendChild(p)
}
```

- [ ] **Step 3: Chamar as novas funções em `montarPainelTipoEInteressados`, na ordem definida na spec**

Substituir o corpo de `montarPainelTipoEInteressados` (a partir de `renderizarInteressados(container, extrairInteressados(doc))`, antes do `if (numero) {`):

```ts
  renderizarInteressados(container, extrairInteressados(doc))
```

por:

```ts
  renderizarNivelAcesso(container, extrairNivelAcesso(doc))
  renderizarTextoSimples(container, 'Especificação', 'seirmg-especificacao', extrairEspecificacao(doc), 'Sem especificação.')
  renderizarAssuntos(container, extrairAssuntos(doc))
  renderizarInteressados(container, extrairInteressados(doc))
  renderizarTextoSimples(container, 'Observação', 'seirmg-observacao', extrairObservacao(doc), 'Sem observação.')
```

(Nível de Acesso e Especificação entram logo após a seção "Tipo do processo", que continua vindo antes deste bloco sem mudança; Observação fica por último, antes do bloco `if (numero) { ... }` do Planka, que também não muda.)

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Rodar a suíte de testes inteira**

Run: `bun run test`
Expected: PASS, sem regressão (este arquivo de content script não tem teste próprio; a suíte confirma que nada mais no projeto quebrou).

- [ ] **Step 6: Rodar o build**

Run: `bun run build`
Expected: build conclui sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/content-scripts/procedimento_visualizar/index.ts
git commit -m "feat: exibe nível de acesso, especificação, assuntos e observação no painel lateral da árvore"
```

---

## Verificação manual pendente (fora do escopo de teste automatizado)

Numa instância SEI real: abrir a árvore de um processo (com assuntos, observação e especificação
preenchidos) e confirmar que as 4 seções novas aparecem no painel lateral, com os valores corretos —
em especial confirmar que os seletores (`rdoNivelAcesso`, `selHipoteseLegal`, `selAssuntos`,
`txaObservacoes`, `txtDescricao`) batem com o HTML real da tela "Consultar/Alterar Processo" (não
confirmados durante este plano). Testar também um processo Restrito (hipótese legal aparece) e um
processo sem assuntos/observação/especificação preenchidos (textos neutros aparecem em vez de seção
vazia ou quebrada).
