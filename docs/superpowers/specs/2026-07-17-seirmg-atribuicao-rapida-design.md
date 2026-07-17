# SEIRMG — Atribuir Processo sem trocar de tela — Design

> Nova melhoria (fora do ciclo lote-a-lote formal, como o marcador rápido) — pedido direto do
> usuário, reaproveitando o mesmo padrão de popup do marcador rápido
> (`docs/superpowers/specs/2026-07-15-seirmg-marcador-rapido-design.md`).

## Contexto

Hoje, atribuir um processo (ou vários) a uma pessoa da unidade em Controle de Processos exige:
marcar o(s) checkbox(es) do(s) processo(s), clicar em "Atribuição de Processos" na barra de ícones
(`#divComandos`), o que **navega de verdade** (mesma aba, troca o conteúdo inteiro da tela) para uma
tela dedicada ("Atribuir Processo") com um `<select>` de pessoa, e depois clicar em "Salvar". O
usuário quer que isso vire uma escolha rápida (dropdown num popup), sem sair da lista — mesma
experiência já entregue pro marcador rápido.

## Investigação (HTML real, instância de produção — Campinas)

Confirmado a partir do HTML colado pelo usuário nesta sessão (link da barra de ícones com 1 e com 2
processos marcados, e a tela de confirmação completa nos dois casos):

- **Barra de ícones** (`#divComandos`): "Atribuição de Processos" é
  `<a onclick="return acaoControleProcessos('controlador.php?acao=procedimento_atribuicao_cadastrar&acao_origem=procedimento_controlar&acao_retorno=procedimento_controlar&...', true, false);">`
  — mesma função `acaoControleProcessos` já usada pelo link de "Adicionar Marcador" (que passa
  `true, true`; o terceiro argumento diferente não importa pra nós, só precisamos casar pelo
  `onclick*="procedimento_atribuicao_cadastrar"`). A URL não carrega nenhum id de processo — assim
  como o marcador, a seleção viaja via o formulário da lista (`frmProcedimentoControlar`), não via
  URL.
- **Bulk confirmado nativamente**: com 1 processo marcado, a tela retornada tem
  `<input type="hidden" id="hdnIdProtocolo" name="hdnIdProtocolo" value="21095007" />`. Com 2
  marcados, o mesmo campo vira `value="21095007,5793758"` — uma **string única separada por
  vírgula**, não um campo por processo. Ou seja, o SEI nativo já suporta atribuir vários processos
  de uma vez pra mesma pessoa, e nosso código não precisa fazer nada especial pra isso — só repassa
  esse campo oculto como veio da tela intermediária (mesmo padrão genérico de
  `extrairCamposOcultos`/`parseFormularioMarcador` já usado pelo marcador).
- **Tela "Atribuir Processo"** (`acao=procedimento_atribuicao_cadastrar`): navegação real de página
  completa (mesma estrutura de navbar/menu do marcador). Contém
  `<form id="frmAtividadeAtribuir" action="controlador.php?acao=procedimento_atribuicao_cadastrar&acao_origem=procedimento_atribuicao_cadastrar&...">`
  — hash **diferente** do link original da barra de ícones, então (mesmo motivo do marcador) é
  preciso buscar essa tela primeiro pra pegar a URL certa de envio.
- **Diferença importante do marcador**: `#selAtribuicao` é um **`<select>` nativo de verdade**
  (`<option value="ID">login - NOME COMPLETO</option>`), não um widget customizado tipo
  `#selMarcador` (que precisa de `dd-option`/ícone). Primeira opção é
  `<option value="null" selected="selected">&nbsp;</option>` (placeholder). Não há ícone por opção,
  então o popup pode usar um `<select>` comum estilizado, sem precisar recriar o dropdown
  customizado que o marcador tem.
- **Sem campos extras**: diferente do marcador (que tem `<textarea>` opcional), a tela de atribuição
  só tem o select de pessoa + `hdnIdProtocolo` (oculto). Nenhum campo de observação, sigilo ou
  reabertura.
- **Botão de confirmação**: `<button type="submit" name="sbmSalvar" id="sbmSalvar" value="Salvar">`
  — mesmo nome/valor já usado pelo "Adicionar Marcador".
- **Botão "Cancelar"** só faz uma navegação de volta (`location.href = ...`) — irrelevante pro nosso
  fluxo, nosso próprio botão "Cancelar" no popup só fecha o popup sem fazer request nenhum.

## Decisões validadas com o usuário (2026-07-17)

- **Trigger**: mesmo padrão do marcador — barra de ícones (`#divComandos`), bulk via checkboxes
  marcados, contagem mínima de 1 selecionado pra interceptar (0 ou histórico de erro nativo:
  deixamos o comportamento nativo original acontecer).
- **Escopo de tabelas**: nenhum filtro por tabela — onde o link nativo já aparecer, a contagem de
  selecionados já cobre automaticamente.
- **Campos do popup**: só escolher a pessoa + confirmar (sem campo de texto livre, sem opções
  extras) — bate com o que a tela nativa realmente tem.
- **Após confirmar**: `window.location.reload()` — reaproveita a mesma decisão já validada pelo
  marcador (tentativas de atualizar só a linha ao vivo deixavam o checkbox funcional mas invisível;
  não vamos repetir essa investigação).
- **Reaproveitamento de código**: arquivo próprio (`atribuicaoRapida.ts` + bridge próprio), não um
  refactor do marcador pra generalizar popup/seletor — mesmo padrão de arquivo por feature já
  usado no projeto (`protocoloMarcadorRapido.ts` ao lado de `protocolo.ts` do CKEditor). Evita
  risco de regressão no marcador (já validado ao vivo) só pra economizar duplicação pequena, já que
  o seletor de pessoa é mais simples (select nativo, sem ícone) que o de marcador.
- **Bridge de main-world**: reaproveita o **mesmo** entry point já existente
  (`content-scripts/procedimento_controlar/pontePrincipalMain.ts`, `world: "MAIN"` no
  `manifest.config.ts`) — não precisa de manifest/vite novo. Só adiciona uma segunda função
  (`criarPonteAtribuicaoRapidaMainWorld`) em `pontePrincipal.ts`, chamada ao lado da do marcador.
- **Ícone**: reaproveita o ícone `user` do lucide (`lucide-static`) que o painel de Favoritos já usa
  na coluna "Atribuição" — consistência visual, sem ícone novo.

## Arquitetura

### `protocoloAtribuicaoRapida.ts` (contrato do evento, mesmo padrão de `protocoloMarcadorRapido.ts`)

```ts
export const EVENTO_CLIQUE_ATRIBUICAO_RAPIDA = 'seirmg:clique-atribuicao-rapida'

export interface DetalheCliqueAtribuicaoRapida {
  quantidade: number
}
```

Sem `chave` de ação (diferente do marcador) — atribuição só tem uma ação, não um par
adicionar/remover.

### `features/controle-processos/atribuicaoRapida.ts` (lógica pura, testada)

```ts
export interface OpcaoAtribuicao {
  id: string
  nome: string
}

export function parseOpcoesAtribuicao(doc: Document): OpcaoAtribuicao[]
export function parseFormularioAtribuicao(doc: Document): {
  actionUrl: string
  campos: Record<string, string>
} | null
export function montarCorpoConfirmacaoAtribuicao(
  campos: Record<string, string>,
  pessoaEscolhida: string,
  botao: { nome: string; valor: string }
): URLSearchParams
```

- `parseOpcoesAtribuicao`: lê `#selAtribuicao option`, ignora `value === '' || value === 'null'`
  (placeholder), retorna `{id, nome}` (sem ícone — diferente de `OpcaoMarcador`).
- `parseFormularioAtribuicao`: localiza `<form id="frmAtividadeAtribuir">`, lê `action` e todos os
  `input[type=hidden]` com `name` preenchido (mesmo padrão genérico já usado por
  `parseFormularioMarcador`/`extrairCamposOcultos`, mas em função própria — ver decisão de
  reaproveitamento acima). Não precisa saber os nomes de antemão: `hdnInfraTipoPagina` e
  `hdnIdProtocolo` (já vindo como string única separada por vírgula quando bulk) chegam
  automaticamente.
- `montarCorpoConfirmacaoAtribuicao`: parte de `campos` (já extraídos), sobrescreve
  `selAtribuicao` com o id da pessoa escolhida, adiciona o par `{sbmSalvar: 'Salvar'}` do botão de
  confirmação (necessário porque o SEI usa isso pra identificar qual botão foi "clicado").

`extrairUrlDeOnclick` já existe (`features/controle-processos/marcadorRapido.ts`) e é reaproveitada
diretamente, sem duplicar.

### `content-scripts/procedimento_controlar/pontePrincipal.ts` (main world, estende o arquivo existente)

Nova função, ao lado de `criarPonteMarcadorRapidoMainWorld`:

```ts
export function criarPonteAtribuicaoRapidaMainWorld(
  documentoGlobal: Document,
  janelaGlobal: Window
): { destruir: () => void }
```

Mesma lógica (documentada nos comentários já existentes sobre por que a interceptação precisa
rodar no main world): escuta `click` em modo captura no `documentoGlobal`, casa
`#divComandos a[onclick*="procedimento_atribuicao_cadastrar"]`, conta checkboxes marcados
(reaproveita a mesma função `contarCheckboxesMarcados` já existente no arquivo), se `quantidade < 1`
não faz nada (deixa o nativo agir), senão `preventDefault` + `stopImmediatePropagation` e despacha
`EVENTO_CLIQUE_ATRIBUICAO_RAPIDA` com `{ quantidade }`.

`pontePrincipalMain.ts` passa a chamar as duas:

```ts
criarPonteMarcadorRapidoMainWorld(document, window)
criarPonteAtribuicaoRapidaMainWorld(document, window)
```

### `content-scripts/procedimento_controlar/index.ts` (wiring, isolated world)

Nova função `montarAtribuicaoRapida()`, chamada no `bootstrap()` ao lado de `montarMarcadorRapido()`:

1. `window.addEventListener(EVENTO_CLIQUE_ATRIBUICAO_RAPIDA, ...)`.
2. Localiza o link via `#divComandos a[onclick*="procedimento_atribuicao_cadastrar"]`.
3. `processarClickAtribuicao(link, quantidade)`:
   - Extrai a URL do `onclick` (`extrairUrlDeOnclick`), resolve contra `window.location.href`.
   - Busca `#frmProcedimentoControlar` da página atual, `fetchText(url, { method: 'POST', body: new
     URLSearchParams(extrairCamposOcultos(form)) })`.
   - Faz `parseOpcoesAtribuicao` + `parseFormularioAtribuicao` no HTML retornado.
   - Abre um popup central (mesmo estilo visual do marcador — fundo escurecido, card branco,
     header com ícone + título "Atribuir Processo" + subtítulo "N processos selecionados", corpo,
     rodapé com Cancelar/Atribuir), mas com um `<select>` nativo de pessoas em vez do widget
     customizado do marcador.
   - Ao confirmar: valida que uma pessoa foi escolhida (senão erro inline "Selecione uma pessoa.");
     `fetchText(actionUrl, { method: 'POST', body: montarCorpoConfirmacaoAtribuicao(...) })`.
   - Sucesso: `window.location.reload()` (mesma decisão já validada do marcador). Falha: erro inline
     no popup (rede ou HTTP not-ok), popup continua aberto pro usuário tentar de novo ou cancelar.
4. Todo o fluxo em `try/catch`, `console.error('[SEIRMG] ...', error)`.

## Fora de escopo

- Remover atribuição (desatribuir) — não investigado nesta sessão; se o SEI tiver uma ação nativa
  equivalente, fica pra um pedido futuro.
- Qualquer mudança na tela "Atribuir Processo" nativa em si — continua existindo e funcionando
  (fallback quando 0 selecionados, ou se o popup falhar).
- Criar/editar pessoas ou permissões — só escolher entre as opções que o próprio `#selAtribuicao`
  já lista.

## Riscos / verificação pendente

⚠️ Mesma classe de risco do marcador rápido: duas chamadas de rede em sequência (GET da tela
intermediária + POST de confirmação) via `fetchText`. Cada seletor/campo foi confirmado com HTML
real desta sessão (link com 1 e com 2 processos marcados, tela de confirmação completa nos dois
casos) — não é suposição. **Pendente de validação manual numa instância SEI real** após a
implementação: confirmar que a interceptação no main world funciona igual ao marcador (mesma
armadilha documentada de `stopImmediatePropagation` não bloquear o `onclick` inline quando registrado
pelo isolated world), e que o popup abre corretamente com 1 e com 2+ processos marcados.

## Testes

`atribuicaoRapida.test.ts`: `parseOpcoesAtribuicao` (fixture HTML com `<option>`, ignorando
`value="null"`/`""`, lista vazia se `#selAtribuicao` não existir), `parseFormularioAtribuicao`
(fixture com `hdnIdProtocolo` singular e separado por vírgula, action correto, caso o formulário não
seja encontrado), `montarCorpoConfirmacaoAtribuicao` (sobrescrevendo `selAtribuicao`, incluindo o
par do botão). Wiring em `pontePrincipal.ts`/`pontePrincipalMain.ts`/`index.ts` sem teste
automatizado (mesmo padrão já estabelecido no projeto para essa classe de arquivo — verificado via
build/typecheck e depois manualmente no SEI real).
