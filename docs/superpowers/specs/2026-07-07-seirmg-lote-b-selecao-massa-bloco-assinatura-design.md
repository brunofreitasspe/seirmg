# SEIRMG — Lote B: Seleção em Massa de Documentos no Bloco de Assinatura (Design)

> Spec do Lote B do roteiro em `docs/ROADMAP-LOTES.md`. Porta `selecionarDocumentosAssinar.js` do Sei++ (`C:\sei\seiplus\cs_modules\rel_bloco_protocolo_listar\selecionarDocumentosAssinar.js`) para o SEIRMG.

## Contexto

O indicador visual do bloco de assinatura (badge consolidado ao lado do logo) já foi entregue em sessões anteriores (`content-scripts/core/badge.ts`, decisão de arquitetura "Indicador de pendência consolidado"). O que resta do escopo original de `verificarBlocoAssinatura.js` + `selecionarDocumentosAssinar.js` é só a seleção em massa: dentro da tela do bloco de assinatura, adicionar botões que marcam/desmarcam checkboxes de documentos de acordo com critérios de assinatura (todos, nenhum, sem qualquer assinatura, sem a assinatura do usuário atual, com a assinatura do usuário atual).

## Arquitetura

Mesmo padrão já usado pelas features de bloco de assinatura e processos novos: lógica pura testável em `features/`, orquestração DOM não-testada (thin wiring) em `content-scripts/`, feature flag em `lib/storage.ts` exposta na aba Geral das opções.

### Lógica pura nova — `src/features/bloco-assinatura/selecaoDocumentos.ts`

```ts
export type TipoSelecaoDocumentos =
  | 'todos'
  | 'nenhum'
  | 'sem-assinatura'
  | 'sem-minha-assinatura'
  | 'com-minha-assinatura'

export function extrairNomeUsuario(tituloUsuario: string): string | null
export function encontrarIndiceColunaAssinaturas(cabecalhos: string[]): number
export function deveSelecionar(
  tipo: TipoSelecaoDocumentos,
  textoAssinaturas: string,
  usuario: string
): boolean
```

- `extrairNomeUsuario`: porta a regex do original — tenta `/(.+)\s-\s/` (formato "NOME COMPLETO - usuário"), depois `/(.+)\s\(.*/` (formato "NOME COMPLETO (usuário/órgão)"), retorna `null` se nenhum casar.
- `encontrarIndiceColunaAssinaturas`: recebe os textos de `<th>` do cabeçalho da tabela, retorna o índice de "Assinaturas"; se não encontrar, retorna `6` (default do original).
- `deveSelecionar`: predicado puro, idêntico à lógica original:
  - `todos` → sempre `true`
  - `nenhum` → sempre `false`
  - `sem-assinatura` → `textoAssinaturas.trim().length === 0`
  - `sem-minha-assinatura` → `!(textoAssinaturas.length > 0 && textoAssinaturas.includes(usuario))`
  - `com-minha-assinatura` → `textoAssinaturas.length > 0 && textoAssinaturas.includes(usuario)`

### Wiring — `src/content-scripts/rel_bloco_protocolo_listar/index.ts` (estendido)

Adiciona uma função `montarSelecaoDocumentos()` chamada uma vez no bootstrap do content script (não a cada disparo do `MutationObserver` já existente, que serve só para o parse/badge):

1. Lê `createSyncConfigStore().get()`; se `featureFlags.selecaoEmMassaBlocoAssinatura === false`, retorna sem fazer nada.
2. Guarda de tela: só prossegue se `document.querySelector('#divInfraBarraLocalizacao')?.textContent` contém `"Bloco de Assinatura"` **e** existe `#btnAssinar` no documento (mesma condição do original).
3. Guarda de idempotência: se `#seirmg-selecao-documentos-assinar` já existe no DOM, retorna (evita duplicar caso o bootstrap rode mais de uma vez).
4. Extrai o nome do usuário via `extrairNomeUsuario(document.querySelector('#lnkUsuarioSistema')?.getAttribute('title') ?? '')`; se `null`, loga erro e retorna (sem quebrar a página, sem UI incompleta).
5. Injeta o container de links (`#seirmg-selecao-documentos-assinar`) dentro de `caption.infraCaption` da tabela (`#divInfraAreaTabela`), com os 5 links: "Todos", "Nenhum", "Sem nenhuma assinatura", "Sem a minha assinatura", "Com a minha assinatura" — mesmos rótulos do original.
6. Um único listener de clique delegado no container. Ao clicar num link:
   - Re-consulta o DOM na hora do clique (`tabela.querySelectorAll('tr > th')` para o índice da coluna, `tabela.querySelectorAll('tbody > tr[id^="trSeq"], tbody > tr[id^="trPos"]')` para as linhas) — não guarda referências do carregamento inicial, mais robusto que o original contra re-render da tabela.
   - Para cada linha, lê o texto da célula de assinaturas no índice encontrado, chama `deveSelecionar(tipo, texto, usuario)`, e usa `checkbox.click()` só se o estado atual for diferente do desejado (mesmo padrão `toggleCheckbox` do original, evita disparar `onchange` à toa).

Todo o bloco de `montarSelecaoDocumentos()` roda dentro de `try/catch`, loga via `console.error('[SEIRMG] ...', error)` e nunca lança — mesmo padrão de todo listener/callback já estabelecido no projeto.

### Feature flag — `src/lib/storage.ts`

```ts
export interface FeatureFlags {
  blocoAssinaturaNotificacoes: boolean
  selecaoEmMassaBlocoAssinatura: boolean
}
```

`DEFAULT_SYNC_CONFIG.featureFlags.selecaoEmMassaBlocoAssinatura = true` (comportamento original era sempre ativo; agora fica ativo por padrão mas desligável).

### Options — aba Geral (`src/options/index.html` + `main.ts`)

Primeira implementação real da aba Geral (hoje só texto placeholder). Mesmo padrão visual/de persistência das abas "Notificações": um checkbox + botão "Salvar" + span de status ("Salvo!" por 2s).

```html
<section id="painel-geral" class="painel ativo">
  <h2>Geral</h2>
  <label>
    <input type="checkbox" id="geral-selecao-massa-ativo" />
    Ativar seleção em massa de documentos no bloco de assinatura
  </label>
  <br />
  <button id="geral-salvar">Salvar</button>
  <span id="geral-status"></span>
</section>
```

`main.ts` ganha uma função `carregarAbaGeral()` (mesmo formato de `carregarAbaAssinatura`/`carregarSecaoProcessosNovos`): lê `createSyncConfigStore().get()`, popula o checkbox a partir de `config.featureFlags.selecaoEmMassaBlocoAssinatura`, salva via `store.set({...config, featureFlags: {...config.featureFlags, selecaoEmMassaBlocoAssinatura: checked}})`. Sem alarme para recriar (não é feature baseada em `chrome.alarms`).

## Testes

Vitest cobrindo as 3 funções puras:

- `extrairNomeUsuario`: formato "NOME - usuário", formato "NOME (usuário/órgão)", string sem nenhum dos dois formatos (retorna `null`), string vazia.
- `encontrarIndiceColunaAssinaturas`: cabeçalho com "Assinaturas" em posição arbitrária, cabeçalho sem "Assinaturas" (retorna default `6`), lista vazia (retorna default `6`).
- `deveSelecionar`: os 5 tipos × (documento sem assinatura nenhuma, documento com assinatura de outro usuário só, documento com assinatura do usuário atual entre outras).

O wiring em `content-scripts/` não é coberto por TDD (mesmo padrão de todo `content-scripts/`/`options/` já existente no projeto) — verificado via build + typecheck + checklist de teste manual.

## Tratamento de erros

- Extração de nome do usuário falha → loga, não injeta UI, não quebra a página (guarda de tela já impede isso de acontecer fora da tela do bloco de assinatura).
- Qualquer exceção dentro de `montarSelecaoDocumentos()` → capturada, logada via `console.error('[SEIRMG] ...', error)`, nunca propaga.

## Fora de escopo

- Não há mudança de manifest (nenhuma permissão nova, nenhum content script novo — extensão do já existente).
- Não há mudança no fluxo de badge/notificação/background já entregues.
- Estilização dos links reaproveita CSS inline simples (mesmo padrão de `badge.ts`), sem folha de estilo nova.
