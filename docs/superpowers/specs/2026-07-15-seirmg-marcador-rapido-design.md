# SEIRMG — Adicionar/Remover Marcador sem trocar de tela — Design

> Nova melhoria (fora do ciclo lote-a-lote formal, como o Lote O/Planka) — pedido direto do usuário.

## Contexto

Hoje, adicionar ou remover um marcador de um processo em Controle de Processos exige: marcar o
checkbox do processo, clicar em "Adicionar Marcador" (ou "Remover Marcador") na barra de ícones
(`#divComandos`), o que **navega de verdade** (mesma aba, troca o conteúdo inteiro da tela) para uma
tela dedicada ("Adicionar Marcador"/"Remoção de Marcador") com um dropdown de marcador, e depois
clicar em "Salvar"/"Remover" — que redireciona automaticamente de volta para Controle de Processos.
O usuário quer que isso vire uma escolha rápida (dropdown num popup), sem sair da lista.

## Investigação (HTML real, instância de produção — Campinas)

Confirmado a partir do HTML colado pelo usuário nesta sessão (barra de ícones, tela "Adicionar
Marcador", tela "Remoção de Marcador", e a tabela `#tblProcessosRecebidos` completa com seus campos
ocultos):

- **Barra de ícones** (`#divComandos`): "Adicionar Marcador" é
  `<a onclick="return acaoControleProcessos('controlador.php?acao=andamento_marcador_cadastrar&...', true, true);">`;
  "Remover Marcador" é
  `<a onclick="return acaoRemoverMarcadorProcessar('controlador.php?acao=andamento_marcador_remover&...', true, true);">`.
  Nenhuma das duas URLs carrega `id_procedimento` — quem processo está marcado.
- **Seleção de processo via formulário, não via URL**: a tabela tem campos ocultos próprios
  (`hdnRecebidosItens` — todos os ids da página, `hdnRecebidosItensSelecionados` — ids marcados,
  `hdnRecebidosItensHash` — hash de integridade), atualizados por `infraSelecionarItens(this,
  'Recebidos')` no `onclick` de cada checkbox (`chkRecebidosItem<N>`, `value="<id_procedimento>"`).
  Isso confirma que `acaoControleProcessos`/`acaoRemoverMarcadorProcessar` funcionam **reenviando o
  formulário da lista** (não um link simples) — a mesma classe de mecanismo que a rolagem infinita
  (`rolagemInfinita.ts`) já usa com segurança.
- **Tela "Adicionar Marcador"** (`acao=andamento_marcador_cadastrar`): é uma **navegação real de
  página completa** (o HTML retornado inclui toda a navbar/menu do SEI, não é um fragmento AJAX).
  Contém `<form id="frmAndamentoMarcadorCadastro" action="controlador.php?acao=andamento_marcador_cadastrar&acao_origem=andamento_marcador_cadastrar&...">`
  (hash **diferente** do link original da barra de ícones — por isso é preciso buscar essa tela
  primeiro pra pegar a URL certa de envio). O dropdown de marcador **não é um `<select>` nativo** —
  é um widget customizado (`<div id="selMarcador" class="dd-container">` com `<li><a class="dd-option">`
  cada um contendo `<input class="dd-option-value" value="ID">` + `<img class="dd-option-image">` +
  `<label class="dd-option-text">Nome</label>`), diferente do que a documentação do Sei Pro (SEI mais
  antigo) descreve. O valor realmente enviado é o campo separado
  `<input type="hidden" id="hdnIdMarcador" name="hdnIdMarcador" value="">`. Também tem
  `<textarea id="txaTexto" name="txaTexto">` (opcional) e `<input type="hidden" id="hdnIdProtocolo" name="hdnIdProtocolo">`.
- **Tela "Remoção de Marcador"** (`acao=andamento_marcador_remover`): mesma estrutura, mas o
  `hdnIdMarcador` já vem preenchido com o marcador atual (pré-selecionado) — a lista de opções mostra
  só o(s) marcador(es) que aquele processo já tem. Botão de confirmação é `name="sbmRemover" value="Remover"`
  (a Adicionar usa `name="sbmSalvar" value="Salvar"`).
- **Confirmado pelo usuário ao vivo**: depois de "Salvar"/"Remover", o SEI **redireciona sozinho** de
  volta pra Controle de Processos — ou seja, a resposta da chamada de confirmação já é a lista
  atualizada, sem precisar de uma terceira busca separada.
- **Confirmado pelo usuário ao vivo**: hoje só dá pra adicionar/remover **um marcador por vez**
  (o SEI nativo já pede pra escolher qual, quando há mais de um) — não é uma limitação que este
  recurso estaria introduzindo.

## Decisões validadas com o usuário (2026-07-15)

- Escopo inicial: **um processo por vez** (o fluxo que o usuário descreveu). Seleção múltipla fica
  pra uma extensão futura, se for pedida.
- Popup **central** (não um menu solto no ponto do clique).
- Cobre **adicionar e remover** no mesmo recurso (dois popups parecidos, um pra cada ação).

## Arquitetura

### `features/controle-processos/marcadorRapido.ts` (lógica pura, testada)

```ts
export interface OpcaoMarcador {
  id: string
  nome: string
  icone: string
}

export function extrairUrlDeOnclick(onclick: string): string | null
export function parseOpcoesMarcador(doc: Document): OpcaoMarcador[]
export function parseFormularioMarcador(doc: Document, idFormulario: string): {
  actionUrl: string
  campos: Record<string, string>
} | null
export function montarCorpoConfirmacao(
  campos: Record<string, string>,
  marcadorEscolhido: string,
  texto: string,
  botao: { nome: string; valor: string }
): URLSearchParams
```

- `extrairUrlDeOnclick`: extrai a primeira string entre aspas simples de um atributo `onclick` (mesmo
  padrão de extração já usado em outros pontos do projeto para parsear `onclick`/`href` gerados pelo
  SEI).
- `parseOpcoesMarcador`: lê `#selMarcador .dd-options .dd-option` do documento, ignora a opção `null`
  (placeholder "nenhum"), retorna `{id, nome, icone}` de cada uma (de `.dd-option-value`,
  `.dd-option-text`, `.dd-option-image` respectivamente).
- `parseFormularioMarcador`: localiza o `<form id="idFormulario">` (`frmAndamentoMarcadorCadastro` ou
  `frmAndamentoMarcadorRemocao`), lê seu `action`, e todos os `input[type=hidden]` com `name`
  preenchido (mesmo padrão genérico de `extrairCamposOcultos` já usado por `rolagemInfinita.ts` — não
  lista os nomes de antemão, lê o que estiver lá). Se a `hdnIdMarcador` já vier preenchida no HTML
  (caso do formulário de remoção, pré-selecionado), o valor já está em `campos.hdnIdMarcador`.
- `montarCorpoConfirmacao`: parte de `campos` (já extraídos), sobrescreve `hdnIdMarcador` com o
  escolhido pelo usuário, adiciona `txaTexto` (se houver) e o par `{nome: valor}` do botão de
  confirmação (`sbmSalvar=Salvar` ou `sbmRemover=Remover`, necessário porque o SEI usa isso como o
  campo que identifica qual botão foi "clicado").

### `content-scripts/procedimento_controlar/index.ts` (wiring)

Nova função `montarMarcadorRapido()`, chamada no `bootstrap()`:

1. Localiza os dois links da barra de ícones via `a[onclick*="andamento_marcador_cadastrar"]` e
   `a[onclick*="andamento_marcador_remover"]` dentro de `#divComandos`.
2. Em cada um, `addEventListener('click', ...)` que:
   - Conta quantos checkboxes estão marcados nas 3 tabelas (mesmo padrão de
     `linhasDaTabela`/seleção já usado no arquivo). Se não for exatamente 1, **não faz
     `preventDefault()`** — deixa o comportamento nativo original acontecer (link continua
     funcionando normalmente pra 0 ou 2+ selecionados).
   - Se for exatamente 1: `event.preventDefault()`, extrai a URL via `extrairUrlDeOnclick`, busca o
     `<form id="frmProcedimentoControlar">` da página atual, envia via
     `fetchText(url, { method: 'POST', body: new URLSearchParams(extrairCamposOcultos(form)) })`
     (reaproveita `extrairCamposOcultos` de `rolagemInfinita.ts` — já pega
     `hdnRecebidosItensSelecionados` etc. automaticamente, porque o clique real no checkbox já
     rodou antes).
   - Faz `new DOMParser().parseFromString(resultado.data, 'text/html')`, chama
     `parseOpcoesMarcador` + `parseFormularioMarcador` (com o id do formulário certo pra cada ação).
   - Renderiza um popup central (`position: fixed`, mesmo estilo visual dos popovers já existentes
     no arquivo — `.seirmg-planka-popover` como referência de classe base) com:
     - Adicionar: `<select>` das opções + `<textarea>` opcional + botões "Adicionar"/"Cancelar".
     - Remover: `<select>` das opções (marcador atual já vem selecionado por padrão, já que só há
       uma opção real na maioria dos casos) + botões "Remover"/"Cancelar".
   - Ao confirmar: `fetchText(actionUrl, { method: 'POST', body: montarCorpoConfirmacao(...) })`.
   - **A resposta dessa segunda chamada já é a lista atualizada** (confirmado que o SEI redireciona
     sozinho). Faz `new DOMParser().parseFromString(resultado.data, 'text/html')`, localiza
     `tr#P<id_procedimento>` no documento parseado, adota o nó (`document.adoptNode`) e substitui
     (`linhaAntiga.replaceWith(linhaNova)`) a linha correspondente na tabela ao vivo.
   - Reaplica os enriquecimentos próprios da SEIRMG só nessa linha nova, reaproveitando
     `reaplicarTratamentosNasLinhasNovas(idTabela, config, [linhaNova])` (já existe, já faz
     prazos/cor/especificação/planka/estrela/filtros/ordenação — mesma função usada quando a
     rolagem infinita traz linhas novas).
   - Fecha o popup e mostra um retorno visual rápido (ex. o popup unavailable already closed; um
     `console.log` não é suficiente pro usuário perceber — usar uma pequena mensagem de confirmação
     transitória, mesmo padrão dos popovers do Planka).
3. Todo o fluxo em `try/catch`, `console.error('[SEIRMG] ...', error)` — se qualquer chamada falhar
   (rede, sessão inválida via `fetchTextComGate`, marcador não encontrado no HTML), mostra uma
   mensagem de erro **visível no popup** (não só no console) e não fecha o popup sozinho, deixando o
   usuário tentar de novo ou cancelar.

## Fora de escopo

- Seleção múltipla (vários processos de uma vez) — só um processo por ação, matching o
  comportamento nativo atual.
- Qualquer mudança na tela "Adicionar Marcador"/"Remoção de Marcador" nativa em si — o fluxo nativo
  continua existindo e funcionando (é o fallback quando 0 ou 2+ processos estão selecionados).
- Criar um marcador novo (o botão "+" verde na tela nativa) — só escolher entre os já existentes.

## Riscos / verificação pendente

⚠️ **Alto risco relativo (mais alto que qualquer melhoria feita antes nesta sessão)** — são duas
chamadas de rede em sequência (GET da tela intermediária + POST de confirmação), ambas via
`fetchText`/`fetchTextComGate` (o mesmo mecanismo seguro já usado pela rolagem infinita — mutex,
espera pós-navegação, detecção de tela de login, circuit breaker). Mesmo assim, cada campo/seletor
foi confirmado com HTML real desta sessão (não é suposição baseada só no código do Sei Pro, que
mostrou ter uma estrutura diferente — o dropdown de marcador desta versão do SEI usa um widget
customizado, não um `<select>` nativo). **Pendente de validação manual numa instância SEI real**
(mesmo tratamento de risco dos Lotes F/K): confirmar que `hdnRecebidosItensSelecionados` realmente
chega preenchido no momento em que o popup abre (não há como simular isso em teste automatizado,
depende do clique real do usuário já ter rodado o `infraSelecionarItens` nativo antes).

## Testes

`marcadorRapido.test.ts`: `extrairUrlDeOnclick` (onclick válido, sem aspas, string vazia),
`parseOpcoesMarcador` (fixture HTML com `.dd-option`, ignorando o placeholder `null`, lista vazia),
`parseFormularioMarcador` (fixture HTML de Adicionar e de Remoção — action correto, campos ocultos
extraídos, caso o formulário não seja encontrado), `montarCorpoConfirmacao` (com/sem texto, marcador
sobrescrevendo o valor original de `hdnIdMarcador`). Wiring em
`content-scripts/procedimento_controlar/index.ts` sem teste automatizado (mesmo padrão já
estabelecido no projeto — verificado via build/typecheck e depois manualmente no SEI real).
