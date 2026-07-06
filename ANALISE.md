# SEIRMG — Relatório de Análise (Etapa 1 + Etapa 1.5)

> Gerado antes de qualquer código do projeto novo. Cobre: mapeamento de `seiplus` (Sei++) e `seipro` (Sei Pro), comparação de funcionalidades, conflitos de unificação, e recomendação de stack tecnológica.
>
> **Nota de transparência metodológica**: a análise do Sei++ foi feita por leitura completa de código (projeto pequeno, 104 arquivos). A análise do Sei Pro combinou leitura de código real para os arquivos centrais (manifest, `init*.js`, `sei-pro.js`, `sei-pro-all.js`, `sei-pro-arvore.js`, `background.js`, `options.js`, CSS, libs) com a documentação oficial de features do próprio projeto (pasta `pages/*.md`, 80 arquivos, usada para a landing page do produto) para os módulos maiores ainda não lidos byte-a-byte (`sei-pro-editor.js`, `sei-pro-atividades.js`, `sei-pro-favoritos.js`, `sei-pro-docs-lote.js`, `sei-pro-projetos.js`, `sei-pro-prescricoes.js`, `sei-pro-ai.js`, `sei-legis.js`). Onde isso se aplica, o item é marcado **[doc]** em vez de **[código]**. O ponto mais crítico para este projeto — se existe monitoramento de bloco de assinatura com notificação nativa — foi confirmado por leitura direta de código (grep + leitura de trecho completo) em ambos os projetos.

---

## 1. Sei++ (`C:\sei\seiplus`)

### 1.1 Manifest

- **manifest_version**: 3
- **version**: 6.0.1 · **name**: SEI++
- **permissions**: `storage`, `notifications`, `alarms`
- **host_permissions**: `*://*.br/*controlador.php?acao=*`
- **background**: `service_worker: background/background.js`, `type: "module"` (ESM real no service worker)
- **action**: popup `browser_action/index.html`, ícone único 48px
- **options**: não há `options_page`/`options_ui` no manifest — a tela de opções é uma página **injetada dentro do próprio SEI** (content script em `infra_configurar`)
- **content_scripts**: 14 blocos, cada um mapeado a uma tela/ação específica do SEI (`core` roda em `document_start`/`document_end`/`document_idle` como infraestrutura comum; os demais são por `acao=`)
- **commands** (atalhos nativos): nenhum
- Um único `manifest.json` gera as duas variantes (Chrome/Firefox) via script de build com `jq` (remove `background.scripts` ou `background.service_worker`)
- jQuery 3.7.1 e jQuery UI 1.14.1 são **vendorizados via `node_modules`** e injetados como content script estático (não é bundle)

### 1.2 Funcionalidades (arquivo → o que faz)

| Funcionalidade | Arquivo | O que faz |
|---|---|---|
| Notificação de processos novos | `background/notifyProcessos.js` | `chrome.alarms` (5 min) + scraping da tela de Controle de Processos via `fetch`+`DOMParser`; dispara `chrome.notifications` quando há processo não visualizado; badge no ícone da extensão; detecta sessão expirada |
| Popup da extensão | `browser_action/main.js` | Mostra status do serviço de notificação e atalho para Controle de Processos |
| Biblioteca comum / bootstrap | `core/start/lib.js`, `core/end/*.js` | Detecção de browser, opções padrão, `ModuleInit` (roteador chamado por quase todo módulo), versão do SEI, tema, autopreencher senha no login |
| **Bloco de assinatura — badge de status** | `core/idle/verificarBlocoAssinatura.js` | Lê o link do bloco de assinatura no menu, faz `$.get` + parse da tabela, classifica por status (Disponibilizado/Aberto/Retornado/Recebido) e injeta ícone colorido com contagem ao lado do logo. **Síncrono, uma vez por carregamento de página — não é monitor em background** |
| **Bloco de assinatura — seleção em massa** | `rel_bloco_protocolo_listar/selecionarDocumentosAssinar.js` | Botões "Sem minha assinatura"/"Com minha assinatura"/etc. para marcar checkboxes em massa na tela do bloco |
| Forçar reabertura de processo | `documento_receber/forcarReaberturaProcesso.js` | Detecta processo fechado em todas unidades e força confirmação de reabertura |
| Autopreencher recebimento doc. externo | `documento_receber/autopreencherDocumentoExterno.js` | Pré-preenche data/formato/conferência/nível de acesso configuráveis |
| Retirar sobrestamento/reabrir em lote | `lib/retirarSobrestamentoReabrirEmBloco.js` | AJAX em cadeia por processo selecionado |
| Filtro de tabelas / pesquisa | `lib/filtra_processos/*` | Filtro composto (`data-filtro`) + busca "OU" via `[termo1 termo2]` |
| Filtro por atribuição / info de blocos | `procedimento_controlar/filtra_processos/*` | Selects adicionais na tela de Controle de Processos |
| Cálculo de prazos/dias + cores | `procedimento_controlar/incluirCalculoPrazos.js` | Colunas extra com threshold Alerta/Crítico configurável |
| Cor do processo por especificação | `procedimento_controlar/marcarCorProcesso.js` | Colore o link do processo por palavra-chave |
| Especificação na listagem | `procedimento_controlar/mostrarEspecificacao.js`, `listaPorEspecificacao.js` | Mostra/substitui pelo texto da especificação |
| Confirmar antes de concluir em lote | `procedimento_controlar/confirmarAntesConcluir.js` | `confirm()` antes de concluir processos |
| Corrigir tabelas nativas | `procedimento_controlar/corrigirTabelas.js` | Ajusta HTML (thead) |
| Dados do processo/interessados na árvore | `procedimento_visualizar/consultarInteressado.js`, `consultarAtribuicao.js` | Painel de dados via AJAX + parsing de script inline |
| Copiar link/número (SEI < 4) | `procedimento_visualizar/copiarLinkInterno.js`, `copiarNumeroProcessoDocumento.js` | `execCommand('copy')` |
| Usar documento como modelo | `procedimento_visualizar/documentoModelo.js` + `documento_escolher_tipo/*`, `documento_gerar/*` | Salva no storage e pré-seleciona ao gerar novo documento |
| Dropzone → criar documento externo | `procedimento_visualizar/dropzone.js` | Arrastar arquivo do SO cria documento externo (4 chamadas AJAX encadeadas) |
| Anotação estilo post-it | `procedimento_visualizar/mostrarAnotacao.js` | Exibe/edita anotação do processo inline |
| Abrir documento em nova aba | `procedimento_visualizar/abrirDocumentoNovaAba.js` | Ctrl+clique |
| Alterar título da aba | `procedimento_visualizar/alterarTitulo.js` | `document.title` |
| Ajustes visuais nativos | `procedimento_visualizar/ajustarElementosNativos.js` | Esconde seções vazias, estiliza botões |
| Ordenar select de atribuição | `procedimento_atribuicao_cadastrar/ordenarSelect.js` | Ordena alfabeticamente |
| Seleção múltipla (Shift+clique) | `lib/selecionarMultiplosProcessos.js` | Em qualquer tabela de processo |
| Cor de ícone de ponto de controle | `lib/pontoControleCores.js` + `lib/colorToFilter.js` | Filtro CSS gerado por otimização (SPSA) a partir de cor HEX alvo |
| Controle de unidade em lote | `controle_unidade_gerar/index.js` | Seleção múltipla + reabrir/retirar sobrestamento |
| Atualizar anotação na árvore | `anotacao_registrar/atualizarAnotacaoNaArvore.js` | Recarrega iframe da árvore |
| Temas (dark) | `themes/black.css`, `themes/super-black.css` | Aplicados por versão do SEI |
| Tela de opções injetada | `infra_configurar/options_ui.js` | Toda leitura/gravação de configuração |
| Menu: ocultar automaticamente / mover / atalho publicações / link neutro | `core/idle/*.js` | Ajustes de menu lateral e atalhos |
| Onboarding pós-instalação | `core/idle/indicarConfiguracao.js` | Anima ícone de configuração até o usuário abrir opções |

### 1.3 Bibliotecas de terceiros
jQuery 3.7.1, jQuery UI 1.14.1 (runtime, vendorizados via `node_modules`, sem bundler). ESLint 8.57 + `eslint-config-standard` (apenas dev/lint).

### 1.4 Storage (`chrome.storage.local`, único namespace usado)

| Chave | Formato |
|---|---|
| `theme` | `'white'\|'black'\|'super-black'` |
| `CheckTypes` | `string[]` de feature-flags ativas |
| `InstallOrUpdate` | boolean |
| `ConfiguracoesCores` | `{valor, cor}[]` |
| `ConfPrazo`, `ConfDias` | `{Critico, Alerta}` |
| `pontoControleCores` | `{nome, cor, filter}[]` |
| `browserAction` | `{enabled, status, qtdNaoVisualizado}` |
| `baseUrl`, `version`, `linkNeutroControleProcessos`, `moduloFiltraPorAtribuicao` | strings |
| `usardocumentocomomodelo`, `exibeinfoatribuicao`, `filtraporatribuicao`, `formato/tipoConferencia/nivelAcesso/hipoteseLegal`, `incluirDocAoArrastar_TipoDocPadrao` | diversos |
| `seipp.procedimento_visualizar.DocumentoModelo.{documento,descricao}` | strings |

### 1.5 CSS / Design system
Ad-hoc, sem tokens centralizados, prefixo de classe `seipp-`/`seipp_` (inconsistente). Dois temas dark completos que sobrescrevem cores nativas do SEI. Toggle switch customizado na tela de opções.

### 1.6 Atalhos de teclado / IDs injetados
Sem `commands` no manifest. IDs: `#seipp`, `#seipp-div-options-ui`, `#seipp_tipo/interessados/atribuicao`, `#idModalSaida`, `#idRetirarSobrestamento`, `#idSelectTipoBloco`, `#divUnidadesReabertura`, `#detalhes`/`#divInfraBarraLocalizacao`/`#divProtocoloExibir` (⚠️ reaproveita IDs nativos do SEI dentro de container próprio). Classes `.seipp-*`, `.dropzone-*`, `.infraTrseippalerta/critico`.

### 1.7 Build/lint
**Bun** (gerenciador de pacotes e test runner), **sem bundler**, JS puro (ES2020+ ES Modules, sem TypeScript). ESLint (`eslint-config-standard`) com hook de pre-commit. Sem CI (GitHub Actions). Empacotamento via `scripts/make.sh` (bash + `jq` + `zip`).

---

## 2. Sei Pro (`C:\sei\seipro`)

### 2.1 Manifest — **[código]**

- **manifest_version**: 3 · **name/short_name**: "SEI Pro Lab" · **version**: 1.6.1
- **permissions**: apenas `storage` (⚠️ `PRIVACY_POLICY.md` menciona também `activeTab`/`clipboardWrite`, que **não existem** no manifest real — política desatualizada em relação ao código)
- **host_permissions**: não há chave separada; controle via `matches`/`exclude_matches` por bloco de `content_scripts`
- **background**: **ausente** — `dist/background.js` existe no disco mas **não está registrado no manifest** (código morto)
- **content_scripts**: 9 blocos por grupo de telas (páginas principais, login, tela de assinatura, telas de listagem — incluindo `bloco_assinatura_listar` —, árvore, visualização, editor)
- **action**: `default_popup: html/options.html` — clicar no ícone abre direto as opções, sem popup próprio
- **options**: `html/options.html`, `open_in_tab: true`
- **commands**: nenhum
- **web_accessible_resources**: enorme — quase todos os módulos de feature (`sei-pro-*.js`) e dezenas de libs, porque **não são content scripts diretos**: são injetados dinamicamente em runtime via `$.getScript(chrome.runtime.getURL(...))` a partir dos arquivos `init*.js`

### 2.2 Estrutura

`dist/` **é** a fonte real (sem pasta `src/`, sem bundler, sem `package.json`) — os arquivos são editados diretamente e distribuídos como o próprio pacote da extensão. Existe uma pasta `pages/` com **80 arquivos markdown**, um por funcionalidade, usados para gerar a landing page do produto (GitHub Pages, `_config.yml` → tema `jekyll-theme-cayman`). `icons/` tem subpastas de branding por órgão (`antaq`, `antt`, `cfq`, `conab`, `lab`) — **confirmado em código** (`options.js:402-419`) que são builds white-label paralelos a partir do mesmo `dist/`, trocando apenas manifest (nome + ícones). O autor é servidor da ANTAQ (conforme `PRIVACY_POLICY.md`).

### 2.3 Funcionalidades

**Confirmadas por leitura de código real:**

| Funcionalidade | Arquivo | O que faz |
|---|---|---|
| Contador de processos no favicon da aba | `sei-pro.js:1674` + `sei-functions-pro.js:3053` | Desenha número sobre o favicon (lib Favico/canvas) — **por aba, não usa `chrome.action.setBadgeText`, sem polling entre abas** |
| Agrupar lista de processos | `sei-pro-all.js:528`, `sei-pro.js` | Por data recebimento/envio/marcador/tipo/responsável/ponto de controle/unidade |
| Painel de favoritos (base) | `sei-pro.js:1151` | — |
| Exportar CSV | `sei-pro.js:1252+` | — |
| Kanban de processos na home | `sei-pro.js:1758-2160` | via jKanban |
| Controle de prazos (marcador) | `sei-pro.js:2172-2860` | Prazo gravado nas informações do marcador nativo |
| Marcar não visualizado/urgente | `sei-pro.js:2895` | — |
| Upload múltiplo (home) | `sei-pro.js:2911-3080` | Drag-and-drop |
| Rolagem infinita / remover paginação | `sei-pro-all.js:557-620` | — |
| Toolbar/menu rápido da árvore | `sei-pro-arvore.js:51-378` | — |
| Anotação (post-it) na árvore | `sei-pro-arvore.js:1433-1810` | `sticknoteUpdate/sticknoteSave` |
| Numerar documentos na árvore | `sei-pro-arvore.js:2440` | — |
| Redimensionar árvore / dividir linhas | `sei-pro-arvore.js:2279-2421` | — |
| **Alertar documentos não assinados** | `sei-functions-pro.js:3394-3512` (`initCheckNaoAssinados`/`boxCheckNaoAssinados`) | Ao carregar a árvore do processo, filtra documentos nativos com `assinado==false` **na unidade atual** via jmespath e insere aviso em `#divInfraBarraLocalizacao` + diálogo com lista. **Reativo (on-load), não é polling em background, sem `chrome.notifications`** |
| Autopreencher senha (assinatura/login) | `init_pwd.js` (36 linhas) | Ajuste de acessibilidade de formulário — não monitora pendência |
| Modo noturno / modo slim | `sei-functions-pro.js:11668` (`setDarkModePro`) + `css/sei-slim.css` (423 regras `.dark-mode`) | Classe aplicada a múltiplos iframes; persistido em `localStorage` (não sincroniza entre dispositivos) |
| Feature-gating por host (branding institucional) | `sei-functions-pro.js:341`, `init_db.js:9`, `sei-pro-icons.js:26`, `sei-pro-atividades.js:26755` | `getConfigHost()` testa `.sp.gov.br`/`.antt.gov.br` contra `config_hosts.json` |

**Confirmadas por documentação oficial do projeto (`pages/*.md`) — [doc]**, agrupadas por área (arquivo provável entre parênteses, por inferência do bloco de `content_scripts`/`web_accessible_resources`):

*Editor de documentos* (`sei-pro-editor.js`, 8.253 linhas — não lido linha a linha): abrir/editar/remover hiperlinks; equações LaTeX; alinhar texto; aumentar/reduzir fonte; copiar formatação; estilo de tabela/tabela rápida; quebra de página; parágrafos numerados; sumário; nota de rodapé; QR Code; hashcode/verificação de integridade; adicionar link de documento público; link curto (TinyURL); link de legislação federal; **Legística** (enumeração automática de normas + referências cruzadas/externas); primeira letra maiúscula automática; referência interna; referência a documentos do processo; dados do processo com ~30 campos dinâmicos (`#processo`, `#interessados`, etc.); escrita interativa (`#`/`@`); valores padrão ao criar documento; marca d'água de minuta; sigilo/tarjas de confidencialidade + certidão com sigilo (LAI); editar/redimensionar/reduzir qualidade de imagens com editor avançado (crop, filtros, marca d'água); duplicar documento; comparador de documentos; teclas de atalho configuráveis; título da página; URL amigável; salvamento automático; ditado por voz (Web Speech API nativa); revisão de texto; **Ferramentas de IA** (ChatGPT/Gemini, prompts predeterminados, chave de API do próprio usuário).

*Lote*: Ações em Lote (dar ciência/excluir/sigilo/**assinar**/cancelar múltiplos documentos), Documentos em Lote (criação via CSV + campos dinâmicos `##campo##` num documento modelo), Envio múltiplo de documentos externos.

*Home/listagem*: Histórico de processos visitados; informações adicionais na árvore; mostrar nomes de usuários; especificação do processo na listagem; menu suspenso; mover ícone de excluir para o final; reprodução de vídeo no visualizador; ordenar/filtrar tabela ao clicar cabeçalho (persistente); reabertura programada de processos (verificação periódica configurável, default 24h); substituir seleção (caixas inteligentes); cores personalizadas em marcadores; desativar funções individualmente (feature flags on/off).

*Favoritos* (`sei-pro-favoritos.js`): gestão de processos favoritos com etiquetas coloridas, mapas (Leaflet), especificação, categorias, prazo com "edição avançada" (contagem relativa a partir de assinatura/data), export/import — usa **FileSystem API local**, não `chrome.storage`.

*Projetos* (`sei-pro-projetos.js`): Kanban/Gantt (jKanban + Frappe Gantt) com **Google Sheets como backend externo** (OAuth + Google Sheets API configurados pelo próprio usuário/órgão), compartilhamento entre usuários.

*Atividades* (`sei-pro-atividades.js`, **26.773 linhas — o maior arquivo do projeto, e não tem página de documentação em `pages/`**): dashboards e gráficos (Chart.js: linha, pizza, donut, barra, híbrido) de "demandas"/planos de trabalho, painéis kanban de atividades, relatórios, tudo integrado a um **servidor externo próprio** via `getServerAtividades()` — não documentado publicamente, aparenta ser um sistema de gestão de produtividade/PGD à parte, acoplado ao SEI apenas pela UI.

*Prescrições* (`sei-pro-prescricoes.js`, 373 linhas — pequeno, não lido em detalhe, sem página de doc dedicada — provavelmente acoplado ao painel de Prazos).

### 2.4 Bibliotecas de terceiros (com versão, cabeçalho lido)

jQuery 3.4.1 · jQuery UI 1.12.1 · Chart.js 2.9.4 · Chosen 1.8.2 (fork) · Dropzone (s/ versão) · Frappe Gantt (s/ versão, não minif.) · jKanban (s/ versão) · Leaflet 1.7.1 (não minif.) · CKEditor 4.x · Moment.js 2.29.4 · PDF.js (Mozilla) · Mammoth · html2canvas 1.4.1 · JSZip 3.10.0 · PapaParse 5.0.2 · Tesseract.js · Filerobot Image Editor 4.2.0 · diff2html · Favico.js 0.3.10 · **Font Awesome Free 5.15.0** · **Font Awesome Pro 5.14.0 — licença comercial redistribuída dentro do pacote (⚠️ ponto de atenção legal para o SEIRMG)**. Utilitários: crypto-js, jmespath (motor de query usado extensivamente), DOMPurify, jquery-qrcode, jquery.tablesorter, jschardet, moment-duration-format, etc.

### 2.5 Storage e configurações

- **`chrome.storage.sync.dataValues`** (string JSON única): array de "perfis de base de dados" (`baseTipo: atividades|openai|gemini`, credenciais/API keys) + objeto final `{configGeral: [{name, value}]}` com todos os ~60 feature-flags.
- **`chrome.storage.local`**: `CheckTypes`, `InstallOrUpdate`, `version`.
- **`localStorage`**: `configBasePro` (espelho síncrono de `dataValues`, necessário para iframes), `configBasePro_openai`/`_gemini`/`_atividades` (**credenciais em texto puro**), `darkModePro`, `seiSlim`, `seiBtnRight`, `iconLabel`.
- **`sessionStorage`**: `versaoSei`, `configHost_Pro`, dados de transição SPro→SEI Pro.
- **`config_hosts.json`**: mecanismo de feature-gating por host (não é allowlist/blocklist de instalação).

### 2.6 CSS / Design system

`sei-pro.css` (4.390 linhas, tema completo, sem dark mode) + `sei-slim.css` (4.624 linhas, `all_frames`, implementa o dark mode real + modo compacto). Paleta azul `#4285F4`/verde `#9CB639`/vermelho `#E46E64`/amarelo `#E3B044`. Toggle switch customizado (`.onoffswitch`) reaproveitado em toda a UI de opções. Ícones por órgão confirmam builds white-label.

### 2.7 Atalhos de teclado / IDs injetados

Sem `commands` no manifest. Atalhos de teclado do editor são internos ao CKEditor (combinação configurável). IDs confirmados: `#divBoxPro`, `#divDialogsPro`, `#checkNaoAssinados` (inserido em `#divInfraBarraLocalizacao` — **mesmo container que o Sei++ usa**, ver seção 4), `.dark-mode`/`.seiSlim` no `<body>` de múltiplos iframes.

### 2.8 Build/lint

Sem bundler, sem TypeScript, sem `package.json`/CI. `dist/` é a fonte. `jsconfig.json` só ajuda o editor (IntelliSense), não compila nada. Há código morto identificado: `background.js` (não referenciado no manifest), `sei-pro_new.js` (órfão), `sei-gantt.js`/`sei-forms.js`/`sei-sync-processos.js` (referenciados no código mas inexistentes no pacote — features planejadas e não entregues).

---

## 3. Comparação Sei++ vs Sei Pro

### 3.1 Funcionalidades exclusivas do Sei++

| Funcionalidade | Por quê é exclusiva |
|---|---|
| Notificação nativa (`chrome.notifications`+`chrome.alarms`) de processos novos | Sei Pro não usa `chrome.notifications` nem `chrome.alarms` em nenhum lugar (confirmado por grep na árvore inteira) |
| Badge de status do bloco de assinatura ao lado do logo (verde/azul/vermelho/amarelo) | Sem equivalente — Sei Pro só alerta sobre docs não assinados *ao tramitar*, não sobre o bloco de assinatura em si |
| Forçar reabertura de processo fechado em todas unidades | Sem equivalente encontrado |
| Retirar sobrestamento/reabrir em lote | Sem equivalente encontrado |
| Filtro por atribuição / carregar info de blocos na tela de Controle de Processos | Sem equivalente direto |
| Autopreenchimento ao receber documento externo ("Clique menos") | Sem equivalente |
| Ponto de controle com cor customizável via filtro CSS | Sem equivalente |
| Popup de extensão com status do serviço de notificação | Sei Pro não tem popup (ícone abre direto as opções) |

### 3.2 Funcionalidades exclusivas do Sei Pro

| Categoria | Itens |
|---|---|
| Editor de texto avançado | ~30 recursos (equações, legística, hashcode, IA, ditado, sigilo/tarjas, imagens avançadas, tabelas, links, etc. — seção 2.3) |
| Lote | Ações em lote (inclusive assinar em lote), documentos em lote via CSV |
| Favoritos avançados | Etiquetas, mapas, categorias, prazo com edição avançada |
| Projetos | Kanban/Gantt com Google Sheets como backend |
| Atividades | Dashboards/gráficos ligados a servidor externo próprio (não documentado publicamente) |
| Prazos dedicados + reabertura programada | Painel próprio, verificação periódica configurável |
| Estilo avançado | Cor customizável + modo noturno + barra vertical (mais parametrizável que os 2 temas fixos do Sei++) |
| Diversos de UX | Rolagem infinita, menu suspenso, histórico de processos visitados, ditado, título de página, URL amigável |

### 3.3 Funcionalidades duplicadas/equivalentes

| Funcionalidade | Sei++ | Sei Pro | Avaliação |
|---|---|---|---|
| Autopreencher senha no login | `permitirSalvarSenhaBrowser.js` | `init_pwd.js` + flag `autopreenchersenha` | Equivalentes; Sei Pro tem flag dedicada e cobre também a tela de assinatura |
| Modo escuro | 2 temas CSS fixos por versão do SEI | `.dark-mode` (423 regras) + cor customizável | **Sei Pro mais robusto** — mas ambos usam mecanismos de storage diferentes e incompatíveis |
| Anotação (post-it) na árvore | `mostrarAnotacao.js` | `sticknoteUpdate/sticknoteSave` | Equivalentes — comparar UX antes de escolher a base |
| Prazos | Colunas Prazo/Dias com cor (na listagem) | Painel dedicado "Gerenciar Prazos" + reabertura programada | **Sei Pro mais robusto/completo** |
| Cor de processo/marcador | Cor de fundo do link por palavra-chave na especificação | Cor personalizada no marcador nativo do SEI | Abordagens diferentes — não 100% equivalentes, avaliar se ambas coexistem |
| Ordenar/filtrar tabela | Filtro composto customizado + busca "OU" | `tablesorter` com ordenação por cabeçalho + persistência entre reloads | **Sei Pro mais robusto** em ordenação; Sei++ mais rico em sintaxe de busca |
| Seleção múltipla | Shift+clique | "Caixas de seleção inteligentes" + Ações em Lote | Sei Pro estende a mesma ideia para ações em lote |
| Upload de documento externo por arraste | `dropzone.js` (fluxo automatizado de 4 chamadas) | "Enviar múltiplos documentos externos" (multi-arquivo) | Sei Pro mais robusto (múltiplos arquivos); Sei++ mais simples/direto |
| Especificação do processo na listagem | `mostrarEspecificacao.js`/`listaPorEspecificacao.js` | "Mostrar especificação do processo" | Equivalentes |
| Alterar título da aba | `alterarTitulo.js` | "Alterar título da página" | Equivalentes |
| Alerta de pendência de assinatura | Badge visual (bloco de assinatura completo, todas unidades) + infra de notificação nativa | Alerta reativo (só docs não assinados **na unidade atual**, ao tramitar) | **Complementares, não sobrepostos** — combinar os dois é exatamente o ponto de partida da Etapa 3 |

### 3.4 Conflitos reais para a unificação

| Tipo | Conflito | Como resolver |
|---|---|---|
| **Chave de storage idêntica** | `chrome.storage.local.CheckTypes` existe em **ambos** os projetos, com formatos/semânticas de feature-flag diferentes entre si | Precisa de namespace próprio por origem (`seiplus_CheckTypes`/`seipro_CheckTypes`) ou schema novo unificado — **não copiar direto, colide** |
| **Chave de storage idêntica** | `chrome.storage.local.InstallOrUpdate` em ambos (mesmo propósito, boolean) | Baixo risco — unificar em uma única chave no SEIRMG |
| **Chave de storage idêntica** | `chrome.storage.local.version` em ambos (versão do Firefox) | Baixo risco — irrelevante no SEIRMG (Chrome-only) |
| **Seletor DOM disputado** | Ambos inserem markup dentro de `#divInfraBarraLocalizacao` (Sei++ clona a estrutura em `procedimento_visualizar`; Sei Pro insere `#checkNaoAssinados` ali) | Definir ordem de injeção/z-index e IDs próprios do SEIRMG para não haver dois scripts competindo pelo mesmo container |
| **Mecanismo de tema conflitante** | Sei++: `storage.theme` (enum) + CSS completo por versão do SEI. Sei Pro: `localStorage.darkModePro` (bool) + cor customizável, aplicado via classe em múltiplos iframes | Escolher **um** mecanismo canônico para o SEIRMG (recomendo: motor do Sei Pro — mais flexível — com a paleta/qualidade visual do Sei++ como inspiração) e migrar dados de quem tiver o outro instalado |
| **Indicador de pendência duplicado** | Sei++: badge ao lado do logo (`#seipp`). Sei Pro: número desenhado no favicon da aba (Favico.js) | Decidir se o SEIRMG mantém os dois indicadores ou consolida em um (ambos são "cosméticos", não têm lógica exclusiva que se perca ao remover um) |
| **Licenciamento** | Font Awesome **Pro** (comercial) redistribuído no pacote do Sei Pro | **Não deve ir para o SEIRMG sem uma licença própria válida** — usar Font Awesome Free ou outro conjunto de ícones livre para os recursos que hoje dependem da versão Pro |
| **Dependência de infraestrutura externa** | Módulos "Atividades" (servidor próprio não documentado) e "Projetos" (Google Sheets/OAuth) do Sei Pro dependem de serviços externos que o SEIRMG não necessariamente terá acesso/direito de usar | **Decisão do usuário necessária** — ver seção 5 |
| **Nomenclatura de função global** | Ambos usam padrões `init*`/`ModuleInit` como entrypoint de módulo, mas sem coordenação entre si (hoje nunca coexistem na mesma página) | Ao unificar em módulos ES, cada um vira um módulo com escopo próprio — risco baixo se a arquitetura nova usar `import`/`export` em vez de funções globais |

---

## 4. Etapa 1.5 — Avaliação de tecnologias

### 4.1 Stack atual

| | Sei++ | Sei Pro |
|---|---|---|
| Manifest | V3 | V3 |
| Linguagem | JavaScript puro (ES2020+, ESM) | JavaScript puro (legado, sem ESM — scripts globais) |
| Bundler | Nenhum | Nenhum |
| Gerenciador de pacotes | Bun | Nenhum (sem `package.json`) |
| Lint | ESLint (`eslint-config-standard`) + hook de pre-commit | Nenhum |
| Testes automatizados | Nenhum | Nenhum |
| CI | Nenhum | Nenhum |
| Runtime de terceiros | jQuery/jQuery UI vendorizados (poucas libs) | jQuery + ~20 libs vendorizadas, algumas pesadas (Tesseract.js, Mammoth, Filerobot Image Editor, PDF.js) |

### 4.2 Pesquisa: o que é recomendado hoje (jul/2026)

- **Manifest V2 está oficialmente morto**: o Chrome concluiu a desativação de extensões MV2 em stable em junho de 2026 (mesmo a flag experimental de desenvolvedor está sendo removida no Chrome 150/151). Isso é irrelevante como *risco* para o SEIRMG, já que **ambos os projetos de origem já são MV3** — mas confirma que não há motivo algum para considerar V2. ([Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline), [blog.google](https://blog.google/chromium/manifest-v2-phase-out-begins/))
- **Build tool recomendado para extensões MV3 hoje**: o plugin **CRXJS para Vite** (`@crxjs/vite-plugin`) é o padrão de fato — processa `manifest.json` como entry point, resolve automaticamente `content_scripts`/`service_worker`/popup/options como um grafo de módulos ES, gera `web_accessible_resources` automaticamente, e oferece HMR real durante o desenvolvimento. Atualmente na v2.7.1, com suporte a Vite 3 até Vite 8. ([crxjs.dev](https://crxjs.dev/), [GitHub crxjs/chrome-extension-tools](https://github.com/crxjs/chrome-extension-tools))
- **TypeScript** é hoje o padrão recomendado para extensões de porte médio/grande: os tipos oficiais de `chrome.*` (`@types/chrome`) e a própria complexidade de scraping de DOM/parsing (jmespath, regex sobre HTML do SEI) presentes nos dois projetos de origem são exatamente o cenário onde tipagem estática paga dividendos — ambos os codebases atuais têm bugs de forma sutil ligados a isso (ex.: `sei-pro_new.js` órfão e desatualizado, três arquivos referenciados e inexistentes em `init.js`/`init_all.js`, duplicação de `getConfigHost()` em dois arquivos).
- **`chrome.alarms` + `chrome.notifications` + `MutationObserver`** continuam sendo o padrão para monitoramento de página/alertas nativos (confirmado — é o mesmo padrão usado por extensões de monitoramento como o Distill Web Monitor, citado pelo usuário): `MutationObserver` para reagir em tempo real a mudanças no DOM da aba aberta, `chrome.alarms` como verificação periódica de fallback (inclusive quando a aba do SEI não está aberta, via fetch direto do service worker — técnica que o próprio Sei++ já usa em `notifyProcessos.js`), e `chrome.notifications` para o alerta nativo do SO.

### 4.3 Recomendação de stack para o SEIRMG

**Adotar TypeScript + Vite + `@crxjs/vite-plugin`, mantendo Bun como gerenciador de pacotes/test runner, e Vitest para testes unitários.**

Justificativa (ganho real, não modismo):
1. **TypeScript** — o maior ganho não é estético: os dois codebases de origem fazem scraping intenso de HTML/DOM do SEI (regex, `jmespath`, parsing de scripts inline) espalhado por dezenas de arquivos. Tipar essas estruturas de dados (`ListaProcessos`, `DocumentoAssinatura`, `ConfigGeral`, etc.) é o que vai evitar reintroduzir os mesmos bugs sutis já encontrados nesta análise (funções duplicadas, arquivos referenciados que não existem, chaves de storage colidindo).
2. **Vite + CRXJS** — elimina o padrão frágil do Sei Pro de injetar módulos de feature dinamicamente via `$.getScript(chrome.runtime.getURL(...))` (que hoje obriga a listar manualmente ~15 arquivos em `web_accessible_resources` e não passa por nenhum processo de build). Com CRXJS, cada módulo de feature vira um content script real, com code-splitting automático, HMR durante o desenvolvimento (recarrega só o módulo alterado sem precisar recarregar a extensão inteira) e um único manifest gerado a partir de config, eliminando a necessidade do script `make.sh` com `jq` do Sei++.
3. **Manter Bun** — já validado no Sei++, é rápido, compatível com Vite/Vitest, e evita introduzir mais uma ferramenta.
4. **Manter jQuery como dependência (via npm, não mais vendorizado manualmente)** — **não recomendo reescrever as ~150 funções que hoje dependem de jQuery** para JS puro/framework moderno: o ganho de performance seria mínimo (o gargalo real é rede/DOM do SEI, não jQuery), o risco de regressão é alto, e o próprio SEI carrega jQuery nativamente em várias versões. Trocar de gerenciador de dependência (vendorizado → `npm`/`bun add`) já resolve o principal problema real (não há hoje nenhum controle de versão/atualização de segurança do jQuery vendorizado).
5. **Vitest** para testar a lógica pura (parsers de bloco de assinatura, `jmespath` queries, formatação de prazos) — não é viável nem necessário fazer E2E completo contra o SEI real no CI, mas a lógica de parsing/decisão pode e deve ter testes unitários, o que nenhum dos dois projetos de origem tem hoje.
6. **Não usar Font Awesome Pro** — usar Font Awesome Free (ou outro set livre) para qualquer ícone hoje dependente da licença comercial, pelo motivo legal já apontado.

Isso não é uma migração "big bang": o volume de JS a portar é grande (Sei Pro sozinho tem ~50k linhas somando os módulos de feature), então a Etapa 2 vai propor portar por módulo, mantendo cada um funcional a cada PR, não reescrever tudo de uma vez.

---

## 5. Decisões que preciso da sua validação antes de seguir para a Etapa 2

1. **Módulo "Atividades" do Sei Pro** (26.773 linhas, maior arquivo do projeto, **sem documentação pública**, depende de um servidor externo próprio do autor original): você quer que o SEIRMG **inclua** esse módulo (o que exigiria você ter/criar essa infraestrutura de servidor) ou que ele fique **fora do escopo inicial** do SEIRMG (documentado no CHANGELOG como não migrado, por dependência externa)?
2. **Módulo "Projetos"** (Kanban/Gantt via Google Sheets + OAuth do usuário): incluir tal como está (cada usuário configura sua própria planilha/credenciais Google) ou deixar fora do escopo inicial?
3. **Font Awesome Pro**: confirmar que o SEIRMG deve usar apenas a versão **Free** (ou outro ícone set), já que não temos licença comercial própria para redistribuir a Pro.
4. **Mecanismo de tema/dark mode**: ok em adotar o motor mais flexível do Sei Pro (cor customizável) como base única do SEIRMG, migrando as preferências de quem usa os temas fixos do Sei++?
5. **Indicadores duplicados de pendência** (badge ao lado do logo do Sei++ vs. número no favicon do Sei Pro): manter os dois, ou consolidar em um só?
6. Confirma a stack recomendada (TypeScript + Vite/CRXJS + Bun + Vitest, mantendo jQuery como dependência de pacote em vez de arquivo vendorizado)?

Assim que você validar esses pontos, eu sigo para a Etapa 2 (arquitetura do SEIRMG).

---

## 6. Decisões validadas pelo usuário (06/07/2026)

| # | Pergunta | Decisão |
|---|---|---|
| 1 | Módulo "Atividades" do Sei Pro | **Fora do escopo inicial.** Documentar no CHANGELOG-UNIFICACAO.md como não migrado, por dependência de infraestrutura externa não documentada (servidor próprio do autor original). |
| 2 | Módulo "Projetos" (Kanban/Gantt) | **Não portar a versão Google Sheets.** A autarquia já opera uma instância própria (local) do **Planka** (kanban open-source). O SEIRMG deve integrar com esse Planka em vez de recriar o backend via Google Sheets — a definir na arquitetura (Etapa 2) como essa integração é exposta (API do Planka, autenticação, mapeamento processo↔cartão). |
| 3 | Font Awesome Pro | **Substituir por um ícone set aberto — Lucide.** Nenhum ícone do SEIRMG deve depender da licença comercial da Font Awesome Pro. |
| 4 | Mecanismo de tema/dark mode | **Motor do Sei Pro como base única** (cor customizável + classe `dark-mode` cross-iframe), migrando preferências existentes de quem já usa `storage.theme` (Sei++) ou `localStorage.darkModePro` (Sei Pro). Os 2 temas fixos do Sei++ (`black`/`super-black`) viram **presets** dentro desse motor, não mecanismos paralelos. |
| 5 | Indicador de pendência duplicado | **Consolidar no estilo Sei++** — badge fixo ao lado do logo do SEI (não o número desenhado no favicon da aba do Sei Pro). |
| 6 | Stack tecnológica | **Confirmada**: TypeScript + Vite + `@crxjs/vite-plugin` + Bun + Vitest, jQuery como dependência de pacote (não vendorizado). |

Essas decisões substituem qualquer recomendação conflitante nas seções 1-5 acima (ex.: onde a seção 4.3 menciona "Font Awesome Free", vale a decisão #3 desta seção — **Lucide**).
