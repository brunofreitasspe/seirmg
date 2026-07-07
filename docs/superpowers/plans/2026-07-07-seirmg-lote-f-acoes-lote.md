# SEIRMG — Lote F: Ações em Lote sobre Processos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar `retirarSobrestamentoReabrirEmBloco.js` (tela `controle_unidade_gerar`) e `forcarReaberturaProcesso.js` (tela `documento_receber`) do Sei++.

**⚠️ RISCO DOCUMENTADO**: diferente de todos os lotes anteriores, estas duas features extraem URLs via regex do texto de `<script>` **gerados dinamicamente pelo próprio SEI**, em vez de ler estrutura de tabela/atributos estáveis. Sem uma instância SEI ao vivo, não há como confirmar que essas regexes ainda batem com o HTML/JS que o SEI gera hoje — os testes unitários confirmam que a lógica de extração funciona para o formato documentado no código-fonte original, não que esse formato ainda é válido em produção. Ver `docs/superpowers/specs/2026-07-07-seirmg-lote-f-acoes-lote-design.md` para o racional completo desta decisão (já validada com o usuário: portar mesmo assim, com este aviso explícito).

**Architecture:** Lógica pura testável (as extrações regex/URL) em `features/`, wiring fino não-testado em dois content scripts novos (`controle_unidade_gerar` e `documento_receber`).

**Tech Stack:** TypeScript, Vite, `@crxjs/vite-plugin`, Bun, Vitest — mesma infraestrutura já existente. Nenhuma dependência nova (inclusive: **sem jQuery/jQuery UI**, apesar de disponíveis como dependência do projeto — usa `<dialog>` nativo do HTML5 em vez do `.dialog()` do original).

## Global Constraints

- Nenhuma dependência nova.
- `resolverUrl` usa `new URL(relativa, base).href` (resolução nativa) em vez do `window.location.origin + '/sei/' + linkRelativo` do original (caminho fixo `/sei/`, quebraria em instalações do SEI com outro caminho base) — mesma adaptação já aplicada no Lote E2.
- Sem seleção múltipla (Shift+clique) na tela `controle_unidade_gerar` nesta entrega — o botão funciona sobre qualquer checkbox já marcado, igual ao original.
- `matches` dos dois content scripts novos assumem `acao=controle_unidade_gerar` e `acao=documento_receber` (convenção pasta=ação já usada no projeto) — não verificável sem instância SEI real.
- Todo listener/callback assíncrono novo segue o padrão já estabelecido: guard `try/catch`, loga via `console.error('[SEIRMG] ...', error)`, nunca lança exceção não tratada. Falha numa etapa da cadeia de 4 chamadas marca só aquele processo como erro, sem travar os demais.

---

## Mapa de arquivos (visão geral)

```
seirmg/
├── manifest.config.ts (modificado)
├── src/
│   ├── features/
│   │   ├── controle-processos/reaberturaEmBloco.ts (+ .test.ts, novo)
│   │   └── documento-receber/forcarReabertura.ts (+ .test.ts, novo)
│   └── content-scripts/
│       ├── controle_unidade_gerar/index.ts (novo)
│       └── documento_receber/index.ts (novo)
```

---

### Task 1: `features/controle-processos/reaberturaEmBloco.ts`

**Files:**
- Create: `C:\sei\seirmg\src\features\controle-processos\reaberturaEmBloco.ts`
- Test: `C:\sei\seirmg\src\features\controle-processos\reaberturaEmBloco.test.ts`

**Contexto**: porte das regexes de `C:\sei\seiplus\cs_modules\lib\retirarSobrestamentoReabrirEmBloco.js`. Ver aviso de risco no cabeçalho deste plano — estas regexes assumem um formato específico de `<script>` gerado pelo SEI que não pôde ser verificado contra uma instância real.

**Interfaces:**
- Consumes: nenhuma
- Produces: `extrairHrefArvore(textoScript: string): string | null`; `type AcaoDisponivel = 'sobrestamento' | 'reabrir'`; `detectarAcaoDisponivel(textoScript: string): AcaoDisponivel | null`; `extrairHrefAcao(textoScript: string, acao: AcaoDisponivel): string | null`; `resolverUrl(relativa: string, base: string): string`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/features/controle-processos/reaberturaEmBloco.test.ts
import { describe, expect, it } from 'vitest'
import {
  detectarAcaoDisponivel,
  extrairHrefAcao,
  extrairHrefArvore,
  resolverUrl,
} from './reaberturaEmBloco'

describe('extrairHrefArvore', () => {
  it('extrai a url do nó 0 da árvore do texto do script', () => {
    const texto =
      'Nos[0] = new infraArvoreNo("tipo", "123", null, "controlador.php?acao=arvore_visualizar&id=1")'
    expect(extrairHrefArvore(texto)).toBe('controlador.php?acao=arvore_visualizar&id=1')
  })

  it('retorna null quando o texto não casa com o padrão', () => {
    expect(extrairHrefArvore('texto qualquer')).toBeNull()
  })
})

describe('detectarAcaoDisponivel', () => {
  it('detecta sobrestamento', () => {
    expect(detectarAcaoDisponivel('... Remover Sobrestamento do Processo ...')).toBe('sobrestamento')
  })

  it('detecta reabrir', () => {
    expect(detectarAcaoDisponivel('... Reabrir Processo ...')).toBe('reabrir')
  })

  it('retorna null quando nenhuma ação está disponível', () => {
    expect(detectarAcaoDisponivel('texto qualquer')).toBeNull()
  })
})

describe('extrairHrefAcao', () => {
  it('extrai o href de remover sobrestamento', () => {
    const texto = "location.href = 'controlador.php?acao=procedimento_remover_sobrestamento&id=1'"
    expect(extrairHrefAcao(texto, 'sobrestamento')).toBe(
      'controlador.php?acao=procedimento_remover_sobrestamento&id=1'
    )
  })

  it('extrai o href de reabrir', () => {
    const texto = "location.href = 'controlador.php?acao=procedimento_reabrir&id=1'"
    expect(extrairHrefAcao(texto, 'reabrir')).toBe('controlador.php?acao=procedimento_reabrir&id=1')
  })

  it('retorna null quando o texto não casa com o padrão', () => {
    expect(extrairHrefAcao('texto qualquer', 'reabrir')).toBeNull()
  })
})

describe('resolverUrl', () => {
  it('resolve uma url relativa contra a base', () => {
    expect(resolverUrl('controlador.php?acao=x', 'https://sei.exemplo.br/algum/caminho/')).toBe(
      'https://sei.exemplo.br/algum/caminho/controlador.php?acao=x'
    )
  })

  it('resolve corretamente independente do caminho base', () => {
    expect(
      resolverUrl('controlador.php?acao=x', 'https://outra-instancia.gov.br/outro/caminho/')
    ).toBe('https://outra-instancia.gov.br/outro/caminho/controlador.php?acao=x')
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/features/controle-processos/reaberturaEmBloco.test.ts`
Expected: FAIL — `Cannot find module './reaberturaEmBloco'`

- [ ] **Step 3: Implementar `src/features/controle-processos/reaberturaEmBloco.ts`**

```ts
const REGEX_HREF_ARVORE =
  /Nos\s*\[\s*0\s*\]\s*=\s*new\s*infraArvoreNo\s*\(\s*"\w+"\s*,\s*"\d+"\s*,\s*null,\s*"([^"]+)"/
const REGEX_HREF_SOBRESTAMENTO = /(controlador\.php\?acao=procedimento_remover_sobrestamento[^']+)/
const REGEX_HREF_REABRIR = /(controlador\.php\?acao=procedimento_reabrir[^']+)/

export function extrairHrefArvore(textoScript: string): string | null {
  return textoScript.match(REGEX_HREF_ARVORE)?.[1] ?? null
}

export type AcaoDisponivel = 'sobrestamento' | 'reabrir'

export function detectarAcaoDisponivel(textoScript: string): AcaoDisponivel | null {
  if (textoScript.indexOf('Remover Sobrestamento do Processo') !== -1) return 'sobrestamento'
  if (textoScript.indexOf('Reabrir Processo') !== -1) return 'reabrir'
  return null
}

export function extrairHrefAcao(textoScript: string, acao: AcaoDisponivel): string | null {
  const regex = acao === 'sobrestamento' ? REGEX_HREF_SOBRESTAMENTO : REGEX_HREF_REABRIR
  return textoScript.match(regex)?.[1] ?? null
}

export function resolverUrl(relativa: string, base: string): string {
  return new URL(relativa, base).href
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/features/controle-processos/reaberturaEmBloco.test.ts`
Expected: PASS (10 testes)

- [ ] **Step 5: Commit**

```bash
git add src/features/controle-processos/reaberturaEmBloco.ts src/features/controle-processos/reaberturaEmBloco.test.ts
git commit -m "feat(controle-processos): add bulk reopen regex/URL extraction helpers"
```

---

### Task 2: `features/documento-receber/forcarReabertura.ts`

**Files:**
- Create: `C:\sei\seirmg\src\features\documento-receber\forcarReabertura.ts`
- Test: `C:\sei\seirmg\src\features\documento-receber\forcarReabertura.test.ts`

**Contexto**: porte de `C:\sei\seiplus\cs_modules\documento_receber\forcarReaberturaProcesso.js`. Mesmo aviso de risco do Task 1.

**Interfaces:**
- Consumes: nenhuma
- Produces: `extrairUrlUnidadeSelecionarReabertura(headHtml: string, baseUrl: string): string | null`; `processoFechadoEmTodasUnidades(totalUnidades: number, totalFechadas: number): boolean`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/features/documento-receber/forcarReabertura.test.ts
import { describe, expect, it } from 'vitest'
import { extrairUrlUnidadeSelecionarReabertura, processoFechadoEmTodasUnidades } from './forcarReabertura'

describe('extrairUrlUnidadeSelecionarReabertura', () => {
  const base = 'https://sei.exemplo.br/algum/caminho/'

  it('extrai e resolve a url quando presente no head', () => {
    const head =
      "<script>var x = 'controlador.php?acao=unidade_selecionar_reabertura_processo&id=1';</script>"
    expect(extrairUrlUnidadeSelecionarReabertura(head, base)).toBe(
      'https://sei.exemplo.br/algum/caminho/controlador.php?acao=unidade_selecionar_reabertura_processo&id=1'
    )
  })

  it('retorna null quando o marcador não está presente', () => {
    expect(extrairUrlUnidadeSelecionarReabertura('<script>nada aqui</script>', base)).toBeNull()
  })
})

describe('processoFechadoEmTodasUnidades', () => {
  it('true quando o total de fechadas é igual ao total de unidades', () => {
    expect(processoFechadoEmTodasUnidades(3, 3)).toBe(true)
  })

  it('false quando há unidades abertas', () => {
    expect(processoFechadoEmTodasUnidades(3, 2)).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/features/documento-receber/forcarReabertura.test.ts`
Expected: FAIL — `Cannot find module './forcarReabertura'`

- [ ] **Step 3: Implementar `src/features/documento-receber/forcarReabertura.ts`**

```ts
export function extrairUrlUnidadeSelecionarReabertura(headHtml: string, baseUrl: string): string | null {
  const marcador = 'controlador.php?acao=unidade_selecionar_reabertura_processo'
  const inicio = headHtml.indexOf(marcador)
  if (inicio === -1) return null

  const fim = headHtml.indexOf("'", inicio)
  if (fim === -1) return null

  return new URL(headHtml.substring(inicio, fim), baseUrl).href
}

export function processoFechadoEmTodasUnidades(totalUnidades: number, totalFechadas: number): boolean {
  return totalUnidades === totalFechadas
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/features/documento-receber/forcarReabertura.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add src/features/documento-receber/forcarReabertura.ts src/features/documento-receber/forcarReabertura.test.ts
git commit -m "feat(documento-receber): add force-reopen URL extraction and classification helpers"
```

---

### Task 3: `content-scripts/controle_unidade_gerar/index.ts` + `manifest.config.ts`

**Files:**
- Create: `C:\sei\seirmg\src\content-scripts\controle_unidade_gerar\index.ts`
- Modify: `C:\sei\seirmg\manifest.config.ts`

**Contexto**: wiring fino — conecta DOM + `fetch` à lógica já testada. Não é coberta por TDD, e **"verificado via build" aqui não equivale a "verificado funcionalmente"** — precisa de teste manual numa instância SEI real. Substitui o `.dialog()` do jQuery UI original por um `<dialog>` nativo do HTML5. Substitui a busca de ancestral por profundidade fixa (`.parent().parent()...`, dependente de versão do SEI) por `closest('tr')`, mais robusto a variações de estrutura.

**Interfaces:**
- Consumes: `extrairHrefArvore`, `detectarAcaoDisponivel`, `extrairHrefAcao`, `resolverUrl`, `type AcaoDisponivel` (Task 1); `fetchText` (`../../lib/result`)

- [ ] **Step 1: Criar `src/content-scripts/controle_unidade_gerar/index.ts`**

```ts
import {
  detectarAcaoDisponivel,
  extrairHrefAcao,
  extrairHrefArvore,
  resolverUrl,
} from '../../features/controle-processos/reaberturaEmBloco'
import { fetchText } from '../../lib/result'

const ID_DIALOG = 'seirmg-reabertura-em-bloco-status'

function obterDialogStatus(): HTMLDialogElement {
  const existente = document.getElementById(ID_DIALOG) as HTMLDialogElement | null
  if (existente) return existente

  const dialog = document.createElement('dialog')
  dialog.id = ID_DIALOG
  const textarea = document.createElement('textarea')
  textarea.rows = 20
  textarea.cols = 70
  textarea.disabled = true
  dialog.appendChild(textarea)
  document.body.appendChild(dialog)
  return dialog
}

function imprimirStatus(mensagem: string): void {
  const dialog = obterDialogStatus()
  const textarea = dialog.querySelector('textarea')
  if (!textarea) return
  textarea.value = textarea.value ? `${textarea.value}\n${mensagem}` : mensagem
  textarea.scrollTop = textarea.scrollHeight
}

async function executarProximaEtapa(url: string): Promise<string | null> {
  const resultado = await fetchText(url)
  return resultado.ok ? resultado.data : null
}

function extrairTextoScripts(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return Array.from(doc.querySelectorAll('script'))
    .map((script) => script.textContent ?? '')
    .join('\n')
}

async function reabrirProcesso(numeroProcesso: string, hrefProcesso: string, baseUrl: string): Promise<boolean> {
  imprimirStatus(`${numeroProcesso} (1/4)...`)
  const pagina2 = await executarProximaEtapa(hrefProcesso)
  if (pagina2 === null) {
    imprimirStatus(`${numeroProcesso} (Erro na chamada nº 1)!`)
    return false
  }

  const doc2 = new DOMParser().parseFromString(pagina2, 'text/html')
  const srcArvore = doc2.querySelector('#ifrArvore')?.getAttribute('src')
  if (!srcArvore) {
    imprimirStatus(`${numeroProcesso} (Erro na chamada nº 2)!`)
    return false
  }

  imprimirStatus(`${numeroProcesso} (2/4)...`)
  const pagina3 = await executarProximaEtapa(resolverUrl(srcArvore, baseUrl))
  if (pagina3 === null) {
    imprimirStatus(`${numeroProcesso} (Erro na chamada nº 2)!`)
    return false
  }

  const textoScript3 = extrairTextoScripts(pagina3)
  const acao = detectarAcaoDisponivel(textoScript3)
  if (!acao) {
    imprimirStatus(`${numeroProcesso} (Processo não se encontra sobrestado ou fechado)!`)
    return false
  }

  const hrefPagina4 = extrairHrefArvore(textoScript3)
  if (!hrefPagina4) {
    imprimirStatus(`${numeroProcesso} (Erro na chamada nº 3)!`)
    return false
  }

  imprimirStatus(`${numeroProcesso} (3/4)...`)
  const pagina4 = await executarProximaEtapa(resolverUrl(hrefPagina4, baseUrl))
  if (pagina4 === null) {
    imprimirStatus(`${numeroProcesso} (Erro na chamada nº 3)!`)
    return false
  }

  const hrefFinal = extrairHrefAcao(extrairTextoScripts(pagina4), acao)
  if (!hrefFinal) {
    imprimirStatus(`${numeroProcesso} (Erro na chamada nº 4)!`)
    return false
  }

  imprimirStatus(`${numeroProcesso} (4/4)...`)
  const resultado = await executarProximaEtapa(resolverUrl(hrefFinal, baseUrl))
  if (resultado === null) {
    imprimirStatus(`${numeroProcesso} (Erro na chamada nº 4)!`)
    return false
  }

  imprimirStatus(`${numeroProcesso} (Reaberto com sucesso!)`)
  return true
}

function bootstrap(): void {
  try {
    const barraComandos = document.querySelector('#divInfraBarraComandosSuperior')
    if (!barraComandos) return

    const botao = document.createElement('button')
    botao.type = 'button'
    botao.className = 'infraButton'
    botao.textContent = 'Reabrir Processo'

    botao.addEventListener('click', () => {
      try {
        const checkboxes = Array.from(
          document.querySelectorAll<HTMLInputElement>(
            'input.infraCheckbox:checked, input.infraCheckboxInput:checked'
          )
        )
        const links = checkboxes
          .map((checkbox) =>
            checkbox
              .closest('tr')
              ?.querySelector<HTMLAnchorElement>('a[href*="controlador.php?acao=procedimento_trabalhar"]')
          )
          .filter((link): link is HTMLAnchorElement => link !== null && link !== undefined)

        if (links.length === 0) {
          alert('Nenhum processo para reabrir selecionado.')
          return
        }

        if (!confirm('Confirma a reabertura dos processos selecionados?')) return

        const dialog = obterDialogStatus()
        const textarea = dialog.querySelector('textarea')
        if (textarea) textarea.value = ''
        dialog.showModal()

        const baseUrl = window.location.href
        Promise.all(
          links.map((link) => reabrirProcesso(link.textContent?.trim() ?? '', link.href, baseUrl))
        ).then((resultados) => {
          const sucesso = resultados.filter(Boolean).length
          imprimirStatus(
            `\nExecução finalizada.\nProcessos reabertos: ${sucesso}\nProcessos com erro: ${
              resultados.length - sucesso
            }`
          )
        })
      } catch (error) {
        console.error('[SEIRMG] Falha ao iniciar reabertura em bloco:', error)
      }
    })

    barraComandos.prepend(botao)
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar reabertura em bloco:', error)
  }
}

bootstrap()
```

- [ ] **Step 2: Adicionar o bloco novo em `manifest.config.ts`**

No array `content_scripts`, adicionar (depois do bloco de `ponto_controle`):

```ts
    {
      matches: [
        '*://*.br/*controlador.php?acao=controle_unidade_gerar*',
        '*://*.org/*controlador.php?acao=controle_unidade_gerar*',
      ],
      js: ['src/content-scripts/controle_unidade_gerar/index.ts'],
      run_at: 'document_idle',
    },
```

- [ ] **Step 3: Rodar toda a suíte de testes para confirmar que nada quebrou**

Run: `cd C:\sei\seirmg && bunx vitest run`
Expected: todos os testes continuam passando (196 testes no total — 182 antes deste plano + 10 (Task 1) + 4 (Task 2) = 196)

- [ ] **Step 4: Rodar o build**

Run: `bun run build`
Expected: sucesso, sem erros de tipo. Se houver erro, rode `bun run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/content-scripts/controle_unidade_gerar/index.ts manifest.config.ts
git commit -m "feat(controle-unidade-gerar): wire bulk reopen button with native dialog status"
```

---

### Task 4: `content-scripts/documento_receber/index.ts` + `manifest.config.ts`

**Files:**
- Create: `C:\sei\seirmg\src\content-scripts\documento_receber\index.ts`
- Modify: `C:\sei\seirmg\manifest.config.ts`

**Contexto**: wiring fino, mesmo aviso de risco. **Nota adicional de fidelidade**: o guard inicial do original (`$('#divUnidadesReabertura').css('display') === 'block'`) testa um elemento com o mesmo id que a própria função cria mais adiante — não foi possível confirmar contra uma instância SEI real se esse elemento já existe nativamente na página antes desta função rodar, ou se esse guard efetivamente torna a feature inerte no primeiro carregamento. Esta implementação porta o guard exatamente como está no original, sem tentar reinterpretar essa ambiguidade.

**Interfaces:**
- Consumes: `extrairUrlUnidadeSelecionarReabertura`, `processoFechadoEmTodasUnidades` (Task 2); `fetchText` (`../../lib/result`)

- [ ] **Step 1: Criar `src/content-scripts/documento_receber/index.ts`**

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

- [ ] **Step 2: Adicionar o bloco novo em `manifest.config.ts`**

No array `content_scripts`, adicionar (depois do bloco de `controle_unidade_gerar`):

```ts
    {
      matches: [
        '*://*.br/*controlador.php?acao=documento_receber*',
        '*://*.org/*controlador.php?acao=documento_receber*',
      ],
      js: ['src/content-scripts/documento_receber/index.ts'],
      run_at: 'document_idle',
    },
```

- [ ] **Step 3: Rodar toda a suíte e o build**

Run: `cd C:\sei\seirmg && bunx vitest run && bun run build`
Expected: todos os testes continuam passando (196), build sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/content-scripts/documento_receber/index.ts manifest.config.ts
git commit -m "feat(documento-receber): wire force-reopen warning on documento_receber screen"
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
Expected: os 4 comandos terminam com código de saída 0. `bun run test` reporta 196 testes, todos passando.

- [ ] **Step 2: Validar o `manifest.json` gerado e confirmar que as permissões não mudaram**

Run: `node -e "const m = JSON.parse(require('fs').readFileSync('dist/manifest.json', 'utf8')); console.log('manifest.json válido'); console.log(JSON.stringify(m.permissions))"`
Expected: `manifest.json válido` seguido de `["storage","notifications","alarms","tabs"]` — exatamente as mesmas permissões de antes.

- [ ] **Step 3: Registrar pendência de validação manual**

Este lote **não pode ser considerado funcionalmente confiável** só com base nos 4 comandos acima — as duas features centrais dependem de formato de `<script>` gerado pelo SEI que não foi verificado. Anotar em `docs/ROADMAP-LOTES.md`, na entrada deste lote, que ele precisa de teste manual numa instância SEI real antes de uso em produção.

---

## Self-Review (checklist do autor do plano)

1. **Cobertura da spec**: `reaberturaEmBloco.ts` (Task 1), `forcarReabertura.ts` (Task 2), wiring de `controle_unidade_gerar` com `<dialog>` nativo (Task 3), wiring de `documento_receber` com o guard original preservado (Task 4). Todas as seções da spec têm task correspondente.
2. **Placeholders**: nenhum "TBD"/"TODO"; todo código de teste e implementação está completo e literal. O aviso de risco é conteúdo real (não um placeholder a preencher depois).
3. **Consistência de tipos**: `AcaoDisponivel` (Task 1) usado identicamente pelo wiring de `controle_unidade_gerar` (Task 3). `extrairUrlUnidadeSelecionarReabertura`/`processoFechadoEmTodasUnidades` (Task 2) consumidos identicamente pelo wiring de `documento_receber` (Task 4).
4. **Contagem de testes**: 182 (baseline antes deste plano) + 10 (Task 1) + 4 (Task 2) = 196 testes esperados ao final da Task 3 em diante.
