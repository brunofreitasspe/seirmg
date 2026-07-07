# SEIRMG — Lote G: Visualização de Processo — Ajustes Nativos, Título e Anotação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar `ajustarElementosNativos.js`, `alterarTitulo.js`, `mostrarAnotacao.js` e `atualizarAnotacaoNaArvore.js` do Sei++ — as 4 features de `procedimento_visualizar`/`anotacao_registrar` com estrutura de DOM estável. Ver `docs/superpowers/specs/2026-07-07-seirmg-lote-g-visualizacao-processo-design.md` para o racional do escopo reduzido (as 7 features de alto risco de `procedimento_visualizar` ficam para o Lote G2).

**Architecture:** Lógica pura testável em `features/procedimento-visualizar/`, wiring fino não-testado em dois content scripts novos (`procedimento_visualizar` e `anotacao_registrar`).

**Tech Stack:** TypeScript, Vite, `@crxjs/vite-plugin`, Bun, Vitest — mesma infraestrutura já existente. Nenhuma dependência nova.

## Global Constraints

- Nenhuma dependência nova (sem jQuery, consistente com todos os lotes anteriores).
- `escapeComponentAnotacao` usa a função global `escape()` (deprecated) intencionalmente — o SEI espera codificação ISO-8859-1 nesse campo, não UTF-8 (`encodeURIComponent` quebraria acentuação). Preservado do original, não é um erro.
- URLs relativas resolvidas via `new URL(relativa, base).href` (mesma adaptação já usada nos Lotes E2/F) — nunca caminho fixo hardcoded.
- Todo listener/callback assíncrono novo segue o padrão já estabelecido: guard `try/catch`, loga via `console.error('[SEIRMG] ...', error)`, nunca lança exceção não tratada. Cada etapa do bootstrap de `procedimento_visualizar` roda isolada.

---

## Mapa de arquivos (visão geral)

```
seirmg/
├── manifest.config.ts (modificado)
├── src/
│   ├── features/procedimento-visualizar/
│   │   ├── ajustarElementosNativos.ts (+ .test.ts, novo)
│   │   ├── alterarTitulo.ts (+ .test.ts, novo)
│   │   └── anotacao.ts (+ .test.ts, novo)
│   └── content-scripts/
│       ├── procedimento_visualizar/index.ts (novo)
│       └── anotacao_registrar/index.ts (novo)
```

---

### Task 1: `features/procedimento-visualizar/ajustarElementosNativos.ts`

**Files:**
- Create: `C:\sei\seirmg\src\features\procedimento-visualizar\ajustarElementosNativos.ts`
- Test: `C:\sei\seirmg\src\features\procedimento-visualizar\ajustarElementosNativos.test.ts`

**Contexto**: porte de `C:\sei\seiplus\cs_modules\procedimento_visualizar\ajustarElementosNativos.js`.

**Interfaces:**
- Consumes: nenhuma
- Produces: `extrairTooltipRelacionado(onmouseover: string): string | null`; `type EstadoDivRelacionados = 'vazio' | 'apenas-titulo' | 'com-conteudo'`; `classificarDivRelacionados(textoCompleto: string, textoContents: string): EstadoDivRelacionados`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/features/procedimento-visualizar/ajustarElementosNativos.test.ts
import { describe, expect, it } from 'vitest'
import { classificarDivRelacionados, extrairTooltipRelacionado } from './ajustarElementosNativos'

describe('extrairTooltipRelacionado', () => {
  it('extrai o texto do tooltip', () => {
    expect(extrairTooltipRelacionado("return infraTooltipMostrar('Recursos Humanos')")).toBe(
      'Recursos Humanos'
    )
  })

  it('retorna null quando não casa com o padrão', () => {
    expect(extrairTooltipRelacionado('texto qualquer')).toBeNull()
  })
})

describe('classificarDivRelacionados', () => {
  it('classifica como vazio quando o texto completo está em branco', () => {
    expect(classificarDivRelacionados('   ', '')).toBe('vazio')
  })

  it('classifica como apenas-titulo quando os nós diretos são só o rótulo', () => {
    expect(classificarDivRelacionados('Processos Relacionados: 123', 'Processos Relacionados:')).toBe(
      'apenas-titulo'
    )
  })

  it('classifica como com-conteudo em qualquer outro caso', () => {
    expect(classificarDivRelacionados('Processos Relacionados: 123', 'algo diferente')).toBe(
      'com-conteudo'
    )
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/features/procedimento-visualizar/ajustarElementosNativos.test.ts`
Expected: FAIL — `Cannot find module './ajustarElementosNativos'`

- [ ] **Step 3: Implementar `src/features/procedimento-visualizar/ajustarElementosNativos.ts`**

```ts
export function extrairTooltipRelacionado(onmouseover: string): string | null {
  const regex = /return infraTooltipMostrar\('(.*)'\)/m
  return regex.exec(onmouseover)?.[1] ?? null
}

export type EstadoDivRelacionados = 'vazio' | 'apenas-titulo' | 'com-conteudo'

export function classificarDivRelacionados(
  textoCompleto: string,
  textoContents: string
): EstadoDivRelacionados {
  if (textoCompleto.trim().length === 0) return 'vazio'
  if (textoContents.trim() === 'Processos Relacionados:') return 'apenas-titulo'
  return 'com-conteudo'
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/features/procedimento-visualizar/ajustarElementosNativos.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add src/features/procedimento-visualizar/ajustarElementosNativos.ts src/features/procedimento-visualizar/ajustarElementosNativos.test.ts
git commit -m "feat(procedimento-visualizar): add native elements adjustment helpers"
```

---

### Task 2: `features/procedimento-visualizar/alterarTitulo.ts`

**Files:**
- Create: `C:\sei\seirmg\src\features\procedimento-visualizar\alterarTitulo.ts`
- Test: `C:\sei\seirmg\src\features\procedimento-visualizar\alterarTitulo.test.ts`

**Contexto**: porte de `C:\sei\seiplus\cs_modules\procedimento_visualizar\alterarTitulo.js`.

**Interfaces:**
- Consumes: nenhuma
- Produces: `montarTituloJanela(numero: string, tipo: string): string`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/features/procedimento-visualizar/alterarTitulo.test.ts
import { describe, expect, it } from 'vitest'
import { montarTituloJanela } from './alterarTitulo'

describe('montarTituloJanela', () => {
  it('monta o título no formato SEI - numero - tipo', () => {
    expect(montarTituloJanela('00001.000001/2026-01', 'Processo Administrativo')).toBe(
      'SEI - 00001.000001/2026-01 - Processo Administrativo'
    )
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/features/procedimento-visualizar/alterarTitulo.test.ts`
Expected: FAIL — `Cannot find module './alterarTitulo'`

- [ ] **Step 3: Implementar `src/features/procedimento-visualizar/alterarTitulo.ts`**

```ts
export function montarTituloJanela(numero: string, tipo: string): string {
  return `SEI - ${numero} - ${tipo}`
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/features/procedimento-visualizar/alterarTitulo.test.ts`
Expected: PASS (1 teste)

- [ ] **Step 5: Commit**

```bash
git add src/features/procedimento-visualizar/alterarTitulo.ts src/features/procedimento-visualizar/alterarTitulo.test.ts
git commit -m "feat(procedimento-visualizar): add window title formatting helper"
```

---

### Task 3: `features/procedimento-visualizar/anotacao.ts`

**Files:**
- Create: `C:\sei\seirmg\src\features\procedimento-visualizar\anotacao.ts`
- Test: `C:\sei\seirmg\src\features\procedimento-visualizar\anotacao.test.ts`

**Contexto**: porte de `C:\sei\seiplus\cs_modules\procedimento_visualizar\mostrarAnotacao.js` (só a lógica de leitura/gravação de dados — a UI fica na Task 4).

**Interfaces:**
- Consumes: nenhuma
- Produces: `interface AnotacaoDados { texto: string; prioridade: boolean; idProtocolo: string; tipoPagina: string; postUrl: string }`; `parseAnotacaoDados(doc: Document): AnotacaoDados`; `escapeComponentAnotacao(texto: string): string`; `montarCorpoSalvarAnotacao(dados: { texto: string; prioridade: boolean; idProtocolo: string; tipoPagina: string }): string`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/features/procedimento-visualizar/anotacao.test.ts
import { describe, expect, it } from 'vitest'
import { escapeComponentAnotacao, montarCorpoSalvarAnotacao, parseAnotacaoDados } from './anotacao'

function montarDocumento(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('parseAnotacaoDados', () => {
  it('extrai os dados dos campos estáveis', () => {
    const doc = montarDocumento(`
      <form id="frmAnotacaoCadastro" action="controlador.php?acao=anotacao_gravar">
        <textarea id="txaDescricao">Nota importante</textarea>
        <input id="chkSinPrioridade" type="checkbox" checked />
        <input id="hdnIdProtocolo" value="123" />
        <input id="hdnInfraTipoPagina" value="P" />
      </form>
    `)
    expect(parseAnotacaoDados(doc)).toEqual({
      texto: 'Nota importante',
      prioridade: true,
      idProtocolo: '123',
      tipoPagina: 'P',
      postUrl: 'controlador.php?acao=anotacao_gravar',
    })
  })

  it('retorna valores vazios/false quando os campos não existem', () => {
    const doc = montarDocumento('<div></div>')
    expect(parseAnotacaoDados(doc)).toEqual({
      texto: '',
      prioridade: false,
      idProtocolo: '',
      tipoPagina: '',
      postUrl: '',
    })
  })
})

describe('escapeComponentAnotacao', () => {
  it('escapa acentos e espaços no padrão ISO-8859-1', () => {
    expect(escapeComponentAnotacao('ação teste')).toBe(escape('ação teste').replace(/\+/g, '%2B'))
  })

  it('escapa o caractere + corretamente (não vira espaço)', () => {
    expect(escapeComponentAnotacao('a+b')).toBe('a%2Bb')
  })
})

describe('montarCorpoSalvarAnotacao', () => {
  it('monta o corpo com prioridade ligada', () => {
    const corpo = montarCorpoSalvarAnotacao({
      texto: 'nota',
      prioridade: true,
      idProtocolo: '123',
      tipoPagina: 'P',
    })
    expect(corpo).toBe(
      'hdnInfraTipoPagina=P&sbmRegistrarAnotacao=Salvar&txaDescricao=nota&hdnIdProtocolo=123&chkSinPrioridade=on'
    )
  })

  it('força prioridade para off quando o texto fica vazio (remoção)', () => {
    const corpo = montarCorpoSalvarAnotacao({
      texto: '',
      prioridade: true,
      idProtocolo: '123',
      tipoPagina: 'P',
    })
    expect(corpo).toContain('chkSinPrioridade=off')
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/features/procedimento-visualizar/anotacao.test.ts`
Expected: FAIL — `Cannot find module './anotacao'`

- [ ] **Step 3: Implementar `src/features/procedimento-visualizar/anotacao.ts`**

```ts
export interface AnotacaoDados {
  texto: string
  prioridade: boolean
  idProtocolo: string
  tipoPagina: string
  postUrl: string
}

export function parseAnotacaoDados(doc: Document): AnotacaoDados {
  return {
    texto: doc.getElementById('txaDescricao')?.textContent ?? '',
    prioridade: !!doc.querySelector('#chkSinPrioridade:checked'),
    idProtocolo: (doc.getElementById('hdnIdProtocolo') as HTMLInputElement | null)?.value ?? '',
    tipoPagina: (doc.getElementById('hdnInfraTipoPagina') as HTMLInputElement | null)?.value ?? '',
    postUrl: doc.getElementById('frmAnotacaoCadastro')?.getAttribute('action') ?? '',
  }
}

export function escapeComponentAnotacao(texto: string): string {
  return escape(texto).replace(/\+/g, '%2B')
}

export function montarCorpoSalvarAnotacao(dados: {
  texto: string
  prioridade: boolean
  idProtocolo: string
  tipoPagina: string
}): string {
  const txaDescricao = escapeComponentAnotacao(dados.texto.trim())
  const chkSinPrioridade = txaDescricao === '' ? 'off' : dados.prioridade ? 'on' : 'off'
  return `hdnInfraTipoPagina=${dados.tipoPagina}&sbmRegistrarAnotacao=Salvar&txaDescricao=${txaDescricao}&hdnIdProtocolo=${dados.idProtocolo}&chkSinPrioridade=${chkSinPrioridade}`
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/features/procedimento-visualizar/anotacao.test.ts`
Expected: PASS (6 testes)

- [ ] **Step 5: Commit**

```bash
git add src/features/procedimento-visualizar/anotacao.ts src/features/procedimento-visualizar/anotacao.test.ts
git commit -m "feat(procedimento-visualizar): add anotação parse/escape/body helpers"
```

---

### Task 4: `content-scripts/procedimento_visualizar/index.ts` + `manifest.config.ts`

**Files:**
- Create: `C:\sei\seirmg\src\content-scripts\procedimento_visualizar\index.ts`
- Modify: `C:\sei\seirmg\manifest.config.ts`

**Contexto**: wiring fino, conecta DOM + `fetch` à lógica já testada. Não é coberta por TDD — verificado via build.

**Interfaces:**
- Consumes: `extrairTooltipRelacionado`, `classificarDivRelacionados` (Task 1); `montarTituloJanela` (Task 2); `parseAnotacaoDados`, `montarCorpoSalvarAnotacao`, `type AnotacaoDados` (Task 3); `fetchText` (`../../lib/result`)

- [ ] **Step 1: Criar `src/content-scripts/procedimento_visualizar/index.ts`**

```ts
import {
  classificarDivRelacionados,
  extrairTooltipRelacionado,
} from '../../features/procedimento-visualizar/ajustarElementosNativos'
import { montarTituloJanela } from '../../features/procedimento-visualizar/alterarTitulo'
import {
  montarCorpoSalvarAnotacao,
  parseAnotacaoDados,
  type AnotacaoDados,
} from '../../features/procedimento-visualizar/anotacao'
import { fetchText } from '../../lib/result'

function ajustarElementosNativos(): void {
  try {
    const divRelacionados = document.getElementById('divRelacionados')
    if (divRelacionados) {
      const textoCompleto = divRelacionados.textContent ?? ''
      const textoContents = Array.from(divRelacionados.childNodes)
        .map((no) => no.textContent ?? '')
        .join('')
      const estado = classificarDivRelacionados(textoCompleto, textoContents)

      if (estado === 'vazio') {
        divRelacionados.style.display = 'none'
      } else if (estado === 'apenas-titulo') {
        const separador = document.createElement('div')
        separador.className = 'seirmg-separador'
        const span = document.createElement('span')
        span.textContent = 'Processos relacionados'
        separador.appendChild(span)
        divRelacionados.insertAdjacentElement('afterend', separador)
        divRelacionados.style.display = 'none'
      }
    }

    document.querySelectorAll<HTMLAnchorElement>('.divRelacionadosParcial > a').forEach((link) => {
      const onMouseOver = link.getAttribute('onmouseover')
      if (!onMouseOver) return
      const especificacao = extrairTooltipRelacionado(onMouseOver)
      if (!especificacao) return
      const p = document.createElement('p')
      p.className = 'seirmg-processo-relacionado-especificacao'
      p.textContent = especificacao
      link.insertAdjacentElement('afterend', p)
    })

    document.getElementById('divConsultarAndamento')?.classList.add('seirmg-consultar-andamento')
  } catch (error) {
    console.error('[SEIRMG] Falha ao ajustar elementos nativos:', error)
  }
}

function esperarElemento(
  seletorRaiz: string,
  seletor: string,
  callback: () => void,
  tentativasRestantes = 30
): void {
  const raiz = document.querySelector(seletorRaiz)
  const elementos = raiz?.querySelectorAll(seletor)
  if (elementos && elementos.length > 0) {
    callback()
    return
  }
  if (tentativasRestantes <= 0) return
  setTimeout(() => esperarElemento(seletorRaiz, seletor, callback, tentativasRestantes - 1), 100)
}

function alterarTitulo(): void {
  try {
    esperarElemento('body.infraArvore', "a[target$='Visualizacao']", () => {
      try {
        const link = document.querySelector('.infraArvore > a[target="ifrVisualizacao"]')
        if (!link) return
        const tipo = link.getAttribute('title') ?? ''
        const numero = link.textContent?.trim() ?? ''
        window.parent.document.title = montarTituloJanela(numero, tipo)
      } catch (error) {
        console.error('[SEIRMG] Falha ao alterar título da janela:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar alteração de título:', error)
  }
}

function montarPainelAnotacao(): void {
  try {
    const marcador = 'controlador.php?acao=anotacao_registrar&'
    const head = document.head.innerHTML
    const inicio = head.indexOf(marcador)
    if (inicio === -1) return
    const fim = head.indexOf('"', inicio)
    if (fim === -1) return
    const url = new URL(head.substring(inicio, fim), window.location.href).href

    const container = document.getElementById('container') ?? document.body

    const separador = document.createElement('div')
    separador.className = 'seirmg-separador'
    const spanSep = document.createElement('span')
    spanSep.textContent = 'Anotações'
    separador.appendChild(spanSep)

    const divAnotacao = document.createElement('div')
    divAnotacao.id = 'seirmg-anotacao'
    container.append(separador, divAnotacao)

    let dadosAtuais: AnotacaoDados = {
      texto: '',
      prioridade: false,
      idProtocolo: '',
      tipoPagina: '',
      postUrl: '',
    }

    async function carregar(): Promise<void> {
      divAnotacao.innerHTML = ''
      const resultado = await fetchText(url)
      if (!resultado.ok) {
        console.error('[SEIRMG] Falha ao buscar dados da anotação:', resultado.error)
        return
      }
      const doc = new DOMParser().parseFromString(resultado.data, 'text/html')
      dadosAtuais = parseAnotacaoDados(doc)
      montarUI()
    }

    function montarUI(): void {
      const semAnotacao = document.createElement('div')
      semAnotacao.className = 'seirmg-sem-anotacao'
      const pSem = document.createElement('p')
      pSem.textContent = 'Este processo não possui anotações. '
      const aCriar = document.createElement('a')
      aCriar.href = '#'
      aCriar.textContent = 'Clique aqui'
      pSem.append(aCriar, document.createTextNode(' para criar uma nota.'))
      semAnotacao.appendChild(pSem)

      const comAnotacao = document.createElement('div')
      comAnotacao.className = 'seirmg-anotacao'

      const botoes = document.createElement('div')
      const btnRemover = document.createElement('button')
      btnRemover.type = 'button'
      btnRemover.textContent = 'Remover'
      const btnEditar = document.createElement('button')
      btnEditar.type = 'button'
      btnEditar.textContent = 'Editar'
      botoes.append(btnRemover, btnEditar)
      comAnotacao.appendChild(botoes)

      const pTexto = document.createElement('p')
      pTexto.className = 'seirmg-anotacao-texto'
      pTexto.textContent = dadosAtuais.texto
      comAnotacao.appendChild(pTexto)

      const divEditar = document.createElement('div')
      divEditar.style.display = 'none'
      const textarea = document.createElement('textarea')
      textarea.maxLength = 500
      divEditar.appendChild(textarea)

      const chkPrioridade = document.createElement('input')
      chkPrioridade.type = 'checkbox'
      chkPrioridade.checked = dadosAtuais.prioridade
      const lblPrioridade = document.createElement('label')
      lblPrioridade.textContent = 'Prioridade'
      divEditar.append(chkPrioridade, lblPrioridade)

      const btnCancelar = document.createElement('button')
      btnCancelar.type = 'button'
      btnCancelar.textContent = 'Cancelar'
      const btnSalvar = document.createElement('button')
      btnSalvar.type = 'button'
      btnSalvar.textContent = 'Salvar'
      divEditar.append(btnCancelar, btnSalvar)
      comAnotacao.appendChild(divEditar)

      divAnotacao.append(semAnotacao, comAnotacao)

      if (dadosAtuais.texto === '') {
        comAnotacao.style.display = 'none'
        semAnotacao.style.display = 'block'
      } else {
        semAnotacao.style.display = 'none'
        comAnotacao.style.display = 'block'
      }

      const iniciarEdicao = (): void => {
        semAnotacao.style.display = 'none'
        botoes.style.display = 'none'
        pTexto.style.display = 'none'
        textarea.value = pTexto.textContent ?? ''
        divEditar.style.display = 'block'
        textarea.focus()
      }

      aCriar.addEventListener('click', (evento) => {
        evento.preventDefault()
        iniciarEdicao()
      })
      btnEditar.addEventListener('click', () => iniciarEdicao())

      btnCancelar.addEventListener('click', () => {
        botoes.style.display = 'block'
        pTexto.style.display = 'block'
        divEditar.style.display = 'none'
        if (dadosAtuais.texto === '') {
          comAnotacao.style.display = 'none'
          semAnotacao.style.display = 'block'
        }
      })

      btnSalvar.addEventListener('click', () => {
        salvar(textarea.value, chkPrioridade.checked)
      })

      btnRemover.addEventListener('click', () => {
        if (!confirm('Deseja remover a anotação deste processo?')) return
        salvar('', false)
      })
    }

    async function salvar(texto: string, prioridade: boolean): Promise<void> {
      try {
        const corpo = montarCorpoSalvarAnotacao({
          texto,
          prioridade,
          idProtocolo: dadosAtuais.idProtocolo,
          tipoPagina: dadosAtuais.tipoPagina,
        })
        await fetch(new URL(dadosAtuais.postUrl, window.location.href).href, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: corpo,
        })
        await carregar()
      } catch (error) {
        console.error('[SEIRMG] Falha ao salvar anotação:', error)
      }
    }

    carregar().catch((error) => {
      console.error('[SEIRMG] Falha ao carregar anotação:', error)
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar painel de anotação:', error)
  }
}

function bootstrap(): void {
  ajustarElementosNativos()
  alterarTitulo()
  montarPainelAnotacao()
}

bootstrap()
```

- [ ] **Step 2: Adicionar o bloco novo em `manifest.config.ts`**

No array `content_scripts`, adicionar (depois do bloco de `documento_receber`):

```ts
    {
      matches: [
        '*://*.br/*controlador.php?acao=procedimento_visualizar*',
        '*://*.org/*controlador.php?acao=procedimento_visualizar*',
      ],
      js: ['src/content-scripts/procedimento_visualizar/index.ts'],
      run_at: 'document_idle',
    },
```

- [ ] **Step 3: Rodar toda a suíte de testes para confirmar que nada quebrou**

Run: `cd C:\sei\seirmg && bunx vitest run`
Expected: todos os testes continuam passando (208 testes no total — 196 antes deste plano + 5 (Task 1) + 1 (Task 2) + 6 (Task 3) = 208)

- [ ] **Step 4: Rodar o build**

Run: `bun run build`
Expected: sucesso, sem erros de tipo. Se houver erro, rode `bun run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/content-scripts/procedimento_visualizar/index.ts manifest.config.ts
git commit -m "feat(procedimento-visualizar): wire native elements, title and anotação panel"
```

---

### Task 5: `content-scripts/anotacao_registrar/index.ts` + `manifest.config.ts`

**Files:**
- Create: `C:\sei\seirmg\src\content-scripts\anotacao_registrar\index.ts`
- Modify: `C:\sei\seirmg\manifest.config.ts`

**Contexto**: porte de `C:\sei\seiplus\cs_modules\anotacao_registrar\atualizarAnotacaoNaArvore.js`. Wiring fino, não coberto por TDD.

- [ ] **Step 1: Criar `src/content-scripts/anotacao_registrar/index.ts`**

```ts
function bootstrap(): void {
  try {
    const botao = document.querySelector('#divInfraBarraComandosSuperior > button')
    if (!botao) return

    botao.addEventListener('click', () => {
      try {
        const iframeArvore = parent.document.getElementById('ifrArvore') as HTMLIFrameElement | null
        iframeArvore?.contentWindow?.location.reload()
      } catch (error) {
        console.error('[SEIRMG] Falha ao atualizar anotação na árvore:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar atualização de anotação na árvore:', error)
  }
}

bootstrap()
```

- [ ] **Step 2: Adicionar o bloco novo em `manifest.config.ts`**

No array `content_scripts`, adicionar (depois do bloco de `procedimento_visualizar`):

```ts
    {
      matches: [
        '*://*.br/*controlador.php?acao=anotacao_registrar*',
        '*://*.org/*controlador.php?acao=anotacao_registrar*',
      ],
      js: ['src/content-scripts/anotacao_registrar/index.ts'],
      run_at: 'document_idle',
    },
```

- [ ] **Step 3: Rodar toda a suíte e o build**

Run: `cd C:\sei\seirmg && bunx vitest run && bun run build`
Expected: todos os testes continuam passando (208), build sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/content-scripts/anotacao_registrar/index.ts manifest.config.ts
git commit -m "feat(anotacao-registrar): wire tree iframe reload on save"
```

---

### Task 6: Checagem final (typecheck/lint/test/build/manifest)

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
Expected: os 4 comandos terminam com código de saída 0. `bun run test` reporta 208 testes, todos passando.

- [ ] **Step 2: Validar o `manifest.json` gerado e confirmar que as permissões não mudaram**

Run: `node -e "const m = JSON.parse(require('fs').readFileSync('dist/manifest.json', 'utf8')); console.log('manifest.json válido'); console.log(JSON.stringify(m.permissions))"`
Expected: `manifest.json válido` seguido de `["storage","notifications","alarms","tabs"]` — exatamente as mesmas permissões de antes.

---

## Self-Review (checklist do autor do plano)

1. **Cobertura da spec**: `ajustarElementosNativos.ts` (Task 1), `alterarTitulo.ts` (Task 2), `anotacao.ts` (Task 3), wiring completo de `procedimento_visualizar` (Task 4) e `anotacao_registrar` (Task 5). Todas as seções da spec têm task correspondente.
2. **Placeholders**: nenhum "TBD"/"TODO"; todo código de teste e implementação está completo e literal.
3. **Consistência de tipos**: `AnotacaoDados` (Task 3) usado identicamente pelo wiring (Task 4). `classificarDivRelacionados`/`extrairTooltipRelacionado` (Task 1) e `montarTituloJanela` (Task 2) consumidos identicamente pelo wiring.
4. **Contagem de testes**: 196 (baseline antes deste plano) + 5 (Task 1) + 1 (Task 2) + 6 (Task 3) = 208 testes esperados ao final da Task 4 em diante.
