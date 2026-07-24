---
title: "Converter número selecionado em hyperlink SEI, pelo ícone da extensão (Lote J)"
date: 2026-07-24
status: aprovado
---

# Converter número selecionado em hyperlink SEI, pelo ícone da extensão

## Problema

O Sei Pro (extensão de referência, `docs/analise-tecnica-ckeditor-sei-pro.md`) tem uma família de
recursos que convertem um número de processo/documento digitado no corpo de um documento em
hyperlink real do SEI (`REFDOCUMENTOS`/`REFERENCIAINTERNA`, ver `pages/REFDOCUMENTOS.md` em
`C:\sei\seipro`). O SEIRMG ainda não tem nenhum equivalente — item já previsto no roadmap como parte
do Lote J (`docs/ROADMAP-LOTES.md`, "referência interna/a documentos do processo").

Pedido específico do usuário: selecionar o número de um processo/documento dentro do texto que está
editando e clicar no ícone da extensão na barra de ferramentas do navegador — não um botão dentro do
editor — já converte esse texto selecionado no link correspondente, sem passo intermediário.

## Escopo

- A seleção precisa estar **dentro do corpo do documento sendo editado** (CKEditor). Seleção em
  qualquer outro lugar da página (árvore, lista de processos etc.) fica fora de escopo — decisão do
  usuário durante o brainstorming, elimina a ambiguidade de "onde inserir" quando não há editor
  aberto.
- O número pode ser de **qualquer processo ou documento do SEI**, não só da árvore do processo aberto
  no momento — decisão explícita do usuário, mais abrangente que o Sei Pro (que só resolve a partir
  da árvore já carregada). Implica pesquisar no SEI em tempo real ao converter.
- Fora de escopo: editar/remover um link já inserido (Sei Pro tem uma tela própria pra isso,
  `ABRIRLINKS.md` — não é este lote), e qualquer variante que insira o link fora do editor (copiar
  link pra área de transferência, abrir em nova aba etc.).

## Mecanismo do ícone ("ícone esperto")

Hoje `chrome.action` sempre abre `src/popup/index.html` (status do bloco de assinatura + histórico de
processos visitados). Esse popup não pode continuar sempre aberto: quando há uma seleção
"candidata a número" dentro do editor, o clique no ícone precisa disparar `chrome.action.onClicked`
em vez de abrir o popup.

Mecanismo (opção aprovada no brainstorming, em vez da alternativa mais simples de um botão dentro do
popup — o usuário pediu clique único):

1. O content-script do editor (`documento_editar`) observa mudanças de seleção dentro do CKEditor
   (ver "Ponte CKEditor" abaixo) e, a cada mudança, decide se o texto selecionado é candidato a número
   SEI (`candidatoANumeroSei`, ver próxima seção).
2. Manda uma mensagem `seirmg:link-selecao-estado` `{ ativo: boolean }` pro background a cada mudança
   de estado (não a cada tecla — só quando `ativo` alterna de valor, pra não inundar o service worker).
3. O background chama `chrome.action.setPopup({ tabId, popup: ativo ? '' : 'src/popup/index.html' })`
   pra essa aba. `popup: ''` faz o Chrome tratar o próximo clique como clique "sem popup", disparando
   `onClicked` de verdade; qualquer outra aba/janela continua com o popup normal, intacto.
4. `chrome.action.onClicked` (só dispara quando o popup está limpo) manda `seirmg:link-selecao-converter`
   de volta pro content-script daquela aba, que executa a conversão (próxima seção).
5. Depois de converter (sucesso ou erro) ou se o usuário mudar a seleção pra algo que não é mais
   candidato, o passo 2/3 restaura o popup padrão — o ícone nunca fica "preso" no modo conversão.
6. Ao fechar/navegar a aba (`pagehide`), o content-script força a restauração do popup padrão antes de
   descarregar, evitando um ícone preso em `popup: ''` numa aba que já não tem mais o listener ativo.

## Detecção do número

```ts
export function extrairDigitos(texto: string): string {
  return texto.replace(/\D/g, '')
}

const MIN_DIGITOS = 6
const MAX_DIGITOS = 25

export function candidatoANumeroSei(textoSelecionado: string): boolean {
  const digitos = extrairDigitos(textoSelecionado)
  return digitos.length >= MIN_DIGITOS && digitos.length <= MAX_DIGITOS
}
```

Limites escolhidos pra evitar falso positivo em números pequenos que aparecem naturalmente num texto
(artigo de lei, ano, item numerado) sem exigir que o usuário selecione só dígitos — o SEI Pro
(`onlyNumber()`, `sei-functions-pro.js`) já usa a mesma estratégia de "extrair só os dígitos antes de
pesquisar", então o texto selecionado pode manter a formatação original (pontos, barra, hífen) — ela
não interfere na pesquisa e continua sendo o texto exibido no link depois de inserido.

## Ponte CKEditor: observar seleção

`pontePrincipal.ts` (main world) ganha um listener novo na instância CKEditor:

```ts
instanciaAtual.on('selectionChange', () => {
  const texto = instanciaAtual?.getSelection?.()?.getSelectedText() ?? ''
  janelaGlobal.dispatchEvent(new CustomEvent(EVENTO_SELECAO_MUDOU, { detail: { texto } }))
})
```

`ponteEditor.ts` (isolated world) expõe a assinatura:

```ts
aoMudarSelecao(callback: (texto: string) => void): () => void  // retorna função de cancelar
```

Reaproveita o mesmo par de eventos main↔isolated já validado ao vivo no Lote R — não é um mecanismo
novo, só mais um tipo de evento no mesmo canal.

## Resolver o número em link

Novo módulo puro `src/features/referencia-link/link.ts`:

```ts
export function extrairIdDoUrl(url: string, chave: 'id_procedimento' | 'id_documento'): string | null
export function construirLinkResultado(urlFinal: string): { href: string; tipo: 'processo' | 'documento' } | null
```

`construirLinkResultado` tenta `id_documento` primeiro (mais específico), cai pra `id_procedimento`
se não achar, e retorna `null` se não achar nenhum dos dois. O link devolvido é o mesmo padrão
"seguro" (sem `infra_hash`) já validado ao vivo em `favoritos.ts` (`construirLinkSeguro`) —
`controlador.php?acao=procedimento_trabalhar&id_procedimento=...` ou, por analogia,
`controlador.php?acao=documento_visualizar&id_documento=...`. **Risco não validado:** o padrão sem
hash já é confirmado funcionando pra processo; pra documento é uma extrapolação razoável (mesma
lógica de URL do SEI) mas precisa ser confirmada ao vivo — ver seção de Riscos.

Pra descobrir esse `urlFinal`, a pesquisa reaproveita a mesma caixa "Pesquisa Rápida" que já existe
na tela inicial do SEI (`#frmProtocoloPesquisaRapida`, confirmado no código de produção do Sei Pro,
`getIDProtocoloSEI`/`getContentProcSEIByProtocolo` em `sei-functions-pro.js`): POST de
`txtPesquisaRapida=<dígitos>` pro `action` desse formulário, e a URL final da resposta (depois do
redirect do próprio SEI) contém `id_procedimento` ou `id_documento`.

O content-script do editor normalmente roda numa janela separada, sem essa caixa de pesquisa na
própria página (mesmo caso já resolvido em `content-scripts/editor_montar/index.ts`, que acessa a
janela que abriu o editor via `window.opener`). Reaproveita o mesmo caminho: só no frame de topo
(`window === window.top`), busca `window.opener?.document.querySelector('#frmProtocoloPesquisaRapida')`
pra montar a URL do POST. **Se `window.opener` não existir** (editor abriu sem `window.open`, cenário
não confirmado nesta instância SEI) **ou o formulário não for encontrado**, mostra o toast de erro
("Não foi possível localizar a pesquisa do SEI") e não tenta nenhum outro caminho — evita adivinhar
uma URL de pesquisa errada.

`lib/result.ts` ganha uma variante que devolve a URL final em vez do corpo da resposta
(`fetchFinalUrl`), já que é só disso que essa função precisa — sem duplicar a lógica de timeout já
existente em `fetchText`. `background/sessionGate.ts` ganha o equivalente com gate
(`fetchFinalUrlComGate`), mesmo padrão de circuit breaker/detecção de tela de login já usado por
`fetchTextComGate`.

## Inserir o link

Com o resultado em mãos, `referenciaLink.ts` (novo, ao lado de `corretorOrtografico.ts`/
`formatacaoBasica.ts` em `content-scripts/documento_editar/`) monta:

```html
<a href="{href}" target="_blank">{textoOriginalSelecionado}</a>
```

e chama `editor.inserirHtml(...)` (já existente na ponte) — substitui a seleção atual pelo próprio
texto, agora como link. `textoOriginalSelecionado` preserva a formatação como o usuário digitou
(pontos, barra, hífen) — só os dígitos foram extraídos pra pesquisa, o texto exibido no link não muda.

## Feedback visual

Toast novo, mockup aprovado no companheiro visual do brainstorming: card branco, cantos arredondados
(14px), sombra (`0 10px 30px rgba(0,0,0,.25)`), **centralizado na tela** (`position: fixed`, não rola
com a página — decisão do usuário: o canto da tela pode ficar fora da área visível).

- **Sucesso:** ícone de check circular azul (`#017fff`), texto "Link inserido no documento", some
  sozinho depois de ~3s.
- **Erro:** ícone de alerta circular vermelho (`#dc3545`), borda esquerda vermelha, texto
  descrevendo o problema (ex.: `Número "72946073" não encontrado no SEI`), botão "✕" — fica na tela
  até o usuário fechar manualmente, pra não perder a mensagem (mesma diretriz já registrada na
  memória do projeto: preferir aviso visível na página a depender de console/DevTools).

Reaproveita a mesma linguagem visual já usada nos painéis flutuantes existentes (Ferramentas de IA,
Tarefas) — sem framework novo, só mais um elemento `position: fixed` com CSS inline/injetado, mesmo
padrão de `injetarEstilos()` já usado em `documento_editar/index.ts`.

## Configuração

Novo campo em `SyncConfig`: `referenciaLink: { ativo: boolean }`, default `ativo: false` — mesma
convenção já usada por todo recurso opcional/aditivo deste projeto (Ferramentas de IA, Corretor
Ortográfico, Formatação Básica, Tarefas, Histórico de Processos todos default `false`, opt-in via
Opções), mesmo este recurso não tendo custo de setup: o comportamento do ícone da extensão muda de
forma visível (deixa de abrir sempre o popup), então é melhor o usuário ligar deliberadamente do que
ser surpreendido. Toggle correspondente na tela de Opções, mesma seção do editor de documentos.

## Riscos e validação

- **Chamada de rede nova:** todo fetch autônomo (alarme/timer) já foi descartado neste projeto por
  causar deslogamento real (Lote A, ver `docs/ROADMAP-LOTES.md`). Este fetch é diferente por
  construção — só roda em resposta direta a um clique do usuário no ícone, nunca por timer — mesma
  categoria de risco (baixo) que qualquer outra ação SEI disparada por clique explícito (marcador
  rápido, atribuição rápida etc.), não a categoria já proibida.
- **Endpoint de pesquisa rápida:** a existência de `#frmProtocoloPesquisaRapida` com esse `id`/campo
  `txtPesquisaRapida` vem do código de produção do Sei Pro, não foi confirmada nesta instância SEI-RMG
  especificamente. **Pendente de validação manual numa instância SEI real** antes de considerar este
  lote concluído — mesmo tratamento de risco já usado nos Lotes F/K/R.
- **Link de documento sem hash:** só o padrão pra processo (`id_procedimento` sem `infra_hash`) está
  confirmado ao vivo (`favoritos.ts`); o análogo pra documento (`id_documento` sem hash) é uma
  extrapolação a confirmar na mesma sessão de validação.
- **`window.opener` ausente:** se esta instância SEI abrir o editor sem `window.open` (não confirmado),
  a pesquisa nunca encontra o formulário e todo clique cai no toast de erro — comportamento seguro
  (não insere link errado), mas o recurso fica inútil nesse cenário; primeira coisa a checar na
  validação ao vivo.
- **Seleção sobrevive ao clique no ícone fora do iframe:** já é o mesmo padrão usado pelos próprios
  botões de formatação do SEI (fora do iframe do CKEditor, agindo sobre a seleção anterior dentro
  dele) e pela ponte main-world já validada no Lote R — risco baixo, mas fica registrado como item a
  observar na validação ao vivo (não dá pra simular clique real na barra de ferramentas do Chrome em
  teste automatizado).

## Testes

Lógica pura testada (mesmo padrão do resto do projeto): `extrairDigitos`, `candidatoANumeroSei`,
`extrairIdDoUrl`, `construirLinkResultado`. Wiring de mensagens (`chrome.action.setPopup`,
`onClicked`, ponte CKEditor, toast) não é testável de forma significativa fora de uma instância SEI
real — fica marcado como **pendente de validação manual**, mesmo tratamento dos Lotes F/K/R.

## Atualização do roadmap

`docs/ROADMAP-LOTES.md`: item J ganha esta sub-entrega ("referência a processo/documento do SEI a
partir de qualquer número selecionado, via ícone da extensão") ao concluir, junto com a Tabela Rápida
já em andamento — mesmo padrão de "lote grande entregue em pedaços" já usado no próprio Lote J.
