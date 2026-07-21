# SEIRMG — Exportar/Importar Favoritos (JSON) + Exportar CSV — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O painel "★ Favoritos" ganha três botões — exportar em JSON (backup/restauração, formato próprio do SEIRMG), importar esse JSON de volta, e exportar em CSV (só leitura, pra planilha).

**Architecture:** Três funções puras e testáveis num arquivo novo (`favoritosExportar.ts`, mesmo padrão de `features/tarefas/exportar.ts`) cuidam de montar/validar o JSON e decidir quais itens importados são novos (deduplicação por número de processo); mais dois helpers puros de formatação CSV. O wiring de DOM (botões, leitura de arquivo, raspagem da tabela já renderizada pro CSV) fica em `procedimento_controlar/index.ts`, sem teste automatizado — mesmo padrão já usado no resto desse arquivo.

**Tech Stack:** TypeScript, Vitest, `lucide-static`, `Blob`/`URL.createObjectURL` (mesmo padrão de download já usado em `content-scripts/tarefas/index.ts`).

## Global Constraints

- Formato de exportação é **próprio do SEIRMG** — não tenta ler nem gerar o CSV/JSON do Sei Pro (decisão do usuário, ver spec).
- Importação **ignora** (não sobrescreve, não duplica) favoritos cujo `numero` já existe na lista atual.
- CSV usa `;` como delimitador e escapa campos com `;`, aspas ou quebra de linha (aspas duplas, aspas internas dobradas) — diferente do Sei Pro, que não escapa nada.
- Exportação JSON inclui `ultimoSnapshot` (prazo/marcadores/atribuição congelados) — sem isso, um favorito fechado restaurado noutro navegador ficaria vazio até (talvez nunca) abrir de novo.
- Export CSV lê a `<table>` já renderizada na tela (não reconstrói os dados) — mesma técnica usada pelo Sei Pro.

Spec completa: `docs/superpowers/specs/2026-07-21-seirmg-favoritos-export-import-design.md`

---

### Task 1: `favoritosExportar.ts` — funções puras de export/import JSON + formatação CSV

**Files:**
- Create: `src/features/controle-processos/favoritosExportar.ts`
- Test: `src/features/controle-processos/favoritosExportar.test.ts`

**Interfaces:**
- Consumes: `FavoritoProcesso`, `SnapshotFavorito` (`../../lib/storage`, já existem).
- Produces: `FavoritoExportado`, `ExportacaoFavoritos`, `montarExportacaoFavoritos(itens: FavoritoProcesso[], versaoSeirmg: string, agora: Date): ExportacaoFavoritos`, `parseImportacaoFavoritos(json: string): ExportacaoFavoritos | null`, `favoritosImportadosParaAdicionar(exportacao: ExportacaoFavoritos, itensAtuais: FavoritoProcesso[]): FavoritoProcesso[]`, `escaparCampoCsv(valor: string): string`, `montarLinhaCsv(campos: string[]): string` — todas usadas pela Task 3.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/features/controle-processos/favoritosExportar.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  escaparCampoCsv,
  favoritosImportadosParaAdicionar,
  montarExportacaoFavoritos,
  montarLinhaCsv,
  parseImportacaoFavoritos,
} from './favoritosExportar'
import type { FavoritoProcesso, SnapshotFavorito } from '../../lib/storage'

const snapshot: SnapshotFavorito = {
  prazoDataTexto: '15/08/2026',
  atribuicao: 'joao.silva',
  marcadoresNomes: ['Urgente'],
}

const favorito: FavoritoProcesso = {
  numero: 'HMMG.2026.00123-4',
  link: 'controlador.php?acao=x',
  adicionadoEm: '2026-07-01T10:00:00.000Z',
  especificacao: 'Aquisição de equipamentos',
  ultimoSnapshot: snapshot,
}

describe('montarExportacaoFavoritos', () => {
  it('monta o objeto de exportação com só os campos relevantes, incluindo ultimoSnapshot', () => {
    const agora = new Date('2026-07-21T10:00:00.000Z')
    const exportacao = montarExportacaoFavoritos([favorito], '5.0', agora)

    expect(exportacao).toEqual({
      versaoSeirmg: '5.0',
      exportadoEm: '2026-07-21T10:00:00.000Z',
      favoritos: [
        {
          numero: 'HMMG.2026.00123-4',
          link: 'controlador.php?acao=x',
          adicionadoEm: '2026-07-01T10:00:00.000Z',
          especificacao: 'Aquisição de equipamentos',
          ultimoSnapshot: snapshot,
        },
      ],
    })
  })

  it('mantém ultimoSnapshot undefined quando o favorito não tem', () => {
    const semSnapshot: FavoritoProcesso = { numero: 'HMMG.1', link: null, adicionadoEm: '2026-07-01T10:00:00.000Z' }
    const exportacao = montarExportacaoFavoritos([semSnapshot], '5.0', new Date('2026-07-21T10:00:00.000Z'))
    expect(exportacao.favoritos[0].ultimoSnapshot).toBeUndefined()
  })
})

describe('parseImportacaoFavoritos', () => {
  it('faz parse de um JSON válido', () => {
    const json = JSON.stringify({
      versaoSeirmg: '5.0',
      exportadoEm: '2026-07-21T10:00:00.000Z',
      favoritos: [favorito],
    })
    expect(parseImportacaoFavoritos(json)).toEqual({
      versaoSeirmg: '5.0',
      exportadoEm: '2026-07-21T10:00:00.000Z',
      favoritos: [favorito],
    })
  })

  it('retorna null pra JSON inválido (sintaxe)', () => {
    expect(parseImportacaoFavoritos('{ isso não é json')).toBeNull()
  })

  it('retorna null quando falta o campo favoritos', () => {
    expect(parseImportacaoFavoritos(JSON.stringify({ versaoSeirmg: '5.0' }))).toBeNull()
  })

  it('retorna null quando favoritos não é um array', () => {
    expect(parseImportacaoFavoritos(JSON.stringify({ favoritos: 'não é array' }))).toBeNull()
  })
})

describe('favoritosImportadosParaAdicionar', () => {
  const exportacao = (favoritos: FavoritoProcesso[]) => ({
    versaoSeirmg: '5.0',
    exportadoEm: '2026-07-21T10:00:00.000Z',
    favoritos,
  })

  it('retorna todos quando nenhum já existe', () => {
    const resultado = favoritosImportadosParaAdicionar(exportacao([favorito]), [])
    expect(resultado).toEqual([favorito])
  })

  it('ignora favoritos cujo número já existe na lista atual', () => {
    const existente: FavoritoProcesso = { numero: 'HMMG.2026.00123-4', link: null, adicionadoEm: '2026-01-01T00:00:00.000Z' }
    const resultado = favoritosImportadosParaAdicionar(exportacao([favorito]), [existente])
    expect(resultado).toEqual([])
  })

  it('mistura: só retorna os que ainda não existem', () => {
    const outro: FavoritoProcesso = { numero: 'HMMG.9', link: null, adicionadoEm: '2026-07-01T10:00:00.000Z' }
    const existente: FavoritoProcesso = { numero: 'HMMG.2026.00123-4', link: null, adicionadoEm: '2026-01-01T00:00:00.000Z' }
    const resultado = favoritosImportadosParaAdicionar(exportacao([favorito, outro]), [existente])
    expect(resultado).toEqual([outro])
  })
})

describe('escaparCampoCsv', () => {
  it('não mexe em texto sem caractere especial', () => {
    expect(escaparCampoCsv('HMMG.2026.00123-4')).toBe('HMMG.2026.00123-4')
  })

  it('envolve em aspas quando tem ponto-e-vírgula', () => {
    expect(escaparCampoCsv('a; b')).toBe('"a; b"')
  })

  it('envolve em aspas e dobra aspas internas', () => {
    expect(escaparCampoCsv('disse "oi"')).toBe('"disse ""oi"""')
  })

  it('envolve em aspas quando tem quebra de linha', () => {
    expect(escaparCampoCsv('linha1\nlinha2')).toBe('"linha1\nlinha2"')
  })
})

describe('montarLinhaCsv', () => {
  it('junta campos com ponto-e-vírgula', () => {
    expect(montarLinhaCsv(['a', 'b', 'c'])).toBe('a;b;c')
  })

  it('aplica escape em cada campo', () => {
    expect(montarLinhaCsv(['a;b', 'c'])).toBe('"a;b";c')
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bun run test src/features/controle-processos/favoritosExportar.test.ts`
Expected: FAIL — arquivo `./favoritosExportar` não existe.

- [ ] **Step 3: Implementar**

Criar `src/features/controle-processos/favoritosExportar.ts`:

```ts
import type { FavoritoProcesso } from '../../lib/storage'

export type FavoritoExportado = Pick<
  FavoritoProcesso,
  'numero' | 'link' | 'adicionadoEm' | 'especificacao' | 'ultimoSnapshot'
>

export interface ExportacaoFavoritos {
  versaoSeirmg: string
  exportadoEm: string
  favoritos: FavoritoExportado[]
}

export function montarExportacaoFavoritos(
  itens: FavoritoProcesso[],
  versaoSeirmg: string,
  agora: Date
): ExportacaoFavoritos {
  return {
    versaoSeirmg,
    exportadoEm: agora.toISOString(),
    favoritos: itens.map(({ numero, link, adicionadoEm, especificacao, ultimoSnapshot }) => ({
      numero,
      link,
      adicionadoEm,
      especificacao,
      ultimoSnapshot,
    })),
  }
}

export function parseImportacaoFavoritos(json: string): ExportacaoFavoritos | null {
  try {
    const dados: unknown = JSON.parse(json)
    if (
      typeof dados !== 'object' ||
      dados === null ||
      !Array.isArray((dados as { favoritos?: unknown }).favoritos)
    ) {
      return null
    }
    return dados as ExportacaoFavoritos
  } catch {
    return null
  }
}

export function favoritosImportadosParaAdicionar(
  exportacao: ExportacaoFavoritos,
  itensAtuais: FavoritoProcesso[]
): FavoritoProcesso[] {
  const numerosAtuais = new Set(itensAtuais.map((item) => item.numero))
  return exportacao.favoritos.filter((favorito) => !numerosAtuais.has(favorito.numero))
}

export function escaparCampoCsv(valor: string): string {
  if (/[;"\r\n]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`
  }
  return valor
}

export function montarLinhaCsv(campos: string[]): string {
  return campos.map(escaparCampoCsv).join(';')
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bun run test src/features/controle-processos/favoritosExportar.test.ts`
Expected: PASS (todos os testes).

- [ ] **Step 5: Commit**

```bash
git add src/features/controle-processos/favoritosExportar.ts src/features/controle-processos/favoritosExportar.test.ts
git commit -m "feat: helpers puros de export/import JSON e formatação CSV de favoritos"
```

---

### Task 2: CSS dos botões do cabeçalho do painel

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/index.ts:154-160` (bloco `.seirmg-favoritos-painel-titulo` dentro de `ESTILO_FILTROS_E_ESPECIFICACAO`)

**Interfaces:**
- Produces: classes CSS `.seirmg-favoritos-painel-acoes`, `.seirmg-favoritos-btn-icone` — consumidas pela Task 3.

- [ ] **Step 1: Substituir o bloco `.seirmg-favoritos-painel-titulo`**

Substituir (linhas 154-160):

```css
  .seirmg-favoritos-painel-titulo {
    font-weight: bold;
    padding: 6px 10px;
    background: #fff4e0;
    border: 1px solid #f0d9a0;
    border-bottom: none;
  }
```

por:

```css
  .seirmg-favoritos-painel-titulo {
    font-weight: bold;
    padding: 6px 10px;
    background: #fff4e0;
    border: 1px solid #f0d9a0;
    border-bottom: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .seirmg-favoritos-painel-acoes {
    display: flex;
    gap: 4px;
  }
  .seirmg-favoritos-btn-icone {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid #f0d9a0;
    border-radius: 4px;
    background: #fff;
    color: #8a6d1f;
    cursor: pointer;
  }
  .seirmg-favoritos-btn-icone:hover {
    background: #fff4e0;
  }
  .seirmg-favoritos-btn-icone svg {
    width: 13px;
    height: 13px;
  }
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: sem erros (mudança é só dentro de uma template string CSS, não afeta tipos).

- [ ] **Step 3: Commit**

```bash
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "feat: CSS dos botões de exportar/importar no cabeçalho do painel de Favoritos"
```

---

### Task 3: Botões e wiring no painel de Favoritos

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/index.ts`

**Interfaces:**
- Consumes: `montarExportacaoFavoritos`, `parseImportacaoFavoritos`, `favoritosImportadosParaAdicionar`, `montarLinhaCsv` (Task 1, `../../features/controle-processos/favoritosExportar`); classes CSS `.seirmg-favoritos-painel-acoes`/`.seirmg-favoritos-btn-icone` (Task 2); ícones `lucide-static/icons/{download,upload,file-spreadsheet}.svg?raw`; `persistirFavoritosAtualizados`, `aplicarFiltroFavoritoEmTodasAsTabelas`, `atualizarTodasAsEstrelas` (já existem no arquivo).
- Produces: nenhuma outra parte do código importa deste arquivo (content script raiz).

- [ ] **Step 1: Importar os novos símbolos**

No topo de `src/content-scripts/procedimento_controlar/index.ts`, adicionar ao import de
`../../features/controle-processos/favoritos` (linhas 70-75) o import de `favoritosExportar`:

```ts
import {
  extrairFavoritoDaLinha,
  calcularOcultacaoPorFavorito,
  ordenarFavoritosPorData,
  atualizarSnapshotsFavoritos,
} from '../../features/controle-processos/favoritos'
import {
  montarExportacaoFavoritos,
  parseImportacaoFavoritos,
  favoritosImportadosParaAdicionar,
  montarLinhaCsv,
} from '../../features/controle-processos/favoritosExportar'
```

Adicionar os três ícones novos, junto aos outros ícones lucide já importados (depois da linha 82,
`import bookmarkPlusIconSvg ...`):

```ts
import downloadIconSvg from 'lucide-static/icons/download.svg?raw'
import uploadIconSvg from 'lucide-static/icons/upload.svg?raw'
import fileSpreadsheetIconSvg from 'lucide-static/icons/file-spreadsheet.svg?raw'
```

- [ ] **Step 2: Adicionar as funções de cabeçalho, export e import**

Adicionar logo antes de `function renderizarPainelFavoritos(): void {` (linha 1104):

```ts
function criarBotaoIconeFavoritos(titulo: string, iconeSvg: string): HTMLButtonElement {
  const botao = document.createElement('button')
  botao.type = 'button'
  botao.className = 'seirmg-favoritos-btn-icone'
  botao.title = titulo
  botao.innerHTML = iconeSvg
  return botao
}

function textoCelulaParaCsv(celula: HTMLTableCellElement): string {
  const filhos = Array.from(celula.children)
  if (filhos.length === 0) return celula.textContent?.trim() ?? ''
  return filhos
    .map((filho) => filho.textContent?.trim() ?? '')
    .filter(Boolean)
    .join(' ')
}

function exportarFavoritosJson(): void {
  const exportacao = montarExportacaoFavoritos(itensFavoritados, chrome.runtime.getManifest().version, new Date())
  const blob = new Blob([JSON.stringify(exportacao, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'favoritos-seirmg.json'
  link.click()
  URL.revokeObjectURL(url)
}

function importarFavoritosJson(arquivo: File): void {
  const leitor = new FileReader()
  leitor.onload = (evento) => {
    const conteudo = evento.target?.result
    if (typeof conteudo !== 'string') return

    const exportacao = parseImportacaoFavoritos(conteudo)
    if (!exportacao) {
      window.alert('Arquivo inválido.')
      return
    }

    const novos = favoritosImportadosParaAdicionar(exportacao, itensFavoritados)
    const ignorados = exportacao.favoritos.length - novos.length
    itensFavoritados = [...itensFavoritados, ...novos]
    persistirFavoritosAtualizados()
    aplicarFiltroFavoritoEmTodasAsTabelas()
    atualizarTodasAsEstrelas()
    renderizarPainelFavoritos()
    window.alert(
      `${novos.length} favorito(s) importado(s).` +
        (ignorados > 0 ? ` ${ignorados} já existia(m) e foi(ram) ignorado(s).` : '')
    )
  }
  leitor.readAsText(arquivo)
}

function exportarFavoritosCsv(): void {
  const tabela = document.querySelector<HTMLTableElement>('#seirmg-favoritos-painel table')
  if (!tabela) return

  const cabecalhos = Array.from(tabela.querySelectorAll('thead th')).map((th) => th.textContent?.trim() ?? '')
  const linhas = [montarLinhaCsv(cabecalhos)]
  tabela.querySelectorAll('tbody tr').forEach((tr) => {
    const celulas = Array.from(tr.querySelectorAll('td')).map((td) => textoCelulaParaCsv(td as HTMLTableCellElement))
    linhas.push(montarLinhaCsv(celulas))
  })

  const blob = new Blob(['﻿', linhas.join('\r\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'favoritos-seirmg.csv'
  link.click()
  URL.revokeObjectURL(url)
}

function montarCabecalhoPainelFavoritos(): HTMLDivElement {
  const cabecalho = document.createElement('div')
  cabecalho.className = 'seirmg-favoritos-painel-titulo'

  const titulo = document.createElement('span')
  titulo.textContent = `★ Favoritos (${itensFavoritados.length} registro${itensFavoritados.length === 1 ? '' : 's'})`

  const acoes = document.createElement('div')
  acoes.className = 'seirmg-favoritos-painel-acoes'

  const btnExportarJson = criarBotaoIconeFavoritos('Exportar favoritos (JSON)', downloadIconSvg)
  const btnImportarJson = criarBotaoIconeFavoritos('Importar favoritos (JSON)', uploadIconSvg)
  const btnExportarCsv = criarBotaoIconeFavoritos('Exportar favoritos (CSV)', fileSpreadsheetIconSvg)

  const inputImportar = document.createElement('input')
  inputImportar.type = 'file'
  inputImportar.accept = 'application/json'
  inputImportar.style.display = 'none'

  btnExportarJson.addEventListener('click', exportarFavoritosJson)
  btnExportarCsv.addEventListener('click', exportarFavoritosCsv)
  btnImportarJson.addEventListener('click', () => inputImportar.click())
  inputImportar.addEventListener('change', () => {
    const arquivo = inputImportar.files?.[0]
    if (arquivo) importarFavoritosJson(arquivo)
    inputImportar.value = ''
  })

  acoes.append(btnExportarJson, btnImportarJson, btnExportarCsv, inputImportar)
  cabecalho.append(titulo, acoes)
  return cabecalho
}
```

- [ ] **Step 3: Trocar a construção do título dentro de `renderizarPainelFavoritos`**

Substituir (linhas 1117-1120):

```ts
    const titulo = document.createElement('div')
    titulo.className = 'seirmg-favoritos-painel-titulo'
    titulo.textContent = `★ Favoritos (${itensFavoritados.length} registro${itensFavoritados.length === 1 ? '' : 's'})`
    painel.appendChild(titulo)
```

por:

```ts
    painel.appendChild(montarCabecalhoPainelFavoritos())
```

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: sem erros.

- [ ] **Step 5: Rodar a suíte de testes completa**

Run: `bun run test`
Expected: PASS (inclui os testes da Task 1).

- [ ] **Step 6: Build**

Run: `bun run build`
Expected: build termina sem erro.

- [ ] **Step 7: Commit**

```bash
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "feat: botões de exportar/importar (JSON) e exportar CSV no painel de Favoritos"
```

- [ ] **Step 8: Validação manual numa instância SEI real**

Carregar a extensão atualizada (`bun run build` + recarregar em `chrome://extensions`) e verificar, numa
página de Controle de Processos com o painel de Favoritos ativo e pelo menos 2 favoritos (um aberto, um
fechado):

1. Clicar no ícone de download (JSON) → confirmar que baixa `favoritos-seirmg.json` com todos os favoritos,
   incluindo `ultimoSnapshot` no favorito fechado.
2. Clicar no ícone de upload, selecionar esse mesmo arquivo → confirmar o alerta "0 favorito(s) importado(s).
   N já existia(m) e foi(ram) ignorado(s)." (todos já existem).
3. Editar manualmente o JSON baixado (mudar o `numero` de um item pra um valor que não existe na lista atual)
   e importar de novo → confirmar que aparece 1 nova linha no painel, com os dados do `ultimoSnapshot`
   preservados se o processo estiver fechado.
4. Clicar no ícone de planilha (CSV) → confirmar que baixa `favoritos-seirmg.csv` e abre corretamente no
   Excel/planilha (colunas alinhadas, sem texto grudado tipo "15/08/2026Vence em X dias").
5. Se algum favorito tiver `;` na especificação, confirmar que a coluna não quebra ao abrir o CSV.

---

## Self-Review

**Cobertura da spec:** export JSON com `ultimoSnapshot` incluído (Task 1 + 3), import com deduplicação por
`numero` (Task 1 + 3), export CSV lendo a tabela já renderizada com escape de campo e concatenação de células
multi-linha (Task 1 + 3), três botões de ícone no cabeçalho do painel (Task 2 + 3), sem tentar ler/gerar
formatos do Sei Pro (nenhuma task faz isso) — toda a spec de 2026-07-21 (export/import) está coberta.

**Placeholders:** nenhum "TBD"/"implementar depois" — todos os steps têm código completo.

**Consistência de tipos:** `ExportacaoFavoritos`/`FavoritoExportado` (Task 1) usados de forma idêntica em
`montarExportacaoFavoritos`/`parseImportacaoFavoritos`/`favoritosImportadosParaAdicionar` e nas três chamadas
correspondentes na Task 3 (`exportarFavoritosJson`/`importarFavoritosJson`); `montarLinhaCsv`/`escaparCampoCsv`
(Task 1) com a mesma assinatura usada em `exportarFavoritosCsv` (Task 3); classes CSS
`seirmg-favoritos-painel-acoes`/`seirmg-favoritos-btn-icone` definidas na Task 2 usadas com o mesmo nome em
`montarCabecalhoPainelFavoritos` (Task 3).
