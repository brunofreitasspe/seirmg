# SEIRMG — Lote G: Visualização de Processo — Ajustes Nativos, Título e Anotação (Design)

> Spec do Lote G (escopo reduzido) do roteiro em `docs/ROADMAP-LOTES.md`. Porta `ajustarElementosNativos.js`, `alterarTitulo.js`, `mostrarAnotacao.js` e `atualizarAnotacaoNaArvore.js` do Sei++ — as 4 features de `procedimento_visualizar`/`anotacao_registrar` com estrutura de DOM estável (IDs/atributos fixos, sem regex sobre `<script>` gerado dinamicamente).

## Contexto

Investigação nesta sessão encontrou que a maioria das features de `procedimento_visualizar/` (`consultarInteressado`, `consultarAtribuicao`, `documentoModelo`, `dropzone`, `abrirDocumentoNovaAba`, `copiarLinkInterno`, `copiarNumeroProcessoDocumento`) depende de regex sobre texto de `<script>` gerado dinamicamente pelo SEI ou de APIs JS nativas não documentadas (`objArvore.getNo()`) — mesmo padrão de risco do Lote F, em escala maior (`dropzone.js` reconstrói ~25 campos de um formulário POST nativo). Essas ficam fora desta entrega, documentadas como Lote G2 no roadmap. As 4 features aqui portadas usam seletores/IDs estáveis (`#txaDescricao`, `#chkSinPrioridade`, atributos `onmouseover`/`title` já vistos em lotes anteriores) — mesmo nível de confiança dos lotes B–E2.

## Arquitetura

Lógica pura testável em `features/procedimento-visualizar/`, wiring fino não-testado em dois content scripts novos.

### `features/procedimento-visualizar/ajustarElementosNativos.ts`

Porte de `C:\sei\seiplus\cs_modules\procedimento_visualizar\ajustarElementosNativos.js`:

```ts
export function extrairTooltipRelacionado(onmouseover: string): string | null
export type EstadoDivRelacionados = 'vazio' | 'apenas-titulo' | 'com-conteudo'
export function classificarDivRelacionados(textoCompleto: string, textoContents: string): EstadoDivRelacionados
```

`extrairTooltipRelacionado`: porta a regex `/return infraTooltipMostrar\('(.*)'\)/m` sobre o atributo `onmouseover` de cada link de processo relacionado. `classificarDivRelacionados`: recebe o texto completo (`.text()`, recursivo) e o texto dos nós filhos diretos (`.contents().text()`, equivalente a somar `textContent` de cada `childNode` direto) já computados pelo wiring — decide entre esconder (vazio), substituir por separador próprio (apenas o rótulo "Processos Relacionados:", sem conteúdo) ou deixar como está (com conteúdo).

### `features/procedimento-visualizar/alterarTitulo.ts`

```ts
export function montarTituloJanela(numero: string, tipo: string): string
```

Porta o formato `SEI - {numero} - {tipo}` de `alterarTitulo.js`.

### `features/procedimento-visualizar/anotacao.ts`

Porte de `C:\sei\seiplus\cs_modules\procedimento_visualizar\mostrarAnotacao.js`:

```ts
export interface AnotacaoDados {
  texto: string
  prioridade: boolean
  idProtocolo: string
  tipoPagina: string
  postUrl: string
}

export function parseAnotacaoDados(doc: Document): AnotacaoDados
export function escapeComponentAnotacao(texto: string): string
export function montarCorpoSalvarAnotacao(dados: {
  texto: string
  prioridade: boolean
  idProtocolo: string
  tipoPagina: string
}): string
```

`parseAnotacaoDados`: lê os IDs estáveis `#txaDescricao`, `#chkSinPrioridade`, `#hdnIdProtocolo`, `#hdnInfraTipoPagina`, `#frmAnotacaoCadastro` de um `Document` já parseado. `escapeComponentAnotacao`: porta `escape(str).replace(/\+/g, '%2B')` — usa a função global `escape()` (deprecated, mas preservada intencionalmente: o comentário do original já explicita que é "kind of encodeURIComponent para ISO-8859-1", codificação que o backend do SEI espera; `encodeURIComponent` produziria UTF-8 e quebraria acentuação). `montarCorpoSalvarAnotacao`: monta o corpo `application/x-www-form-urlencoded` do POST de salvar, incluindo a regra `chkSinPrioridade = 'off'` quando o texto fica vazio (remoção de nota).

### Wiring — `content-scripts/procedimento_visualizar/index.ts` (novo)

`matches`: `acao=procedimento_visualizar`. Bootstrap chama, em sequência (cada etapa em `try/catch` próprio):

1. **Ajustar elementos nativos**: aplica `classificarDivRelacionados`/`extrairTooltipRelacionado` sobre `#divRelacionados` e `.divRelacionadosParcial > a`; adiciona classe de estilo a `#divConsultarAndamento` se presente.
2. **Alterar título**: espera (polling simples, mesmo espírito do `EsperaCarregar` original — até 30 tentativas de 100ms) `.infraArvore > a[target="ifrVisualizacao"]` aparecer, lê `title`/texto, chama `montarTituloJanela`, seta `window.parent.document.title`.
3. **Painel de anotação**: monta a UI completa (sem anotação / com anotação / editar / salvar / remover), buscando os dados via `fetch` na URL de `anotacao_registrar` (mesma técnica de extração de URL do `<head>` já usada no Lote F/documento_receber) e usando `parseAnotacaoDados`/`montarCorpoSalvarAnotacao` para ler/gravar.

### Wiring — `content-scripts/anotacao_registrar/index.ts` (novo)

`matches`: `acao=anotacao_registrar`. Porta `atualizarAnotacaoNaArvore.js`: ao clicar no botão de `#divInfraBarraComandosSuperior`, recarrega `parent.document.getElementById('ifrArvore')` — feature pequena e independente do painel acima (cobre o fluxo nativo do SEI para quem chega a essa tela por outro caminho).

## Testes

Vitest cobrindo `ajustarElementosNativos.ts` (extração de tooltip, os 3 estados de classificação), `alterarTitulo.ts` (formato do título), `anotacao.ts` (parse com fixture de `Document` via jsdom, escape ISO-8859-1 incluindo o caractere `+`, corpo do POST incluindo a regra de prioridade forçada a `off` quando o texto é removido). Os dois content scripts não são cobertos por TDD — verificados via build.

## Tratamento de erros

Mesmo padrão já estabelecido: guard `try/catch` por etapa, loga via `console.error('[SEIRMG] ...', error)`, nunca lança.

## Fora de escopo (Lote G2 — mesmo tratamento de risco do Lote F)

`consultarInteressado.js`, `consultarAtribuicao.js`, `documentoModelo.js`, `dropzone.js`, `abrirDocumentoNovaAba.js`, `copiarLinkInterno.js`, `copiarNumeroProcessoDocumento.js` — todas dependem de regex sobre `<script>` dinâmico ou APIs nativas (`objArvore`) não documentadas; as duas últimas também são exclusivas de SEI < 4.
