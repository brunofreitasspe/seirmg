# SEIRMG — Popup consulta blocos de assinatura ao abrir — Design

> Correção sobre o redesign do popup (`docs/superpowers/specs/2026-07-20-seirmg-historico-processos-visitados-design.md`), fora do ciclo lote-a-lote formal — pedido direto do usuário.

## Contexto

O popup mostra "Tudo em dia"/"Pendências encontradas" lendo `LocalConfig.blocoAssinaturaPendenteAtual`
— um valor que só é atualizado quando o usuário visita a página de conteúdo de **um** bloco de
assinatura específico (populado por `processarItensBlocoAssinatura`, disparado por uma mensagem que
só existe nessa tela). Usuário testou com uma pendência real existente, sem ter visitado essa tela
nessa sessão do navegador, e o popup mostrou "Tudo em dia" — dado desatualizado, não um bug de lógica.

## Decisão validada com o usuário (2026-07-20)

O popup deve consultar ao vivo quando é aberto, não confiar num valor potencialmente antigo. Dado o
histórico deste projeto especificamente com bloco de assinatura (duas tentativas anteriores de
checagem automática via alarme/timer causaram deslogamento real da sessão do SEI — ver
`docs/superpowers/specs/2026-07-16-seirmg-bloco-assinatura-checagem-oportunista-design.md`), a consulta
é **leve e disparada só por ação explícita do usuário** (abrir o popup, não um timer):

- Uma única requisição — a listagem de blocos (`acao=bloco_assinatura_listar`), reaproveitando
  `parseListaBlocosAssinatura` (`features/bloco-assinatura/parser.ts`, já existe e já é usada pela
  checagem oportunista).
- Conta **blocos** em estado `disponibilizado_para_area` (disponibilizados pra sua unidade agir) — não
  o número exato de documentos pendentes dentro de cada bloco (isso exigiria entrar em cada bloco
  individualmente, várias requisições, mesma categoria de risco já rejeitada antes).
- Se não der pra consultar (nenhuma aba do SEI aberta, ou falha de rede), o popup mostra um estado
  neutro ("Abra o SEI pra ver o status") — não mistura com o valor antigo baseado em documentos
  (`blocoAssinaturaPendenteAtual`), que é uma unidade diferente (documentos, não blocos) e ficaria
  confuso reaproveitado como fallback.

## Arquitetura

Popups não têm acesso direto a uma sessão HTTP com hash válido do SEI (o `infra_hash` só existe
embutido em HTML de uma página do SEI já carregada) — a consulta precisa passar por um content script
já rodando numa aba real do SEI.

### `content-scripts/core/index.ts` (modificado)

Novo listener de mensagem, mesmo padrão já usado em `background/index.ts`:

```ts
chrome.runtime.onMessage.addListener((mensagem, _remetente, responder) => {
  if (!ehMensagemConsultarBlocos(mensagem)) return false
  consultarBlocosDisponibilizados()
    .then(responder)
    .catch((error) => {
      console.error('[SEIRMG] Falha ao consultar blocos de assinatura disponibilizados:', error)
      responder({ ok: false, error: String(error) })
    })
  return true
})
```

`consultarBlocosDisponibilizados()`: acha o link `a[href^="controlador.php?acao=bloco_assinatura_listar"]`
já presente no menu lateral da própria página (mesmo seletor já usado pela checagem oportunista),
busca via `fetchText`, faz parse com `parseListaBlocosAssinatura`, retorna
`{ ok: true, total: número de blocos com estado 'disponibilizado_para_area' }` ou `{ ok: false, error }`.

### `popup/main.ts` (modificado)

Ao renderizar: `chrome.tabs.query({ url: `${baseUrlSei}/*` })` pra achar uma aba do SEI já aberta: se
achar, `chrome.tabs.sendMessage(aba.id, { type: 'seirmg:consultar-blocos-disponibilizados' })` e usa a
resposta; se não achar aba, ou a mensagem falhar (aba sem content script pronto, timeout, etc.), cai no
estado neutro. Card de status vira 3 estados (não mais 2): **ok** (0 blocos), **pendente** (N blocos),
**indisponível** (não deu pra consultar).

## Fora de escopo

- Contagem exata de documentos por bloco (múltiplas requisições — risco já rejeitado).
- Qualquer alarme/timer novo — a consulta só acontece quando o usuário abre o popup.
- Mudar o badge nativo perto da logo do SEI (`badge.ts`, continua usando
  `blocoAssinaturaPendenteAtual` como já fazia — fora desta correção).

## Testes

Nenhum teste automatizado novo pro wiring de `core/index.ts`/`popup/main.ts` (mesmo padrão já
estabelecido pra content scripts/popup neste projeto) — verificado via `tsc --noEmit`/`bun run
test`/`bun run build` e depois validação manual numa instância SEI real (com pelo menos um bloco
disponibilizado pra unidade atual, abrir o popup e confirmar que mostra a contagem correta sem precisar
visitar a tela de Bloco de Assinatura antes).
