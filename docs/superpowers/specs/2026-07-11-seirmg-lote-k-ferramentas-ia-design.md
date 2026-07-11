# SEIRMG — Lote K: Ferramentas de IA no editor de documentos

> Spec resultante de brainstorming em 2026-07-11. Cobre o item "Lote K — Ferramentas de IA"
> do roadmap (`docs/ROADMAP-LOTES.md`): integração com ChatGPT (OpenAI), Gemini (Google),
> Claude (Anthropic) e JusIA (Jusbrasil) a partir do editor de documentos do SEI.

## Contexto

O Sei Pro original (`sei-pro-ai.js`, ~2200 linhas) integra ChatGPT e Gemini no editor de
documentos via **API oficial paga** (chave de API do próprio usuário, cadastrada em
`platform.openai.com`/`aistudio.google.com/app/apikey`), nunca via automação da sessão
web de consumidor — confirmado lendo o código-fonte (`api.openai.com`,
`generativelanguage.googleapis.com`, sem nenhum vestígio de scraping/automação de
`chat.openai.com`/`gemini.google.com`). Essa spec estende esse mesmo padrão pra incluir
Claude (Anthropic, também tem API oficial) e adiciona o JusIA (Jusbrasil), que **não tem
API pública documentada pra terceiros** (confirmado via pesquisa — `ia.jusbrasil.com.br`,
assinatura mensal paga, produto de consumidor).

**NotebookLM (Google) foi avaliado e descartado desta spec**: não tem chave de API simples
como as outras três — só a NotebookLM Enterprise API (Google Cloud, autenticação OAuth 2.0
via projeto GCP, não uma chave que se cola nas Opções) ou bibliotecas não-oficiais que
automatizam a conta de consumidor (mesmo problema de ToS já descartado). Usuário optou por
deixar de fora por enquanto — pode virar item separado no futuro se a API Enterprise fizer
sentido pro órgão.

## Decisão de princípio: nunca automatizar sessão de consumidor

**Não será implementada nenhuma forma de usar "a assinatura sem API"** (login automatizado,
leitura/simulação da conversa dentro de `chat.openai.com`/`gemini.google.com`/`claude.ai`/
`ia.jusbrasil.com.br`). Isso violaria os Termos de Uso desses serviços (automação de conta
de consumidor fora da API oficial), arrisca suspensão da conta do usuário, e — no caso de
login com usuário/senha dentro da extensão — adicionaria um risco de segurança sério
(armazenamento de credenciais de terceiros). Essa decisão foi validada explicitamente com o
usuário e não deve ser reaberta sem nova conversa explícita.

## Decisões validadas com o usuário (2026-07-11)

- **Dois modos de integração, por provedor:**
  - **API oficial** (ChatGPT/OpenAI, Gemini/Google, Claude/Anthropic — todos têm API
    documentada): chave de API do próprio usuário, cadastrada nas Opções; resposta volta
    direto pro editor do SEI.
  - **Link de atalho** (JusIA — sem API pública disponível pro usuário): copia o texto
    selecionado pra área de transferência e abre `https://ia.jusbrasil.com.br` numa aba
    nova; o usuário cola manualmente lá. Sem automação, sem chave, sem resposta trazida de
    volta pro SEI.
- **Três modos de uso no editor** (todos usando o texto selecionado no CKEditor como
  entrada, exceto onde indicado):
  1. **Prompt livre** — usuário digita qualquer pergunta/instrução sobre o texto
     selecionado (ou, se nada selecionado, sobre o documento inteiro).
  2. **Prompts prontos** — botões pra ações comuns sobre o texto selecionado: resumir,
     revisar/corrigir português, deixar mais formal (lista fechada nesta spec, ver
     Arquitetura).
  3. **Redigir a partir de instrução** — usuário descreve o que quer (sem precisar de texto
     selecionado) e a IA gera um trecho novo.
- **Segurança/sigilo — confirmação explícita, não detecção automática como única trava:**
  toda vez que o painel de IA for aberto, o usuário precisa marcar um checkbox
  ("Confirmo que este documento não é sigiloso/restrito") antes de poder enviar qualquer
  coisa — é a camada confiável, porque só o usuário sabe com certeza. Detecção automática
  via DOM (ícone de restrição na árvore) entra como **bloqueio adicional quando detectável
  com confiança**, nunca como a única trava (evita falha silenciosa se a detecção quebrar
  numa versão/skin diferente do SEI).
- **Resposta sempre em pré-visualização** — nunca insere automaticamente no documento; o
  usuário revisa e só clica "Inserir" se quiser aplicar.
- **Opções da extensão** ganham uma seção nova pra configurar tudo: ativar/desativar o
  recurso inteiro, chave de API + modelo por provedor (OpenAI/Gemini/Claude), provedor
  ativo (com troca rápida no próprio painel do editor, mesmo padrão do Sei Pro original).

## Arquitetura

### Armazenamento

Novo campo em `src/lib/storage.ts`, `SyncConfig.ferramentasIA`:

```ts
export type ProvedorIA = 'openai' | 'gemini' | 'claude'

export interface ProvedorIAConfig {
  apiKey: string
  modelo: string
}

export interface FerramentasIAConfig {
  ativo: boolean
  provedorAtivo: ProvedorIA
  openai: ProvedorIAConfig
  gemini: ProvedorIAConfig
  claude: ProvedorIAConfig
}
```

Default: `{ ativo: false, provedorAtivo: 'openai', openai: { apiKey: '', modelo: 'gpt-4o-mini' }, gemini: { apiKey: '', modelo: 'gemini-2.0-flash' }, claude: { apiKey: '', modelo: 'claude-3-5-haiku-20241022' } }`
— opt-in por padrão (`ativo: false`), mesmo precedente de `favoritos`/`rolagemInfinita`: recurso que muda a tela estruturalmente (novo botão no editor) e tem implicação de custo/privacidade real, não é aditivo neutro.

Modelo é um campo de texto livre nas Opções (não um dropdown alimentado por uma chamada
"listar modelos" à API, ao contrário do Sei Pro original) — YAGNI: menos uma chamada de
rede e uma superfície de erro a menos na v1; o usuário cola o nome exato do modelo que
quiser usar (placeholder com um exemplo razoável por provedor).

JusIA não precisa de configuração (sem chave, sem modelo) — sempre disponível quando
`ferramentasIA.ativo` estiver ligado.

### Chamadas às APIs — relay pelo background (mesmo padrão de `MensagemFetchSei`)

Content scripts rodam no contexto de origem da página SEI, sujeitos à política de CORS
dessa página — chamar `api.openai.com`/`generativelanguage.googleapis.com`/
`api.anthropic.com` diretamente de lá não é confiável. Reaproveita o padrão já existente em
`src/background/index.ts` (`MensagemFetchSei`/`fetchTextComGate`, usado hoje só pro SEI):
novo tipo de mensagem `seirmg:fetch-ia` tratado no background, que faz o `fetch()` real
(background tem `host_permissions` e não está sujeito à mesma política de CORS da página) e
devolve o resultado pro content script.

**Importante — isso é uma chamada de rede completamente diferente da questão de
auto-logout do SEI** (ver [[project-seirmg-hardening]]): vai pra `api.openai.com`/
`generativelanguage.googleapis.com`/`api.anthropic.com`, nunca pra `controlador.php` — não
compete com a sessão do SEI, não precisa passar pelo `sessionGate`.

`manifest.config.ts` ganha os três hosts em `host_permissions` (fixos, conhecidos — ao
contrário do Planka, que é host configurável pelo usuário via `optional_host_permissions`):

```ts
host_permissions: [
  '*://*.br/*controlador.php?acao=*',
  '*://*.org/*controlador.php?acao=*',
  'https://api.openai.com/*',
  'https://generativelanguage.googleapis.com/*',
  'https://api.anthropic.com/*',
],
```

### Content script novo: editor de documento

Não existe hoje nenhum content script pra tela de edição de documento (CKEditor) — é o
primeiro. Sem um `acao=` único e estável conhecido pra esse content script mirar
especificamente (SEI tem `acao=` diferente por tipo de documento), segue o mesmo padrão já
usado pelo `core` (match amplo, `*controlador.php?acao=*`) e detecta a presença do editor
via polling do global `CKEDITOR` (mesma técnica que o Sei Pro original usa em
`sei-pro-editor.js`, com `setTimeout`/tentativas, sem `acao=` fixo):

```ts
function esperarCKEditor(callback: () => void, tentativasRestantes = 30): void {
  if (typeof (window as unknown as { CKEDITOR?: unknown }).CKEDITOR !== 'undefined') {
    callback()
    return
  }
  if (tentativasRestantes <= 0) return
  setTimeout(() => esperarCKEditor(callback, tentativasRestantes - 1), 200)
}
```

Ao detectar o CKEditor, insere um botão próprio na barra de ferramentas (mesmo padrão de
inserção de elementos já usado no resto do projeto — sem plugin nativo do CKEditor, só DOM
direto), que abre o painel de IA (ver abaixo).

### Painel de IA (UI)

Um diálogo (mesmo padrão visual leve já usado em outros painéis da extensão — não usa o
sistema de diálogo nativo do CKEditor 4, que é mais pesado de integrar) com:

1. **Seletor de provedor** — abas ou botões pra ChatGPT/Gemini/Claude/JusIA. Só mostra
   provedores com chave configurada (API) + sempre mostra JusIA (não precisa de chave).
   Lembra o último provedor usado (`provedorAtivo`). Ícones oficiais aprovados via mockup
   visual: OpenAI (`openai.svg`), Gemini (`gemini-color.svg`) e Claude (`claude-color.svg`)
   vêm do pacote **`@lobehub/icons-static-svg`** (MIT, licenciado pra esse uso — mesmo
   padrão de import `?raw` já usado com `lucide-static`), embutidos no bundle. **JusIA não
   tem pacote de ícones disponível** (produto brasileiro nichado, sem licença clara pra
   bundlar o logo) — usa `<img src="https://ia.jusbrasil.com.br/favicon.ico">` carregado ao
   vivo do próprio site deles, nunca copiado pro nosso código.
2. **Checkbox obrigatório**: "Confirmo que este documento não é sigiloso/restrito" — os
   controles de envio (botão "Perguntar"/"Gerar"/"Ir pro JusIA") ficam desabilitados até
   marcar.
3. **Bloqueio adicional (best-effort)**: se o content script conseguir localizar, pra o
   documento atualmente aberto, um ícone de restrição de acesso na árvore do processo
   (mesmo padrão visual já visto — `<a id="anchorNA{id}">` com `<img title="Acesso
   Restrito"...>`, ver spec do painel de Favoritos pra precedente de leitura de ícone
   nativo), o painel inteiro mostra um aviso e desabilita o envio mesmo com o checkbox
   marcado — texto claro de que é uma detecção best-effort, não incentivar o usuário a
   confiar cegamente nela quando ausente.
4. **Três abas de modo** (só pra provedores de API — JusIA não tem essas abas, só o botão
   de abrir):
   - **Prompt livre**: caixa de texto + botão "Perguntar".
   - **Prompts prontos**: botões fixos — "Resumir", "Revisar/corrigir português", "Deixar
     mais formal" — cada um monta um prompt fixo internamente (não editável nesta v1)
     usando o texto selecionado. Exigem seleção — ficam desabilitados (com dica explicando
     por quê) se nada estiver selecionado no editor.
   - **Redigir a partir de instrução**: caixa de texto (instrução) + botão "Gerar" — se
     houver texto selecionado no editor, entra como contexto junto da instrução (prompt
     monta algo como "Com base neste trecho: {seleção}. {instrução}"); se não houver
     seleção, envia só a instrução — funciona nos dois casos, ao contrário dos prompts
     prontos (que exigem seleção).
5. **Pré-visualização da resposta** — aparece depois que a IA responde, com botões
   "Inserir" (substitui a seleção atual do editor pelo texto gerado, ou insere no cursor se
   nada estava selecionado) e "Descartar".

Pra JusIA, o botão "Ir pro JusIA" (dentro do mesmo painel, sem as três abas de modo)
copia o texto selecionado (`navigator.clipboard.writeText`, chamado dentro do handler de
clique — user gesture válido) e abre `https://ia.jusbrasil.com.br` (`window.open`, também
gesture válido) — sem chamada de rede nossa, sem resposta trazida de volta.

### Fluxo de uma chamada de API (ChatGPT/Gemini/Claude)

1. Usuário marca o checkbox de confirmação, escolhe modo, escreve prompt/instrução (ou usa
   prompt pronto), clica enviar.
2. Content script monta o corpo da requisição no formato do provedor ativo (cada provedor
   tem formato de request/response próprio — módulo `features/ferramentas-ia/` com um
   adaptador por provedor, função pura `montarRequisicao(provedor, modelo, prompt, apiKey):
   { url, method, headers, body }` e `extrairResposta(provedor, corpoResposta): string |
   null`, testáveis sem rede).
3. Envia `seirmg:fetch-ia` pro background com a requisição montada.
4. Background faz o `fetch()` real, devolve `{ ok, status, body }`.
5. Content script chama `extrairResposta`, mostra na pré-visualização.

### Opções

Nova seção "Inteligência Artificial" em `src/options/index.html` (mesmo padrão das
seções existentes — checkbox de ativação + campos por provedor):

```html
<section id="painel-ia" class="painel">
  <h2>Inteligência Artificial</h2>
  <label>
    <input type="checkbox" id="ia-ativo" />
    Ativar ferramentas de IA no editor de documentos
  </label>
  <br />
  <h3>ChatGPT (OpenAI)</h3>
  <label>Chave de API: <input type="password" id="ia-openai-key" /></label>
  <label>Modelo: <input type="text" id="ia-openai-modelo" placeholder="gpt-4o-mini" /></label>
  <h3>Gemini (Google)</h3>
  <label>Chave de API: <input type="password" id="ia-gemini-key" /></label>
  <label>Modelo: <input type="text" id="ia-gemini-modelo" placeholder="gemini-2.0-flash" /></label>
  <h3>Claude (Anthropic)</h3>
  <label>Chave de API: <input type="password" id="ia-claude-key" /></label>
  <label>Modelo: <input type="text" id="ia-claude-modelo" placeholder="claude-3-5-haiku-20241022" /></label>
  <button id="ia-salvar">Salvar</button>
  <span id="ia-status"></span>
</section>
```

Campos de chave usam `type="password"` (mesmo tratamento visual de segredo, ainda que
guardado em `chrome.storage.sync` sem criptografia adicional — mesmo nível de proteção já
aceito pra outros segredos deste projeto, ex. token do Planka).

## Testes

Lógica pura testável em `src/features/ferramentas-ia/`:
- `montarRequisicao(provedor, modelo, prompt, apiKey)` — um caso por provedor (formatos de
  request diferentes entre OpenAI/Gemini/Claude).
- `extrairResposta(provedor, corpoResposta)` — extração do texto de cada formato de
  resposta, incluindo caso de erro/resposta vazia.
- Prompts prontos (resumir/revisar/formal) como funções puras que recebem o texto
  selecionado e devolvem o prompt montado — testáveis sem DOM.

Wiring de DOM (botão no editor, painel, checkbox, chamada ao background) sem teste direto,
mesma política já aplicada ao resto do projeto.

## Riscos / verificação pendente

- **Inserção do botão na barra de ferramentas do CKEditor 4** e **substituição de texto
  selecionado via API do CKEditor** (`editor.insertHtml`/`getSelection`) não foram
  verificadas contra uma instância SEI real — mesmo tratamento de risco já documentado no
  Lote F (regex sobre estrutura gerada pelo SEI). Plano de implementação deve marcar isso
  como pendente de validação manual.
- **Detecção do ícone de restrição de acesso pro documento atualmente aberto** (correlação
  entre o documento sendo editado e o nó correspondente na árvore) é best-effort — pode não
  detectar em todo caso real; por isso não é a única trava (ver checkbox obrigatório).
- **Nomes de modelo** (`gpt-4o-mini`, `gemini-2.0-flash`, `claude-3-5-haiku-20241022`) são
  só placeholders/defaults razoáveis no momento da spec — provedores mudam nomes de modelo
  com frequência; campo de texto livre evita a extensão ficar presa a uma lista
  desatualizada.

## Fora de escopo

- Qualquer automação/scraping de `chat.openai.com`/`gemini.google.com`/`claude.ai`/
  `ia.jusbrasil.com.br`/`notebooklm.google.com` (decisão de princípio, ver seção acima) —
  não reabrir sem conversa explícita nova.
- **NotebookLM** — avaliado e descartado (ver Contexto): sem chave de API simples, só
  Enterprise/OAuth via projeto GCP. Pode virar item separado no futuro.
- Histórico de conversas/múltiplas rodadas (cada uso do painel é uma chamada isolada,
  sem contexto de conversa anterior).
- Prompts prontos customizáveis pelo usuário (lista fixa nesta v1 — resumir/revisar/
  formal).
- Streaming de resposta (resposta chega inteira de uma vez, sem exibição incremental).
- Campos dinâmicos/variáveis de processo nos prompts (ex. auto-preencher número do
  processo no prompt) — os ~30 campos dinâmicos do Lote J ficam de fora daqui.
- Detecção de nível de acesso na tela de Controle de Processos ou em qualquer lugar fora
  do editor — escopo restrito à tela de edição de documento.
