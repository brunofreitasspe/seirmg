# SEIRMG — Reconsultar a árvore antes de mostrar o alerta de documentos não assinados — Design

> Correção sobre o Lote Q (`docs/superpowers/specs/2026-07-12-seirmg-lote-q-alerta-documentos-nao-assinados-design.md`), fora do ciclo lote-a-lote formal — pedido direto do usuário.

## Contexto

O alerta de "documentos não assinados" (Lote Q) às vezes avisa sobre um documento que o usuário
**já assinou**, no mesmo carregamento de página. Confirmado com o usuário: um F5 (recarregar a
página) depois de assinar faz o aviso sumir corretamente — ou seja, a árvore do SEI já refletia a
assinatura, o problema é só a extensão nunca reconsultar.

## Causa raiz (confirmada, sem necessidade de HTML novo)

Em `src/content-scripts/procedimento_enviar/index.ts`, `bootstrap()` chama
`extrairDocumentosPendentes(arvore, unidadeAtual)` **uma única vez**, no carregamento da página
(quando o content script é injetado, na navegação real pra `acao=arvore_visualizar`), e guarda o
resultado numa variável (`pendencias`) capturada pelo closure de `observarSelecaoUnidade`. A tela de
"Enviar Processo" é injetada via AJAX dentro do mesmo documento (sem nova navegação, conforme já
documentado no Lote Q) — então, se o usuário assina um documento pendente **depois** desse
carregamento inicial mas **antes** de escolher a unidade de destino (o gatilho que dispara o
diálogo), a lista `pendencias` já está desatualizada: a árvore do SEI (`arvore`, uma referência viva
ao `contentDocument` do iframe `#ifrArvore`, não uma cópia estática) já foi atualizada pelo próprio
SEI, mas a extensão nunca roda `extrairDocumentosPendentes` de novo pra enxergar isso.

## Decisão validada com o usuário (2026-07-19)

Em vez de forçar um refresh visual de verdade do iframe da árvore (que exigiria detectar o momento
exato em que uma assinatura é concluída — tela ainda não investigada, mais arriscado), a correção
reconsulta a árvore **no momento em que o alerta iria aparecer** (quando `unidadeDestinoSelecionada`
detecta que o usuário escolheu a unidade de destino). Como `arvore` é uma referência viva ao DOM do
iframe (não uma cópia), isso tem o mesmo efeito prático de um refresh — sem recarregar nada
visualmente, sem risco de interferir na navegação do usuário, e sem precisar entender a tela de
assinatura.

## Arquitetura

Nenhuma função pura nova — `extrairDocumentosPendentes` (`features/procedimento-enviar/detectarPendencias.ts`)
e `unidadeDestinoSelecionada` (`features/procedimento-enviar/detectarSelecaoUnidade.ts`) continuam
exatamente como estão, já testadas. A mudança é só no wiring, em
`content-scripts/procedimento_enviar/index.ts`:

- `bootstrap()` continua chamando `extrairDocumentosPendentes` uma vez, só pra decidir **se vale a
  pena instalar o observer** (`if (pendenciasIniciais.length === 0) return` — otimização válida:
  assinar um documento só move de "pendente" pra "assinado", nunca o contrário, dentro da mesma
  sessão de carregamento; se já começou em zero, garantidamente continua em zero). A partir daqui
  `bootstrap` passa `arvore` e `unidadeAtual` pra `observarSelecaoUnidade` (em vez da lista de
  pendências já calculada).
- `observarSelecaoUnidade` recebe `arvore: Document` e `unidadeAtual: string` no lugar de
  `pendencias: DocumentoPendente[]`. Dentro de `verificar()`, no momento em que
  `unidadeDestinoSelecionada(document)` vira verdadeiro (e antes de decidir mostrar o diálogo),
  chama `extrairDocumentosPendentes(arvore, unidadeAtual)` de novo, pega o resultado fresco, e só
  chama `mostrarAviso` se essa lista recém-calculada não estiver vazia. Se a lista fresca vier
  vazia (usuário assinou tudo que faltava nesse meio tempo), não mostra nada — fluxo nativo de
  envio segue sem interrupção, mesmo comportamento "informativo, não bloqueia" já decidido no Lote Q.
- `avisoMostrado = true` continua sendo setado assim que `unidadeDestinoSelecionada` vira verdadeiro
  (antes mesmo de saber se a lista fresca está vazia) — o gatilho é "usuário chegou nessa etapa do
  fluxo", que só acontece uma vez por sessão; não tem motivo pra reconsultar de novo depois disso.

## Fora de escopo

- Qualquer mudança na tela/mecanismo de assinar documento.
- Refresh visual de verdade do iframe `#ifrArvore` (decisão do usuário: a reconsulta silenciosa
  resolve o problema relatado sem precisar disso).
- Qualquer outro lugar do projeto que leia a árvore do processo uma única vez (fora de escopo desta
  correção pontual — só o alerta de documentos não assinados foi reportado com esse sintoma).

## Testes

Nenhum teste automatizado novo — as duas funções puras envolvidas (`extrairDocumentosPendentes`,
`unidadeDestinoSelecionada`) não mudam de assinatura nem de comportamento, e já têm cobertura própria
existente. A mudança fica inteira no wiring de `content-scripts/procedimento_enviar/index.ts`, sem
teste automatizado, mesmo padrão já estabelecido no projeto pra esse tipo de arquivo — verificado via
build/typecheck e depois manualmente numa instância SEI real (repetir o cenário relatado: processo
com documento pendente, assinar o documento, ir direto pra "Enviar Processo" sem recarregar a
página, escolher a unidade de destino, confirmar que o aviso não aparece mais).
