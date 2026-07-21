# SEIRMG — Exportar/Importar Favoritos (JSON) + Exportar CSV — Design

> Início do Lote N (`docs/ROADMAP-LOTES.md`), escopo restrito por pedido do usuário: só export/import de
> Favoritos (JSON próprio do SEIRMG, ida e volta) + export de Favoritos em CSV. O resto do Lote N original
> (Kanban na home, marcar não visualizado/urgente, upload múltiplo na home) fica pra uma conversa futura.

## Contexto

O usuário pediu inicialmente "uma função de exportar CSV e uma de subir CSV com os favoritos do Sei Pro
pra nossa extensão". Investigação do código-fonte real do Sei Pro (`seipro/dist/js/sei-pro-favoritos.js`,
`sei-functions-pro.js`) encontrou duas exportações diferentes lá, nenhuma diretamente reaproveitável:

- **"Baixar Favoritos"** (`downloadLocalFilePro`): exporta **JSON** (não CSV) — o backup/restauração completo
  (etiquetas, mapas, categorias, prazo avançado), reimportável só de volta pro próprio Sei Pro
  (`loadLocalFilePro`).
- **Ícone de download da tabela** (`downloadTablePro`/`downloadTableCSV`): exporta **CSV** (`;`-separado, sem
  nenhum escape de campo), mas é texto puro renderizado na tela — colunas como "Mapa" ficam vazias (é um
  botão, sem texto) — e o Sei Pro **não tem importador desse CSV de volta**, só do JSON.

Decisão do usuário após essa investigação: abandonar a ideia de importar o CSV/JSON do Sei Pro (mapeamento de
colunas incerto, dado com perda). Em vez disso, replicar o padrão já usado e validado no Painel de Tarefas
(`features/tarefas/exportar.ts` + wiring em `content-scripts/tarefas/index.ts`) — export/import num formato
JSON **próprio do SEIRMG**, e um export CSV **só de saída** (visualização em planilha, não precisa voltar).

## Decisões

- **JSON (ida e volta):** `montarExportacaoFavoritos`/`parseImportacaoFavoritos`/
  `favoritosImportadosParaAdicionar` — mesmo formato de função de `features/tarefas/exportar.ts`, adaptado.
- **Campos exportados:** `numero`, `link`, `adicionadoEm`, `especificacao`, **e `ultimoSnapshot`** (prazo/
  marcadores/atribuição congelados, feature entregue nesta mesma sessão). Incluir o snapshot é deliberado:
  sem ele, um favorito fechado restaurado num navegador novo apareceria vazio até o processo abrir de novo —
  o que pode nunca acontecer, já que "fechado" tende a ser definitivo.
- **Deduplicação na importação:** favoritos cujo `numero` já existe na lista atual são **ignorados** (não
  sobrescrevem, não duplicam linha no painel). O resultado da importação informa quantos foram adicionados e
  quantos foram ignorados por já existir.
- **CSV (só exportação):** em vez de reconstruir os dados do zero, lê direto a `<table>` que o painel de
  Favoritos já renderiza na tela — mesma técnica que o próprio Sei Pro usa (`downloadTableCSV`: pega texto de
  `<th>`/`<td>`). Isso garante que o CSV bate exatamente com o que está na tela, incluindo linhas com dado
  congelado, sem duplicar a lógica de extração de dados que a Task de renderização já tem.
- **Escape de CSV:** diferente do Sei Pro (que não escapa nada — um `;` dentro de uma especificação quebraria
  as colunas), campos com `;`, aspas ou quebra de linha são envolvidos em aspas duplas (com aspas internas
  dobradas), formato CSV padrão. Especificação é texto livre digitado pelo usuário no SEI — pode conter `;`.
- **Células com múltiplas linhas** (ex. Prazo: data numa linha, dias restantes noutra): concatenar o texto dos
  elementos filhos diretos da célula com um espaço entre eles, em vez de `textContent` cru (que gruda o texto
  sem separador, ex. `"15/08/2026Vence em 25 dias"`).
- **UI:** três botões de ícone no cabeçalho do painel "★ Favoritos" (`download`/`upload`/`file-spreadsheet`,
  `lucide-static`), mesmo padrão visual dos botões de Exportar/Importar do Painel de Tarefas. Import usa um
  `<input type="file" accept="application/json">` oculto, mesmo padrão.

## Arquitetura

### `src/features/controle-processos/favoritosExportar.ts` (novo)

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

export function montarExportacaoFavoritos(itens: FavoritoProcesso[], versaoSeirmg: string, agora: Date): ExportacaoFavoritos
export function parseImportacaoFavoritos(json: string): ExportacaoFavoritos | null
export function favoritosImportadosParaAdicionar(exportacao: ExportacaoFavoritos, itensAtuais: FavoritoProcesso[]): FavoritoProcesso[]

export function escaparCampoCsv(valor: string): string
export function montarLinhaCsv(campos: string[]): string
```

- `montarExportacaoFavoritos`: mesmo formato de `montarExportacao` (tarefas) — projeta só os campos
  exportáveis (via desestruturação, igual ao `Pick` da tarefa).
- `parseImportacaoFavoritos`: mesma validação estrutural de `parseImportacao` (tarefas) — JSON válido +
  `favoritos` é array; retorna `null` em qualquer outro caso (não valida o formato interno de cada item, mesmo
  nível de rigor já aceito pra tarefas).
- `favoritosImportadosParaAdicionar`: recebe a lista atual (pra deduplicar por `numero`) e retorna só os itens
  **novos** a adicionar — diferente de `tarefasImportadasParaAdicionar` (que sempre adiciona tudo, gerando id
  novo), porque favoritos têm chave natural (`numero`) e duplicar geraria uma segunda linha pro mesmo processo
  no painel.
- `escaparCampoCsv`/`montarLinhaCsv`: helpers puros de formatação CSV (`;` delimitador, aspas quando
  necessário), usados tanto pelo cabeçalho quanto pelas linhas de dado.

### `src/content-scripts/procedimento_controlar/index.ts` (modificado)

Novos imports: `downloadIconSvg`, `uploadIconSvg`, `fileSpreadsheetIconSvg` de `lucide-static` (nenhum dos três
está importado neste arquivo hoje) e as seis funções novas de `favoritosExportar.ts`.

`renderizarPainelFavoritos` ganha, no lugar do `<div class="seirmg-favoritos-painel-titulo">` atual (só
texto), uma versão com os três botões:

```ts
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

function criarBotaoIconeFavoritos(titulo: string, iconeSvg: string): HTMLButtonElement {
  const botao = document.createElement('button')
  botao.type = 'button'
  botao.className = 'seirmg-favoritos-btn-icone'
  botao.title = titulo
  botao.innerHTML = iconeSvg
  return botao
}
```

`renderizarPainelFavoritos` troca a construção atual do título (linhas com `titulo.textContent = ...`) por
`painel.appendChild(montarCabecalhoPainelFavoritos())`.

```ts
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
      `${novos.length} favorito(s) importado(s).` + (ignorados > 0 ? ` ${ignorados} já existia(m) e foi(ram) ignorado(s).` : '')
    )
  }
  leitor.readAsText(arquivo)
}

function textoCelulaParaCsv(celula: HTMLTableCellElement): string {
  const filhos = Array.from(celula.children)
  if (filhos.length === 0) return celula.textContent?.trim() ?? ''
  return filhos.map((filho) => filho.textContent?.trim() ?? '').filter(Boolean).join(' ')
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
```

`persistirFavoritosAtualizados` já existe (feature de snapshot congelado, entregue nesta mesma sessão) e já
faz exatamente o read-modify-write necessário — reaproveitado sem mudança.

### `src/content-scripts/core/theme.css` (modificado)

Novo bloco CSS pro cabeçalho do painel com os botões:

```css
.seirmg-favoritos-painel-titulo {
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

(cores derivadas do amarelo já usado em `.seirmg-favoritos-painel-titulo` hoje — `#fff4e0`/`#f0d9a0` — em vez
de inventar uma paleta nova pra esses botões).

## Fora de escopo

- Importar o CSV/JSON gerado pelo próprio Sei Pro (decisão do usuário após a investigação acima).
- Etiquetas, mapas, categorias — não existem no modelo de dados do SEIRMG ainda (Lote L avançado).
- Resto do Lote N (Kanban na home, marcar não visualizado/urgente, upload múltiplo).

## Testes

`favoritosExportar.test.ts` (novo, mesmo nível de cobertura de `tarefas/exportar.test.ts`):
`montarExportacaoFavoritos` (projeta só os campos certos, inclui `ultimoSnapshot` quando presente, `undefined`
quando ausente), `parseImportacaoFavoritos` (JSON válido, sintaxe inválida, campo `favoritos` ausente/não-array),
`favoritosImportadosParaAdicionar` (ignora número já existente, mantém novos, lista toda nova quando não há
sobreposição), `escaparCampoCsv` (sem caractere especial, com `;`, com aspas — dobra a aspas interna, com
quebra de linha), `montarLinhaCsv` (junta campos com `;`, aplica escape em cada um).

Wiring em `procedimento_controlar/index.ts` (botões, leitura de arquivo, raspagem da tabela pro CSV) sem teste
automatizado, mesmo padrão já estabelecido no arquivo — verificado via `tsc --noEmit`/`bun run test`/
`bun run build` e depois validação manual numa instância SEI real: exportar JSON com favoritos existentes,
importar esse mesmo arquivo de volta (confirmar que tudo é ignorado por já existir), importar num perfil/
navegador sem nenhum favorito (confirmar que tudo é adicionado, incluindo prazo/marcadores/atribuição
congelados de um favorito fechado), exportar CSV e abrir no Excel/planilha (conferir que os `;` dentro de uma
especificação não quebram as colunas).
