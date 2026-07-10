# SEIRMG — Lote G2 (parcial): painel lateral do processo + arrastar-e-soltar para documento externo

> Spec resultante de brainstorming em 2026-07-10 (incluindo sessão com companheiro visual pra
> escolher o layout do painel lateral). Cobre uma parte do item "G2 — Visualização de processo:
> recursos de alto risco" do roadmap (`docs/ROADMAP-LOTES.md`): painéis de Tipo do
> processo/Interessados/Atribuição na lateral, mais o arrastar-e-soltar de arquivo pra criar
> documento externo. **Fora desta spec** (permanecem no roadmap para o futuro, não reabertos
> aqui): usar documento como modelo, abrir documento em nova aba, copiar link/número.

## Contexto

O Sei++ original tem, na tela de visualização de processo (`procedimento_visualizar`), uma
área lateral (o mesmo `#container` onde o SEIRMG já mostra "Processos relacionados" e, desde
hoje, o card do Planka e o painel de Anotações) com painéis extras: Tipo do processo,
Interessados e Atribuição — lidos via `consultarInteressado.js`/`consultarAtribuicao.js`. Tem
também, num módulo separado (`dropzone.js`), uma funcionalidade de arrastar um arquivo do SO
sobre a página pra criar automaticamente um documento externo, sem precisar navegar pelos
menus — via uma sequência de 4 chamadas AJAX que reconstrói o fluxo nativo de "Incluir
Documento Externo".

**Nível de risco:** ambas as partes desta spec dependem de regex sobre HTML/`<script>`
gerado dinamicamente pelo SEI — mesma categoria de fragilidade já documentada e aceita no
Lote F (`docs/superpowers/specs/2026-07-07-seirmg-lote-f-acoes-lote-design.md`). Não há como
verificar automaticamente contra uma instância SEI real; a validação final é manual, feita
pelo usuário, mesmo tratamento já usado no Lote F.

## Decisões validadas com o usuário (2026-07-10)

- As duas partes (painel lateral e drag-and-drop) vão numa spec e num plano só, apesar da
  diferença de risco entre elas.
- **Layout do painel lateral** (decidido via companheiro visual, opção C): o card do Planka
  deixa de ser um bloco próprio — sua `localização` e `último comentário` passam a fazer
  parte do painel "Tipo do processo" (como uma pill extra + citação), no lugar de onde hoje
  aparece como card separado. O campo `tipoProcesso` retornado pelo Planka é **descartado**
  nesse contexto (mostrar de novo ao lado do tipo nativo do SEI seria confuso/redundante).
- **Interessados**: só nome + sigla (com botão de copiar a sigla, como no original). A
  sub-busca de endereço/CEP/cidade por interessado (`mostrardetalhesinteressados` no
  original, +2 chamadas AJAX por pessoa) fica de fora por agora.
- **Caixa `ExibirDadosProcesso`** (a caixa maior de Protocolo/Data/Tipo/Especificação que o
  Sei++ original também tem, redimensionando o iframe nativo): **ignorada** — duplica
  informação que o SEI já mostra nativamente e que os painéis simples já cobrem.
- **Configuração do documento externo no drag-and-drop**: reaproveita a
  `DocumentoExternoConfig` já existente (formato/tipo de conferência/nível de
  acesso/hipótese legal — mesma config já usada pelo autopreenchimento de recebimento, Lote
  H) em vez dos valores fixos do Sei++ original (sempre público/nato-digital/sem
  conferência).
- **Tipo de documento (série) no drag-and-drop**: novo campo configurável nas Opções (não
  fixo como no original).
- **Upload do arquivo em si**: roda com `fetch()` direto no content script (fora do session
  gate do background), sem barra de progresso em porcentagem — só um indicador textual
  genérico ("Enviando..."). Justificativa: é uma ação real do usuário na aba real (arrastar
  um arquivo), não uma chamada de fundo/concorrente — mesma categoria seguran de ação já
  aceita para as demais chamadas diretas de content scripts desta extensão; evita a
  complexidade de relay de progresso via `chrome.runtime.sendMessage` (que perderia o
  evento de progresso do XHR/fetch de qualquer forma).

## Parte 1 — Painel lateral em `procedimento_visualizar`

### Arquitetura geral

Novo módulo de lógica pura `src/features/procedimento-visualizar/painelLateral.ts`
(extração/parsing, testável) + wiring em `procedimento_visualizar/index.ts` (fetch, DOM,
`chrome.*` — sem teste direto, mesma política já usada no resto dos content scripts deste
projeto).

Ordem final no `bootstrap()` (mantendo o que já existe, inserindo as partes novas):

```
ajustarElementosNativos()
alterarTitulo()
montarPainelTipoEInteressados()   // NOVO — Tipo do processo (+ Planka) e Interessados
montarPainelAtribuicao()          // NOVO
montarPainelAnotacao()            // já existente, sem mudança de posição relativa
```

`montarPainelPlanka()`/`renderizarCardPlanka()` (adicionados hoje, spec
`2026-07-09-seirmg-lote-o-planka-extensao-design.md`) são **removidos como painel
independente** — a consulta ao Planka (`consultarEExibirPlanka`) passa a alimentar o painel
de Tipo do processo em vez de desenhar seu próprio card. Ver seção "Tipo do processo +
Planka" abaixo.

### Descoberta da URL de edição/consulta do processo

Mesma técnica do original (`consultarInteressado.js`): busca simples de substring (não
regex sobre script) no HTML do `<head>`:

```ts
export function extrairUrlEdicaoProcesso(headHtml: string): string | null {
  const marcadores = ['controlador.php?acao=procedimento_alterar&', 'controlador.php?acao=procedimento_consultar&']
  for (const marcador of marcadores) {
    const inicio = headHtml.indexOf(marcador)
    if (inicio === -1) continue
    const fim = headHtml.indexOf('"', inicio)
    if (fim === -1) continue
    return headHtml.substring(inicio, fim)
  }
  return null
}
```

Content script: `fetchText(new URL(url, window.location.href).href)` (roteado pelo session
gate, igual a todo fetch existente pra `controlador.php`), depois
`new DOMParser().parseFromString(resultado.data, 'text/html')` — mesmo padrão já usado em
`documento_receber/index.ts`/`procedimento_controlar/index.ts`.

### Tipo do processo + Planka

Extração pura (a partir do documento parseado da resposta AJAX):

```ts
export function extrairTipoProcesso(doc: Document): string {
  return doc.querySelector("#selTipoProcedimento option[selected='selected']")?.textContent?.trim() ?? ''
}
```

Renderização: painel "Tipo do processo" com o texto nativo. Se o Planka estiver configurado
e o processo tiver card correspondente (mesma checagem de token/URL já usada hoje —
`tokenValido`, `planka.urlConsulta`, `planka.token` — e mesma consulta individual ao webhook
"Consultar Processo", inalterado), acrescenta dentro do mesmo painel:
- Uma pill de localização (📍, reaproveitando o estilo `.seirmg-planka-pill-localizacao` já
  existente), se `dados.localizacao` não for `null`.
- Um bloco de citação com o último comentário (reaproveitando `.seirmg-planka-comentario`),
  se `dados.ultimoComentario` não for `null`.
- **Não** reaproveita `dados.tipoProcesso` do Planka (descartado, ver decisão acima).

Isso significa que `src/content-scripts/shared/plankaCard.ts` (criado hoje mais cedo) muda de
uso: em vez de `montarConteudoCardPlanka` gerar as duas pills + citação como bloco autônomo,
`procedimento_visualizar` passa a pedir só a pill de localização e a citação, sem a pill de
tipo. A função ganha uma variante ou um parâmetro pra omitir a pill de tipo — decisão de
implementação, detalhada no plano.

### Interessados

Extração pura:

```ts
export interface InteressadoExtraido {
  id: string
  nome: string
  sigla: string
}

export function extrairInteressados(doc: Document): InteressadoExtraido[] {
  return Array.from(doc.querySelectorAll('#selInteressadosProcedimento option')).map((option) => {
    const texto = option.textContent ?? ''
    const match = /^(.*) \((.*)\)$/.exec(texto)
    return {
      id: option.getAttribute('value') ?? '',
      nome: (match?.[1] ?? texto).trim(),
      sigla: (match?.[2] ?? '').trim(),
    }
  })
}
```

Renderização: painel "Interessado(s)" — lista de `👤 Nome (SIGLA)` com um ícone de copiar ao
lado da sigla (`navigator.clipboard.writeText`, com um pequeno tooltip "Copiado!" que some
depois de ~1s, replicando a UX do original). Se a lista vier vazia, mostra "Nenhum
interessado especificado." (mesma mensagem do original).

### Atribuição

Sem chamada de rede — lê dados já presentes na página real.

```ts
export function obterUnidadeAtual(seiVersionAtLeast4: boolean, doc: Document): string | null {
  if (seiVersionAtLeast4) {
    return doc.querySelector('#lnkInfraUnidade')?.textContent?.trim() ?? null
  }
  const select = doc.querySelector<HTMLSelectElement>("select[name='selInfraUnidades']")
  return select?.selectedOptions[0]?.textContent?.trim() ?? null
}

export interface DadosAtribuicao {
  sigiloso: boolean
  usuarios: Array<{ nome: string; login: string }>
  mais?: number
}

export function extrairAtribuicao(scriptHtml: string, unidadeAtual: string): DadosAtribuicao | null {
  if (!/^Nos\[0\]\.html = 'Processo aberto/m.test(scriptHtml)) return null

  const rUsuarios = /^Nos\[0\]\.html = '(.*)';/m.exec(scriptHtml)
  if (!rUsuarios) return null
  const html = rUsuarios[1]

  if (/(Processo aberto nas unidades:|Processo aberto somente na unidade)/m.test(html)) {
    const regex = new RegExp(String.raw`(?<=<a alt=".*" title=".*" class="ancoraSigla">)${unidadeAtual}<\/a>(.*?)[.]?<br \/>`, 'm')
    const resultado = regex.exec(html)
    if (!resultado) return null
    const regexUsuario = /\(atribuído para <a alt=".*" title="(.*?)" class="ancoraSigla">(.*?)<\/a>\)/m
    const resultadoUsuario = regexUsuario.exec(resultado[1])
    if (!resultadoUsuario) return { sigiloso: false, usuarios: [] }
    return { sigiloso: false, usuarios: [{ nome: resultadoUsuario[1], login: resultadoUsuario[2] }] }
  }

  if (/(Processo aberto com os usuários:|Processo aberto somente com o usuário)/m.test(html)) {
    const regex = /(?<=<a alt=".*?" title="(.*?)" class="ancoraSigla">(.*?))(?=<\/a>&nbsp;\/&nbsp;<a alt=".*?" title=".*?" class="ancoraSigla">(.*?)<\/a>)/g
    const usuarios: Array<{ nome: string; login: string }> = []
    let mais = 0
    let m: RegExpExecArray | null
    while ((m = regex.exec(html)) !== null) {
      if (m.index === regex.lastIndex) regex.lastIndex++
      const [, nome, login, unidade] = m
      if (unidade === unidadeAtual) usuarios.push({ nome, login })
      else mais++
    }
    return { sigiloso: true, usuarios, mais }
  }

  return null
}
```

(Portado quase literalmente do original — a lógica de regex é a mesma, só formatada/tipada
pro TypeScript deste projeto. Ver `consultarAtribuicao.js` pro código-fonte original.)

Content script: encontra a `<script>` com `var objArvore` no `document.querySelectorAll('script')`
atual (já está na página, sem fetch nenhum), chama `extrairAtribuicao(scriptTag.innerHTML, unidadeAtual)`.
Se retornar `null`, o painel simplesmente não aparece (processo não está aberto em nenhuma
unidade visível, ou a estrutura não bateu — mesmo comportamento silencioso do resto da
integração).

Renderização: painel "Atribuído para" (ou "Credencial para" se `sigiloso`) — lista de
`👤 login` (com `title` mostrando nome completo + unidade), "(processo sem atribuição)" em
vermelho se a lista vier vazia, "+N mais" se sigiloso e houver mais usuários em outras
unidades.

## Parte 2 — Arrastar-e-soltar para documento externo

### Arquitetura geral

Novo módulo de lógica pura `src/features/procedimento-visualizar/dropzone.ts` (as regexes
de extração de URL/dados + montagem do corpo do POST final, testável) + wiring em
`procedimento_visualizar/index.ts` (drag/drop listeners, overlay visual, orquestração das 4
chamadas — sem teste direto).

### Fluxo (adaptado do `dropzone.js` original)

1. **Overlay de arraste**: listeners de `dragenter`/`dragover`/`dragleave`/`drop` na
   `window`, mostrando um overlay full-screen ("Arraste aqui...") só quando
   `dataTransfer.types` inclui `'Files'`. Ao soltar, para cada arquivo:
2. **Passo 1 — achar a página de Incluir Documento**: regex sobre a `<script>` que contém
   `Nos[0].acoes = '<a href="..." tabindex="451"'` (mesma regex do original, mesma
   fragilidade documentada — se não encontrar, aborta esse arquivo com erro registrado).
   `fetchText` (session gate) na URL encontrada.
3. **Passo 2 — achar o link "Externo"**: regex sobre a resposta do passo 1
   (`href="..." tabindex="1003" class="ancoraOpcao"> Externo</a>`). `fetchText` na URL
   encontrada.
4. **Passo 3 — enviar o arquivo**: regex sobre a resposta do passo 2 pra achar a URL de
   upload (`objUpload = new infraUpload('frmAnexos','...')`). `fetch()` **direto** (fora do
   gate, ver decisão acima) com `FormData` (`filArquivo`). Ao terminar, regex sobre a MESMA
   resposta do passo 2 pra achar usuário/unidade (`objTabelaAnexos.adicionar([...])`), monta
   a string `hdnAnexos` (mesmo formato `id±nome±dthora±tamanho±tamanhoFormatado±usuario±unidade`
   do original).
5. **Passo 4 — montar e enviar o formulário final**: extrai campos ocultos da resposta do
   passo 2 (`hdnInfraTipoPagina`, `selSerie`, `hdnStaDocumento`,
   `hdnIdUnidadeGeradoraProtocolo`, `hdnIdProcedimento`, `hdnIdTipoProcedimento`,
   `hdnSinBloqueado`), monta o corpo do POST com esses campos + os campos configuráveis
   (formato/conferência/nível de acesso/hipótese legal da `DocumentoExternoConfig`, tipo de
   documento do novo campo de Opções, nome do documento = nome do arquivo sem extensão,
   truncado em 49 caracteres, data = hoje) + `hdnAnexos` do passo 3. `fetchText` (session
   gate) POST na URL de envio (`form#frmDocumentoCadastro`'s `action`).
6. **Verificação de sucesso**: como o `fetch`/`fetchText` não detecta redirect (302) da
   mesma forma que o `$.ajax` original, verifica se a resposta contém
   `<div id="divArvoreHtml">` (mesmo marcador do original) pra confirmar que voltou pra
   página do processo em vez de uma página de erro.
7. **Ao terminar todos os arquivos** (sucesso ou erro): se algum falhou, `alert()` listando
   os nomes (mesmo comportamento do original); `location.reload()` sempre, pra refletir os
   novos documentos na árvore nativa.

### Funções puras propostas (`src/features/procedimento-visualizar/dropzone.ts`)

```ts
export function extrairUrlIncluirDocumento(scriptsHtml: string): string | null
export function extrairUrlDocumentoExterno(respostaHtml: string): string | null
export function extrairUrlUpload(respostaHtml: string): string | null
export function extrairUsuarioEUnidade(respostaHtml: string): { usuario: string; unidade: string } | null
export function montarHdnAnexos(usuarioEUnidade: { usuario: string; unidade: string }, uploadIdentificador: string): string
export function extrairCamposFormularioDocumento(respostaHtml: string): Record<string, string | undefined>
export function escolherOpcaoTipoDocumento(opcoes: Array<{ texto: string; valor: string }>, tipoPadrao: string): string
export function montarCorpoDocumentoExterno(campos: {...}, config: DocumentoExternoConfig, tipoDocumentoPadrao: string, nomeArquivo: string, dataHojeStr: string): URLSearchParams
export function respostaIndicaSucesso(respostaHtml: string): boolean
```

(Assinaturas exatas e corpo completo de cada função — parte do plano de implementação, não
desta spec; o comportamento de cada uma replica a contraparte já detalhada no
`dropzone.js` original citado acima.)

### Armazenamento e Opções

`DocumentoExternoConfig` (`src/lib/storage.ts`) ganha um campo novo:

```ts
export interface DocumentoExternoConfig {
  ativo: boolean
  formato: FormatoDocumento
  tipoConferencia: string
  nivelAcesso: NivelAcessoDocumento
  hipoteseLegal: string
  tipoDocumentoPadraoArrastar: string // NOVO
}
```

Default: `'Anexo'` (mesmo valor padrão do original). `src/options/index.html`'s aba "Editor
de Documentos" ganha um novo campo de texto (nova seção "Arrastar e Soltar", abaixo da
seção "Autopreencher Documento Externo" já existente) — mesmo padrão de leitura/gravação já
usado pelos outros 4 campos dessa aba.

## Testes

Segue o padrão já estabelecido no projeto: lógica pura em `src/features/` testada via
Vitest (todas as funções listadas acima, tanto do painel lateral quanto do dropzone, ganham
testes cobrindo casos normais + estrutura inesperada retornando `null`/vazio). Wiring de
DOM/`chrome.*`/`fetch` nos content scripts não tem teste automatizado direto, protegido por
try/catch em cada função de entrada (mesma política já aplicada em todo o projeto,
documentada como política obrigatória desde o Plano 1).

## Fora de escopo

- Sub-busca de endereço/CEP por interessado (`mostrardetalhesinteressados`).
- Caixa `ExibirDadosProcesso` (Protocolo/Data/Tipo/Especificação redimensionando o iframe).
- Usar documento como modelo, abrir documento em nova aba, copiar link/número — permanecem
  no roadmap (`docs/ROADMAP-LOTES.md`, item G2) para uma spec futura.
- Barra de progresso em porcentagem no upload — só indicador textual genérico.
- Qualquer mudança no workflow "Consultar Processo" do Planka ou no popover já implementado
  em `procedimento_controlar` (Controle de Processos) — este documento só afeta o card em
  `procedimento_visualizar`.
