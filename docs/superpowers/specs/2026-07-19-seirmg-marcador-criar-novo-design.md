# SEIRMG — Criar novo marcador direto do popup "Adicionar Marcador" + correção de acentos — Design

> Melhoria sobre o recurso "Marcador rápido" (`docs/superpowers/specs/2026-07-15-seirmg-marcador-rapido-design.md`), fora do ciclo lote-a-lote formal — pedido direto do usuário.

## Contexto

O popup "Adicionar Marcador" (Marcador rápido, entregue em 2026-07-16) deixou de propósito fora do
escopo a criação de um novo padrão de marcador (spec original: "Criar um marcador novo (o botão '+'
verde na tela nativa) — só escolher entre os já existentes."). Na prática isso obriga o usuário a
cancelar o popup, ir em Menu > Marcadores > Novo, cadastrar lá, e refazer o fluxo de adicionar
marcador do zero. O usuário quer o atalho de criação disponível direto no popup.

Ao mesmo tempo, foi reportado que o texto opcional do marcador (campo "Texto", `txaTexto`) perde os
acentos depois de salvo — sintoma antigo (mesma classe de bug já corrigida em outras duas
funcionalidades do projeto), mas que **nunca foi corrigido especificamente no marcador rápido**.

## Investigação (HTML real, instância de produção — Campinas, sessão atual)

Confirmado a partir de três capturas de HTML coladas pelo usuário nesta sessão:

1. **HTML final "Novo Marcador"** (`controlador.php?acao=marcador_cadastrar`, acessado direto):
   formulário `frmMarcadorCadastro`, campos `hdnStaIcone` (hidden, alimentado por um seletor de
   cor/ícone `#selStaIcone`), `txtNome` (texto, `maxlength=50`, obrigatório —
   `class="infraLabelObrigatorio"` no label), `txaDescricao` (textarea, `maxlength=250`, opcional),
   `hdnIdMarcador` (hidden, vazio pra criação nova). Botão de confirmação
   `name="sbmCadastrarMarcador" value="Salvar"`.
2. **DOM inspecionado da tela "Adicionar Marcador"** (já transformado pelo JS da página): revelou
   `<img id="imgNovoMarcador" onclick="cadastrarMarcador();" ...>` ao lado do seletor de marcador —
   o gatilho nativo do "+" que o usuário quer replicar.
3. **Código-fonte bruto (Ctrl+U) da mesma tela "Adicionar Marcador"**: revelou a definição real de
   `cadastrarMarcador()`, embutida num `<script>` no `<head>` (não um `onclick` inline com URL
   direta, ao contrário dos outros links já tratados no projeto):
   ```js
   function cadastrarMarcador(){
     parent.infraAbrirJanelaModal('controlador.php?acao=marcador_cadastrar&acao_origem=andamento_marcador_cadastrar&acao_retorno=andamento_marcador_cadastrar&pagina_simples=1&infra_sistema=100000100&infra_unidade_atual=110002133&infra_hash=abb1398175f14729ef520469874ce8549e4ff88bdb86f5e2309a216dab21604e',700,450);
   }
   ```
   Confirma duas coisas importantes:
   - A URL completa (com `infra_hash` válido para esta sessão/ação) **já vem embutida no HTML bruto**
     que o `fetchText` já busca hoje pra abrir o popup de Adicionar Marcador — não precisa de uma
     chamada de rede extra só pra descobrir essa URL, só extrair via regex do texto do `<script>`
     (mesma técnica de extração já usada pra `onclick`, adaptada pro formato
     `infraAbrirJanelaModal('URL', largura, altura)`).
   - `#selStaIcone` no HTML bruto (mesmo código-fonte) seria, por forte analogia com `#selMarcador`
     (já confirmado num caso idêntico na spec do marcador rápido), um `<select id="selStaIcone">`
     nativo com `<option value="ID" data-imagesrc="svg/marcador_X.svg?11">Nome</option>` — o widget
     `.dd-container` só existe depois que o JS da página (`ddslick`) transforma o `<select>` no
     carregamento, que nunca roda no nosso fetch/parse. **Não confirmado com o código-fonte bruto
     exato desta tela específica nesta sessão** (só por analogia direta com `selMarcador`, mesmo
     padrão, mesma versão do SEI) — ver risco abaixo.
   - A mesma tela também define `recarregarMarcadores(idMarcador)`, o callback que o SEI nativo usa
     pra atualizar a lista após criar um marcador pelo fluxo normal (chamado pelo iframe modal via
     `acao_retorno=andamento_marcador_cadastrar`). Não é reaproveitado por este recurso (ver
     "Decisões" abaixo — trocamos por um refetch simples).

## Decisões validadas com o usuário (2026-07-19)

- Botão "+ Novo marcador" só no popup **"Adicionar Marcador"** (não no de "Remover Marcador", que só
  lista marcadores que o processo já tem).
- Ao clicar, abre um **sub-popup por cima** do popup de Adicionar Marcador (mesma linhagem visual),
  com Ícone/Nome/Descrição + Salvar/Cancelar — não substitui o conteúdo do popup original.
- Ao salvar com sucesso: fecha o sub-popup, busca a lista de marcadores atualizada (refetch da tela
  intermediária, mesmo fetch já usado pra abrir o popup original) e **já deixa o marcador
  recém-criado selecionado** no popup original, casando pelo nome digitado.
- Correção de acentos: aplicar o mesmo padrão já validado em `anotacao.ts`
  (`escapeComponentAnotacao`) e no recurso de documento externo (`escape()` com tratamento especial
  do caractere `+`, porque o SEI espera o corpo do POST em ISO-8859-1, confirmado pelo
  `charset=iso-8859-1` no HTML) — tanto no texto opcional do marcador vinculado (`txaTexto`, bug já
  existente) quanto nos campos Nome/Descrição do novo cadastro de marcador (pra não nascer com o
  mesmo bug).

## Arquitetura

### `features/controle-processos/marcadorRapido.ts` (lógica pura, testada)

Funções novas:

```ts
export function extrairUrlNovoMarcador(doc: Document): string | null
export function montarCorpoNovoMarcador(
  campos: Record<string, string>,
  iconeEscolhido: string,
  nome: string,
  descricao: string,
  botao: { nome: string; valor: string }
): string
```

Funções alteradas:

```ts
// generalizada com seletor opcional (default preserva o comportamento atual pra #selMarcador);
// reaproveitada também pra ler #selStaIcone
export function parseOpcoesMarcador(doc: Document, seletor = '#selMarcador option'): OpcaoMarcador[]

// deixa de retornar URLSearchParams (sempre UTF-8) e passa a retornar uma string já escapada
// no padrão ISO-8859-1 pro campo de texto livre, mesma técnica de montarCorpoSalvarAnotacao
export function montarCorpoConfirmacao(
  campos: Record<string, string>,
  marcadorEscolhido: string,
  texto: string,
  botao: { nome: string; valor: string }
): string
```

- `extrairUrlNovoMarcador`: percorre `doc.querySelectorAll('script')`, procura em cada
  `.textContent` o padrão `function cadastrarMarcador\s*\(\s*\)\s*\{[^}]*infraAbrirJanelaModal\(\s*'([^']+)'`
  (mesma ideia de `extrairUrlDeOnclick`, adaptada pro formato de chamada de função em vez de
  atributo `onclick`). Retorna `null` se não encontrar (SEI sem esse botão, versão diferente, etc.)
  — usado só pra decidir se mostra ou não o link "+ Novo marcador" no popup, nunca lançando erro.
- `montarCorpoNovoMarcador`: monta a query string manualmente (não usa `URLSearchParams`), escapando
  `nome` e `descricao` com a mesma função `escape()`-based do padrão já usado em `anotacao.ts`
  (nome local `escapeComponenteTexto`, sem acoplar aos outros arquivos — mesma duplicação
  deliberada que já existe entre `anotacao.ts` e o recurso de documento externo). Demais campos
  (`hdnStaIcone`, campos ocultos de `campos`, o par do botão) são valores puramente
  numéricos/tokens do próprio SEI — sem acento, seguros pra interpolar direto.
- `montarCorpoConfirmacao`: mesma ideia — escapa só o `texto` (o único campo de conteúdo livre
  digitado pelo usuário nesse formulário), interpola o resto de `campos` direto.

### `content-scripts/procedimento_controlar/index.ts` (wiring)

1. `processarClickMarcador` é dividido: a parte de fetch+parse+render vira uma função separada
   `buscarTelaEAbrirPopupMarcador(acao, url, quantidade, nomeParaSelecionar?)`, reaproveitável tanto
   pra abertura inicial do popup quanto pro refetch após criar um marcador novo. Ela:
   - Faz o mesmo fetch/parse já existente (`parseOpcoesMarcador`, `parseFormularioMarcador`).
   - Quando `acao.tipo === 'adicionar'`, também chama `extrairUrlNovoMarcador(docTela)`.
   - Se `nomeParaSelecionar` foi passado, procura nas opções recém-buscadas uma cujo `nome` bata
     exatamente (após `trim()`) e, se achar, pré-preenche `formularioMarcador.campos.hdnIdMarcador`
     com o id encontrado (mesmo efeito de já vir selecionado).
   - Chama `abrirPopupMarcador(acao, opcoes, formularioMarcador, quantidade, urlNovoMarcador, recarregar)`,
     onde `recarregar = (nomeCriado: string) => buscarTelaEAbrirPopupMarcador(acao, url, quantidade, nomeCriado)`
     — um closure sobre a mesma `url`/`acao`/`quantidade` já resolvidas, sem precisar re-extrair nada
     do link original.
2. `abrirPopupMarcador` ganha dois parâmetros novos (`urlNovoMarcador: string | null`,
   `recarregar: (nomeCriado: string) => Promise<void>`). Quando `acao.tipo === 'adicionar' &&
   urlNovoMarcador`, renderiza um link "+ Novo marcador" ao lado do seletor de marcador existente.
   Clique nele chama `abrirPopupNovoMarcador(urlNovoMarcador, recarregar)`.
3. Nova função `abrirPopupNovoMarcador(url, recarregar)`:
   - `fetchText(url)` — GET simples, sem corpo (mesma navegação que o iframe modal nativo faria,
     nenhum dado de contexto de processo é necessário pra criar um marcador — confirmado pelo HTML
     original colado pelo usuário: o formulário não tem `hdnIdProtocolo`).
   - Parseia com `parseFormularioMarcador(doc, 'frmMarcadorCadastro')` e
     `parseOpcoesMarcador(doc, '#selStaIcone option')`.
   - Se qualquer um falhar (formulário não encontrado), mostra erro dentro do sub-popup — não fecha
     sozinho, deixa o usuário cancelar.
   - Renderiza sub-popup (mesma casca visual `.seirmg-marcador-rapido-fundo`/`-popup`, empilhado por
     cima do popup de Adicionar Marcador — ambos usam a mesma classe/z-index, ordem do DOM já garante
     que o mais recente fica visualmente por cima): seletor de ícone (reaproveita o mesmo widget
     visual de `criarSeletorMarcador`, sem o `<img>` de cada opção sendo o "marcador colorido" em vez
     do ícone do marcador em si — mesmo componente, dados diferentes), `<input type="text">` Nome
     (obrigatório, `maxlength=50`), `<textarea>` Descrição (opcional, `maxlength=250`), botões
     Salvar/Cancelar.
   - Validação antes de enviar: ícone escolhido e nome não-vazio (mesmo padrão de mensagem de erro
     inline já usado em `confirmarMarcador` — "Selecione um ícone."/"Informe um nome.").
   - Ao Salvar: `fetchText(actionUrl, { method: 'POST', bodyRaw: montarCorpoNovoMarcador(...) })`.
     Sucesso (`resultado.ok`) → fecha o sub-popup e chama `recarregar(nome.trim())` (que refaz o
     fetch da tela intermediária e reabre o popup de Adicionar Marcador do zero, já com o novo
     marcador selecionado se o nome bateu). Falha → mensagem de erro inline, sub-popup continua
     aberto.
4. `confirmarMarcador`: troca `body: montarCorpoConfirmacao(...)` (que retornava `URLSearchParams`)
   por `bodyRaw: montarCorpoConfirmacao(...)` (que passa a retornar `string`) — mesmo mecanismo que
   `background/index.ts` já usa pra setar `Content-Type: application/x-www-form-urlencoded` sem
   charset (deixando o corpo cru controlar a codificação byte a byte, em vez do `fetch`
   auto-detectar UTF-8 via `URLSearchParams`).

## Fora de escopo

- Editar ou excluir um marcador existente — só criação.
- Qualquer mudança no popup de "Remover Marcador".
- Reaproveitar o mecanismo nativo `recarregarMarcadores(idMarcador)`/`acao_retorno` — mais simples e
  mais alinhado ao resto do projeto (mesma decisão já tomada pro resto do marcador rápido) refazer o
  fetch da tela e casar por nome, em vez de tentar capturar o id retornado pelo SEI (que exigiria
  parsear um `<script>` de callback na resposta do POST, não confirmado nesta sessão).
- Corrigir acentos em qualquer outro fluxo do projeto que ainda não tenha sido corrigido — escopo
  fica restrito ao marcador (vinculado + novo cadastro).

## Riscos / verificação pendente

⚠️ **`#selStaIcone` não foi confirmado com código-fonte bruto desta sessão** — a suposição de que é
um `<select>` nativo (analogia direta com `#selMarcador`, mesma versão do SEI, mesmo padrão de
widget) é forte, mas não 100% certa até validar ao vivo. Se estiver errado, `parseOpcoesMarcador(doc,
'#selStaIcone option')` retorna lista vazia — o sub-popup mostraria o seletor de ícone sem opções
(falha visível e segura, não quebra o resto do popup) — pendente de validação manual numa instância
SEI real, mesmo tratamento de risco de todo lote que depende de estrutura de HTML não coberta por
código-fonte bruto direto.

⚠️ **`extrairUrlNovoMarcador` depende do texto exato da função `cadastrarMarcador()`** — regex
específica pro formato confirmado nesta sessão. Se o SEI mudar a implementação (nome de função,
formato da chamada), a extração falha silenciosamente e o link "+ Novo marcador" simplesmente não
aparece (fallback seguro, sem quebrar o popup existente) — mas fica sem o recurso novo até uma
atualização.

⚠️ **Casamento por nome pra pré-selecionar o marcador recém-criado não é garantido** — se o SEI
permitir nomes duplicados (não verificado) ou o nome digitado tiver alguma normalização
diferente no retorno (espaços, maiúsculas), o marcador é criado normalmente mas pode não vir
pré-selecionado (usuário escolhe manualmente na lista já atualizada — nunca perde o marcador criado,
só a conveniência da pré-seleção).

**Pendente de validação manual numa instância SEI real** (mesmo tratamento de risco de todo lote
anterior que mexe com telas intermediárias do SEI): confirmar extração da URL do "+", estrutura real
de `#selStaIcone`, criação efetiva do marcador, e que os acentos aparecem corretos depois de salvar
(tanto no texto do marcador vinculado quanto no nome/descrição do marcador novo).

## Testes

`marcadorRapido.test.ts`: `extrairUrlNovoMarcador` (script com a função no formato confirmado, script
sem a função, documento sem nenhum `<script>`), `parseOpcoesMarcador` com seletor customizado
(reaproveitando fixture no formato de `#selStaIcone`), `montarCorpoNovoMarcador` (nome/descrição com
acentos — comparando com `escape()` esperado, descrição vazia), `montarCorpoConfirmacao` (retorno
`string` em vez de `URLSearchParams`, texto com acentos escapado corretamente, sem texto). Wiring em
`content-scripts/procedimento_controlar/index.ts` sem teste automatizado, mesmo padrão já
estabelecido no arquivo — verificado via build/typecheck e depois manualmente no SEI real.
