# Análise Técnica — Integração de Editor no SEI Pro (SEI-Pro/sei-pro)

Fonte: `git clone https://github.com/SEI-Pro/sei-pro.git` (branch `master`, build `dist/`, manifest v1.6.1).
Repositório publica apenas o **build final** da extensão (sem `src/` separado), então a análise abaixo é feita sobre o código de produção em `dist/js/`.

## Conclusão principal

O SEI Pro **não substitui** o editor nativo do SEI por um CKEditor próprio compilado do zero. Existem **duas implementações separadas e com propósitos diferentes**:

| # | O quê | Onde | Como |
|---|-------|------|------|
| 1 | **Extensão do editor nativo do SEI** (a peça mais valiosa) | `dist/js/sei-pro-editor.js` (~8.250 linhas) | Não usa a API oficial de plugins do CKEditor. Injeta botões via DOM diretamente na toolbar já renderizada e manipula a instância existente (`CKEDITOR.instances[id]`). |
| 2 | **Build próprio de CKEditor 5** empacotado | `dist/js/lib/ckeditor/ckeditor.js` (1.18 MB, CKEditor 5 `ClassicEditor`, licença CKSource 2003-2021) | Carregado sob demanda (`$.getScript`) apenas para campos de texto auxiliares fora do documento SEI (ex.: descrição de atividades/tarefas), via `ClassicEditor.create()`. Editor secundário, isolado, sem relação com o documento SEI. |

Para "copiar a técnica" no seu projeto, o que importa é o **item 1** — é ele que resolve o problema real (estender um editor que já existe na página e que você não controla).

---

## 1. O problema que a técnica resolve

O SEI já carrega seu próprio editor de documentos:
- **SEI clássico**: CKEditor 4, dentro de um iframe (`#frmEditor` → `iframe[title*="txaEditor_"]`), instância acessível via `CKEDITOR.instances[idEditor]`.
- **SEI 5** (versão nova): CKEditor 5 nativo, sem iframe, montado em `.infra-editor__editor-completo`.

A extensão detecta qual dos dois está em uso assim (`init.js`):

```js
var isNewSEI = $('#divInfraSidebarMenu ul#infraMenu').length ? true : false;
var isSEI_5  = isNewSEI && sessionStorage.getItem('versaoSei')
               && compareVersionNumbers_init(sessionStorage.getItem('versaoSei'), '5') >= 0;
var frmEditor = isSEI_5 ? $('.infra-editor__editor-completo') : $('#frmEditor');
var frmEditor5Exists = $('html script[charset="utf-8"]').last().html().includes('INFRA_EDITOR_CONFIG');
```

O desafio de uma extensão de navegador é que o editor já foi criado pelo **script da própria página SEI**, antes da extensão poder interferir — não dá para "registrar um plugin" da forma oficial do CKEditor, porque a instância já nasceu com a config do SEI. A solução do SEI Pro é **pós-processar o DOM e a instância viva**, não recriar o editor.

---

## 2. A ponte isolated-world → main-world (o pulo do gato)

Extensões Manifest V3 rodam content scripts em um **mundo isolado** (`ISOLATED` world, padrão): o script da extensão enxerga o DOM da página, mas **não** enxerga variáveis globais criadas pelos scripts da própria página (como `window.CKEDITOR`).

O manifest do SEI Pro **não declara `"world": "MAIN"`** em nenhum content script (checado diretamente). Em vez disso, usam um truque clássico e mais portável entre navegadores (Chrome/Edge/Firefox):

```js
// init.js — content script roda em mundo isolado
$.getScript(getUrlExtension("js/sei-pro-editor.js"));
```

`jQuery.getScript()` internamente faz um `fetch`/`XHR` do arquivo e executa o conteúdo via `jQuery.globalEval`, que **cria um elemento `<script>` real e injeta no `<head>` do documento**. Um `<script>` inserido no DOM é interpretado pelo *parser* do navegador no **contexto principal (main world) daquele documento** — não no heap JS do content script. Resultado: o código de `sei-pro-editor.js`, embora carregado por um content script isolado, **passa a rodar no mesmo contexto global da página**, e por isso enxerga `CKEDITOR` normalmente, como se fosse um script do próprio SEI.

> Isso é equivalente (e mais portável entre browsers/manifest versions) ao padrão `document.createElement('script'); script.src = chrome.runtime.getURL(...); document.head.appendChild(script)`, que é a forma mais conhecida de "vazar" para o main world a partir de um content script isolado.

Os arquivos precisam estar expostos em `web_accessible_resources` no manifest para que a página possa carregá-los via `chrome-extension://.../...`:

```json
"web_accessible_resources": [{
  "resources": [
    "js/lib/ckeditor/ckeditor.js",
    "js/sei-pro-editor.js",
    ...
  ]
}]
```

Além disso, o segundo bloco de `content_scripts` do manifest usa `"matches"` que casam com a **URL do iframe do editor** (ex.: `*controlador.php?acao=texto_padrao_interno_alterar*`, `secao_modelo_alterar*`), então o content script já roda **dentro do documento certo** (o iframe do editor), sem precisar de `"all_frames": true` nem cross-frame messaging.

---

## 3. Carregamento condicional (só onde há editor)

```js
function loadScriptPro() {
    getPathExtensionPro();
    if (frmEditor.length || $('#divEditores').length || frmEditor5Exists) {
        setTimeout(function () {
            $(document).ready(function () {
                loadConfigPro();
                $.getScript(getUrlExtension("js/lib/moment.min.js"));
                $.getScript(getUrlExtension("js/sei-pro-editor.js"));
                $.getScript(getUrlExtension("js/sei-legis.js"));
            });
        }, 500);
    } else {
        // fluxo normal (fora do editor): sei-pro.js, favoritos, atividades, etc.
    }
}
```

Isso evita carregar ~440 KB de `sei-pro-editor.js` em toda página do SEI — só entra quando o editor está presente.

---

## 4. Injeção de botões: DOM mimicry, não a API oficial de plugins

Em vez de `CKEDITOR.plugins.add()` (API 4) ou `editor.ui.componentFactory.add()` (API 5) — que exigem registrar o plugin **antes** da instância existir — o SEI Pro **injeta HTML fake que imita os botões nativos**, direto na toolbar já renderizada, com retry/polling até o DOM existir:

```js
function addButton(TimeOut = 9000) {
    if (TimeOut <= 0) return;
    setTimeout(function () {
        if (isSEI_5) {
            // CKEditor 5: seletores de classe .ck-*
            $('.ck.ck-toolbar__items').append(htmlButton('').default);
            $('button[data-cke-tooltip-text="Inserir tabela"]').closest('.ck.ck-dropdown').after(htmlButton('').tables);
            setClickButtons();
        } else {
            // CKEditor 4: seletores de classe .cke_*
            $(txaEditor).each(function () {
                var idEditor = $(this).attr('id').replace('cke_', '');
                $(this).find('span.cke_toolbox').append(htmlButton('').default);
                $(this).find('span.cke_toolgroup .cke_button__table').before(htmlButton('').tables);
                // ...
            });
        }
    }, /* delay */);
}
```

O botão em si é montado com as **mesmas classes CSS que o CKEditor usa nativamente**, para herdar o visual sem CSS próprio:

```js
const htmlButtonPro = (classClick, cke_class, title, icon, extraStyle = '') => {
  return isSEI_5
    ? `<button class="ck ck-button ck-off cke_iconPro cke_buttonPro ${classClick}"
               type="button" data-cke-tooltip-text="${title}">
         <i class="${icon}"></i>
         <span class="ck ck-button__label">${title}</span>
       </button>`
    : `<a class="${classClick} cke_iconPro cke_button cke_buttonPro cke_button_off"
          href="#" title="${title}" hidefocus="true">
         <span class="cke_button_icon cke_button__${cke_class}_icon"
               style="background: url('${icon}') ${extraStyle}">&nbsp;</span>
         <span class="cke_button_label">${title}</span>
       </a>`;
};
```

E os cliques são amarrados via delegação jQuery comum, checando se o botão está "desabilitado" (mesma convenção visual `cke_button_disabled` do CKEditor 4):

```js
const setClickButtons = () => {
  $('.getQuickTableButtom').on('click', function () {
    if (!$(this).hasClass('cke_button_disabled')) getQuickTable(this);
  });
  $('.getNotaRodapeButtom').on('click', function () {
    if (!$(this).closest('.cke_iconPro').hasClass('cke_button_disabled')) getNotaRodape(this);
  });
  // ...
};
```

**Por que essa abordagem em vez da API oficial?** Porque a instância do CKEditor já existe quando o content script entra em ação — reconstruir com plugin oficial exigiria reinicializar o editor (perdendo estado/conteúdo) ou interceptar a criação antes que o SEI a faça, o que é frágil porque depende de saber exatamente quando/como o SEI monta a config. Manipular o DOM renderizado é mais lento de "escrever", porém muito mais robusto a mudanças internas do SEI.

---

## 5. Ações: manipulação direta da instância + diálogos nativos do CKEditor 4

Para ações simples, chamam a API pública do editor diretamente:

```js
oEditor = CKEDITOR.instances[idEditor];
oEditor.focus();
oEditor.fire('saveSnapshot');           // necessário p/ manter undo/redo funcionando
iframe.find('body').html(modeloHtml);   // ou oEditor.insertHtml(...) para inserir no cursor
```

Para UI mais complexa (formulários, abas), em vez de reinventar modais, eles **reaproveitam o próprio sistema de diálogos do CKEditor 4** (`CKEDITOR.dialog.add`), que já vem com estilo, abas, foco/acessibilidade prontos:

```js
CKEDITOR.dialog.add('NtRodapeSEI', function (editor) {
  return {
    title: 'Inserir nota de rodapé',
    buttons: [CKEDITOR.dialog.cancelButton, CKEDITOR.dialog.okButton],
    contents: [ /* tabs/fields */ ],
    onOk: function () {
      var oEditor = CKEDITOR.instances[idEditor];
      oEditor.insertHtml(/* html gerado a partir dos campos do diálogo */);
    }
  };
});
```

Esse padrão se repete para várias features (`SigiloSEI`, `TabelaSEI`, `LegisSEI`, `SumarioSEI`, `QrCodeSEI`, `DadosSEI`, `editLinkPro`, `batchImgQuality`...). No modo SEI 5, como não há mais `CKEDITOR.dialog`, essas telas usam diálogos jQuery UI próprios da extensão em vez do sistema nativo do CKEditor 5.

---

## 6. O CKEditor 5 "próprio" empacotado (`dist/js/lib/ckeditor/ckeditor.js`)

Esse é um build customizado do CKEditor 5 (via CKEditor Online Builder, com plugins selecionados: heading, alignment, fontColor/fontBackgroundColor, highlight, table, todoList, htmlEmbed, mediaEmbed, sourceEditing etc). Ele **não** interage com o documento do SEI. É carregado sob demanda só quando existe algum campo marcado com a classe `.setClassEditor` (ex.: formulários de "Atividades"/tarefas):

```js
function initClassicEditor() {
  if (typeof ClassicEditor === 'undefined') {
    $.getScript(URL_SPRO + "js/lib/ckeditor/ckeditor.js");
  }
}

function getEditorConfigOptions(readonly = false) {
  $('.setClassEditor').each(function () {
    ClassicEditor.create(this, {
      toolbar: { items: ['heading','|','bold','italic','underline','link', /* ... */] },
      language: 'pt-br',
      image: { toolbar: [/* ... */] },
      table: { contentToolbar: [/* ... */] }
    }).then(editor => { configClassicEditor[$(this).attr('id')] = editor; });
  });
}
```

Isso é útil apenas se você precisar de um editor rich-text **independente**, sem tocar em nenhum editor de terceiros. Não é a peça relevante para "clonar" a técnica de extensão de um editor alheio.

---

## 7. Checklist para replicar no seu projeto

Para estender um CKEditor (ou qualquer editor rico) que já roda numa página que você não controla, a partir de uma extensão de navegador:

1. **Detecte a versão/variante do editor alvo** por marcadores de DOM/config na página (ex.: presença de `INFRA_EDITOR_CONFIG`, classe do container, string de versão em `sessionStorage`).
2. **Carregue seu script de integração via injeção real de `<script>`** (ou `getScript`/`globalEval`, que faz a mesma coisa por baixo), não via `eval` isolado — só assim você herda o mesmo contexto global (`window.CKEDITOR`, `window.ClassicEditor` etc.) da página.
3. **Exponha os arquivos em `web_accessible_resources`** no manifest (MV3), já que serão carregados via URL `chrome-extension://...` a partir do contexto da página.
4. Se o content script precisa rodar dentro de um **iframe específico**, prefira casar o `matches` do manifest com a própria URL do iframe em vez de usar `all_frames: true` + postMessage — é mais simples e evita lidar com timing entre frames.
5. **Injete controles de UI imitando as classes CSS nativas do editor alvo** (em vez de registrar plugin oficial), com retry/`setTimeout` até o elemento existir — é mais resiliente a mudanças de timing de carregamento do host.
6. Para ações de conteúdo, use a **API pública da instância já criada** (`instances[id].insertHtml`, `.getData`, `.setData`, `.fire('saveSnapshot')` para manter undo/redo íntegro) em vez de recriar o editor.
7. Se o editor tiver sistema de diálogo nativo (como `CKEDITOR.dialog` no CK4), **reaproveite-o** para UI complexa — evita reimplementar modal/foco/acessibilidade do zero. Se não tiver (CK5 não expõe API pública de diálogo tão flexível), caia para um sistema de modal próprio (jQuery UI, etc.), como o SEI Pro faz no branch `isSEI_5`.

---

## 8. Relação com o seu fork (SEI++ / sessionGate.js)

Como você já está investigando logout de sessão causado por fetch em background no seu fork do SEI Pro: vale notar que essa **injeção via `$.getScript`/main-world** roda no mesmo contexto de `fetch`/`XMLHttpRequest` da página SEI — ou seja, chamadas de rede feitas pelo seu `sessionGate.js` a partir desse contexto main-world **carregam os cookies de sessão do SEI automaticamente** (diferente de um content script isolado fazendo fetch, que também usa os cookies do site mas roda num heap JS separado). Isso é relevante para decidir *onde* (isolated vs. main world, via essa mesma ponte) colocar a lógica de intercept/mitigation do `sessionGate.js` — provavelmente faz sentido interceptar no mesmo contexto onde o `CKEDITOR`/formulário do editor dispara os fetches, para conseguir "ver" e pausar/reagendar a chamada antes que ela dispare o logout.
