# SEIRMG — Informações adicionais no painel lateral da árvore — Design

> Porta parte da funcionalidade "Informações adicionais na árvore do processo" do Sei Pro
> (`seipro/pages/INFOARVORE.md`), fora do ciclo lote-a-lote formal — pedido direto do usuário, a
> partir do HTML da página `procedimento_trabalhar` colada no chat. Item G2b/L "avançado" do roteiro
> (`docs/ROADMAP-LOTES.md`) cobre extensões futuras não incluídas aqui (edição inline, marcador).

## Contexto

O Sei Pro original injeta, na árvore do processo, um painel com 8 seções colapsáveis (Marcador,
Acompanhamento Especial, Tipo de Procedimento, Nível de Acesso, Interessados, Assuntos, Observações,
Especificação/Atribuição), buscadas via um iframe oculto que navega para `procedimento_trabalhar` e
depois faz `$.ajax` na tela "Consultar/Alterar Processo" (`sei-pro-arvore.js`, `sei-functions-pro.js`).

O SEIRMG já tem uma versão parcial disso, em produção, sem toggle e sem iframe oculto: `montarPainelLateral`
(`src/content-scripts/procedimento_visualizar/index.ts:460`) roda automaticamente em toda carga da árvore
(`acao=procedimento_visualizar`, dentro de `#ifrArvore`), faz um único `fetchText` na URL de
"Consultar/Alterar Processo" (`extrairUrlEdicaoProcesso`, `features/procedimento-visualizar/painelLateral.ts`)
e já renderiza **Tipo do processo**, **Interessados** e **Atribuído para/Credencial para** (mais um card do
Planka). Esse fetch único e síncrono ao carregar a página já está validado em produção — categoria de risco
diferente do padrão de fetch periódico em aba oculta que já causou um bug real de deslogamento neste
projeto (ver `[[project-seirmg-hardening]]`), então **não repete esse risco**.

## Decisões validadas com o usuário (2026-07-20)

- Reaproveitar o **mesmo** `doc` já buscado por `montarPainelTipoEInteressados` — nenhum fetch novo.
- Nenhum toggle/estado "sob demanda": os campos novos aparecem automaticamente, igual aos já existentes.
- Escopo desta rodada: **Nível de Acesso, Assuntos, Observação (da unidade atual), Especificação**.
- **Fora de escopo, decisão explícita:**
  - **Marcador** — fonte de dado diferente (não vem da tela Consultar/Alterar Processo); a lógica de
    marcador já existente no projeto (`features/controle-processos/marcadorRapido.ts`) opera hoje só na
    tabela de Controle de Processos, não na árvore. Fica pra um lote futuro com investigação própria.
  - **Edição inline** (ícones de lápis do Sei Pro original) — aumenta bastante o escopo (replicar
    formulário nativo de alterar processo campo a campo). Fica pra um lote de edição separado, depois de
    validar a exibição ao vivo.
  - **Observações de todas as unidades** (Sei Pro mostra uma lista `unidade: observação` por unidade) —
    o campo disponível na mesma tela já buscada é só a observação da unidade atual (`#txaObservacoes`,
    mesmo campo usado por `#observacao` nos campos dinâmicos do Sei Pro, `DADOSPROCESSO.md`); a lista
    completa exigiria uma fonte de dados diferente, fora de escopo.

## Arquitetura

### `features/procedimento-visualizar/painelLateral.ts`

Quatro novas funções puras, mesmo estilo de `extrairTipoProcesso`/`extrairInteressados` (recebem o
`Document` já parseado da tela Consultar/Alterar Processo):

```ts
export interface NivelAcessoExtraido {
  nivel: 'Público' | 'Restrito' | 'Sigiloso' | ''
  hipoteseLegal: string | null
}
export function extrairNivelAcesso(doc: Document): NivelAcessoExtraido

export function extrairAssuntos(doc: Document): string[]

export function extrairObservacao(doc: Document): string

export function extrairEspecificacao(doc: Document): string
```

- `extrairNivelAcesso`: lê `input[name="rdoNivelAcesso"]:checked` → `'0'` = Público, `'1'` = Restrito,
  `'2'` = Sigiloso (mesmos valores usados pelo Sei Pro, `sei-pro-arvore.js:2047-2049`); string vazia +
  `hipoteseLegal: null` se não encontrar o rádio. Se Restrito, também lê a opção selecionada de
  `#selHipoteseLegal` (texto) como `hipoteseLegal`; caso contrário `null`.
- `extrairAssuntos`: mapeia `#selAssuntos option` para `.textContent.trim()`, ignora vazios. Lista vazia
  se não houver select.
- `extrairObservacao`: `.value.trim()` de `#txaObservacoes`; string vazia se não existir.
- `extrairEspecificacao`: `.value.trim()` de `#txtDescricao`; string vazia se não existir.

⚠️ **Seletores baseados nos nomes de campo que o Sei Pro usa para essa mesma tela — não confirmados
contra uma instância SEI real.** Mesmo tratamento de risco já aplicado a `extrairAtribuicao` neste mesmo
arquivo: funções testadas com HTML construído manualmente, sinalizadas como pendentes de validação manual.

### `content-scripts/procedimento_visualizar/index.ts`

- `montarPainelTipoEInteressados` ganha 4 blocos novos (um por campo), cada um seguindo o padrão já usado
  pelas seções existentes: `container.appendChild(criarSeparador(titulo))` + um ou mais `<p>` com o texto
  extraído. Sem ícones novos, sem toggle individual — mesmo estilo visual simples das seções de Tipo e
  Interessados já existentes (não o visual com ícones azuis do Sei Pro original).
- Campo vazio (ex. processo sem assuntos, sem observação) não gera erro nem "quebra" o layout — a seção
  aparece com um texto neutro (`"Nenhum assunto especificado."` / `"Sem observação."` / etc., mesma
  convenção já usada em `renderizarInteressados` pra lista vazia) em vez de ficar em branco sem explicação.
- Ordem de exibição no painel: Tipo → Nível de Acesso → Especificação → Assuntos → Interessados →
  Observação → Atribuição (Nível de Acesso e Especificação entram logo após Tipo por serem os campos mais
  "identificadores" do processo; Observação fica perto de Atribuição por serem ambos ligados à unidade
  atual).

## Fora de escopo

- Marcador, edição inline, observações de todas as unidades (ver decisões acima).
- Acompanhamento Especial e Bloco Interno (presentes no Sei Pro original mas não pedidos pelo usuário).
- Qualquer mudança no fetch existente (`fetchText`, `extrairUrlEdicaoProcesso`) — só consome o `doc` que
  ele já retorna.

## Testes

Novos casos em `painelLateral.test.ts` para as 4 funções (HTML construído via `DOMParser`, mesmo padrão
dos testes existentes no arquivo): `extrairNivelAcesso` (público, restrito com hipótese legal, sigiloso,
ausente), `extrairAssuntos` (lista normal, vazia, ausente), `extrairObservacao`/`extrairEspecificacao`
(presente, vazio, ausente). Wiring em `procedimento_visualizar/index.ts` sem teste automatizado, mesmo
padrão já estabelecido no projeto — verificado via `tsc --noEmit`/`bun run test`/`bun run build` e depois
validação manual numa instância SEI real (confirmar os 4 novos campos + que os seletores batem com o HTML
de verdade da tela Consultar/Alterar Processo).
