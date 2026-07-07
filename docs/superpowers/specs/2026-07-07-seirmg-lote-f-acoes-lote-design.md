# SEIRMG — Lote F: Ações em Lote sobre Processos (Design)

> Spec do Lote F do roteiro em `docs/ROADMAP-LOTES.md`. Porta `retirarSobrestamentoReabrirEmBloco.js`, `controle_unidade_gerar/index.js` e `forcarReaberturaProcesso.js` do Sei++.

## ⚠️ Risco documentado

Diferente de todos os lotes anteriores, as duas features principais aqui **não leem estrutura de tabela/atributos estáveis** — elas fazem cadeias de chamadas AJAX e extraem URLs via regex do texto de `<script>` **gerados dinamicamente pelo próprio SEI** (ex.: `Nos[0] = new infraArvoreNo("...", "123", null, "url")`). Sem uma instância SEI ao vivo para confirmar que essas regexes ainda batem com o HTML/JS gerado hoje, **este porte não pode ser verificado além do que os testes unitários das funções de extração conseguem garantir** (que a regex funciona para uma string no formato documentado pelo próprio código original — não que esse formato ainda é o que o SEI gera). Decisão já validada com o usuário: portar mesmo assim, com este aviso explícito no plano e nos comentários de contexto de cada task.

## Arquitetura

Lógica pura testável em `features/`, wiring fino não-testado em dois content scripts novos (`controle_unidade_gerar` e `documento_receber` — nenhum dos dois screens tinha content script SEIRMG antes deste lote).

### `features/controle-processos/reaberturaEmBloco.ts`

Porte das regexes de `C:\sei\seiplus\cs_modules\lib\retirarSobrestamentoReabrirEmBloco.js`:

```ts
export function extrairHrefArvore(textoScript: string): string | null
export type AcaoDisponivel = 'sobrestamento' | 'reabrir'
export function detectarAcaoDisponivel(textoScript: string): AcaoDisponivel | null
export function extrairHrefAcao(textoScript: string, acao: AcaoDisponivel): string | null
export function resolverUrl(relativa: string, base: string): string
```

- `extrairHrefArvore`: porta `regexHrefPage3` — extrai a URL do iframe da árvore do texto do script da página 2.
- `detectarAcaoDisponivel`: porta a checagem `indexOf('Remover Sobrestamento do Processo')`/`indexOf('Reabrir Processo')` do texto do script da página 3 — retorna qual ação está disponível (ou `null` se nenhuma, equivalente ao erro "Processo não se encontra sobrestado ou fechado" do original).
- `extrairHrefAcao`: porta `regexHrefPage4Sobrestado`/`regexHrefPage4Fechado`, escolhendo a regex conforme a ação.
- `resolverUrl`: **adaptação** — o original reconstrói a URL com `window.location.origin + '/sei/' + linkRelativo` (caminho fixo `/sei/`, quebraria em instalações do SEI com outro caminho base). Esta versão usa `new URL(relativa, base).href` (resolução nativa e correta contra a URL real da página), mesmo espírito de adaptação já aplicado no Lote E2.

### `features/documento-receber/forcarReabertura.ts`

Porte de `C:\sei\seiplus\cs_modules\documento_receber\forcarReaberturaProcesso.js`:

```ts
export function extrairUrlUnidadeSelecionarReabertura(headHtml: string, baseUrl: string): string | null
export function processoFechadoEmTodasUnidades(totalUnidades: number, totalFechadas: number): boolean
```

- `extrairUrlUnidadeSelecionarReabertura`: porta a extração `indexOf('controlador.php?acao=unidade_selecionar_reabertura_processo')` até a próxima aspas simples, do HTML do `<head>` — resolvida contra `baseUrl` via `new URL()` (mesma adaptação acima, em vez de `GetBaseUrl()` concatenado manualmente).
- `processoFechadoEmTodasUnidades`: porta a comparação `TUnidades === TUnidFechado` exatamente como está no original (sem guarda adicional para `totalUnidades === 0`, para não divergir do comportamento original sem uma forma de verificar se isso importa na prática).

### Wiring — `content-scripts/controle_unidade_gerar/index.ts` (novo)

**Adaptações**: sem jQuery UI `.dialog()` (nenhum lote até agora usa jQuery, apesar de disponível como dependência) — usa `<dialog>` nativo do HTML5 com um `<textarea>` de status, mesmo efeito visual sem dependência nova. Sem seleção múltipla (Shift+clique) nesta tela — o botão funciona sobre qualquer checkbox já marcado na página (mesmo comportamento do original, que não depende de como os checkboxes foram marcados); adaptar `selecaoMultipla.ts` para a estrutura DOM desta tela nova fica para avaliação futura.

Botão "Reabrir Processo" injetado em `#divInfraBarraComandosSuperior`; ao clicar, para cada checkbox marcado com link `a[href*="controlador.php?acao=procedimento_trabalhar"]`, executa a cadeia de 4 fetches (processo → árvore → detectar ação → executar ação), usando as funções puras acima para cada extração, atualizando o `<dialog>` de status a cada etapa/processo. `matches` assumido: `acao=controle_unidade_gerar` (convenção pasta=ação já usada no projeto — não verificável sem instância SEI real).

### Wiring — `content-scripts/documento_receber/index.ts` (novo)

Porta a lógica condicional do original (guarda `#divUnidadesReabertura` display=block, herdada como está — a interação exata dessa checagem com o DOM nativo do SEI não pôde ser verificada). Busca a URL de unidades via `extrairUrlUnidadeSelecionarReabertura`, conta unidades/fechadas na resposta, e se `processoFechadoEmTodasUnidades`, injeta o aviso e substitui o `onclick` dos botões salvar. `matches` assumido: `acao=documento_receber`.

## Testes

Vitest cobrindo `reaberturaEmBloco.ts` (as 3 extrações regex com fixtures no formato documentado pelo original, `resolverUrl` com bases/relativas variadas) e `forcarReabertura.ts` (extração de URL do head, classificação fechado/não-fechado incluindo limites). Os dois content scripts novos não são cobertos por TDD — **e, diferente dos lotes anteriores, "verificado via build" aqui não é equivalente a "verificado funcionalmente"**; precisam de teste manual numa instância SEI real antes de merecer confiança de produção.

## Tratamento de erros

Mesmo padrão já estabelecido: guard `try/catch`, loga via `console.error('[SEIRMG] ...', error)`, nunca lança. Falha em qualquer etapa da cadeia de 4 chamadas do `controle_unidade_gerar` marca aquele processo específico como erro (sem travar os demais processos selecionados) — mesmo espírito do `removerFinalizar(numeroProcesso, true)` original.

## Fora de escopo

- Seleção múltipla (Shift+clique) em `controle_unidade_gerar` — avaliação futura.
- Sem mudança de permissões no manifest — os `fetch` rodam dentro dos `host_permissions` já concedidos.
