# Corretor Ortográfico no CKEditor nativo do SEI — Implementação

## 1. Diagnóstico: por que o Hunspell atual não funciona

Duas causas prováveis (normalmente as duas juntas):

1. **Mundo isolado**: se o corretor foi carregado como content script "normal" (sem a ponte `$.getScript`/injeção de `<script>` real), ele não enxerga `window.CKEDITOR` nem consegue manipular o `document` de dentro do `iframe[title*="txaEditor_"]` do editor de forma confiável — o SEI clássico roda o editor num **iframe separado**, com seu próprio `window`/`document`, e um content script isolado tem uma visão inconsistente disso.
2. **`spellcheck="true"` nativo do navegador não serve pra isso**: esse atributo só ativa o corretor do sistema operacional/navegador, que usa os dicionários instalados no SO — não dá pra injetar um dicionário `.aff`/`.dic` PT-BR customizado nele via JS. Se o Hunspell só setou esse atributo, ele nunca teve efeito real, só ficou "torcendo" pro Chrome corrigir sozinho (o que geralmente já falha em PT-BR se o usuário não tem esse idioma configurado no navegador).

A solução é **decoração manual**: rodar o Hunspell (via `nspell`, `typo.js` ou `hunspell-asm`) em JS puro contra o texto, e desenhar o sublinhado ondulado você mesmo com `<span>` — exatamente como o SEI Pro já faz para o "Enumerar Normas" (`sei-legis.js`, varre parágrafos e envolve trechos com `<span>`) e para o "Revisão de texto" (`setStyleReview`, envolve seleção com `<u>`/`<s>` estilizado preservando o cursor).

---

## 2. Arquitetura

```
extensão
 ├─ manifest.json
 │   └─ web_accessible_resources: dicionários (.aff/.dic) + libs (nspell) + script de integração
 ├─ init.js (isolated world)      → detecta se há editor na página, dispara a ponte
 └─ spellcheck-editor.js (main world, via $.getScript)
     ├─ carrega nspell + dicionário pt-BR (uma vez, cacheado em memória)
     ├─ localiza a(s) instância(s) CKEDITOR (CK4 iframe / CK5 direto)
     ├─ varre parágrafo por parágrafo, tokeniza palavras, verifica com nspell
     ├─ reescreve o HTML do parágrafo com <span class="sp-err"> nas palavras erradas
     │   (bookmark antes / restore depois → não perde o cursor)
     ├─ popup de sugestões ao clicar numa palavra sublinhada
     └─ botão na toolbar (mesmo padrão de injeção de botão do SEI Pro) para ligar/desligar
```

Debounce: verificação roda no `keyup` com `setTimeout`/`clearTimeout` (≈600–800ms de pausa), **não a cada tecla** — reescrever o parágrafo inteiro a cada keystroke é caro e aumenta o risco de race condition com o próprio usuário digitando.

---

## 3. manifest.json — adições

```json
{
  "web_accessible_resources": [
    {
      "resources": [
        "js/lib/nspell.min.js",
        "js/lib/dictionary-pt-BR/index.aff",
        "js/lib/dictionary-pt-BR/index.dic",
        "js/spellcheck-editor.js"
      ],
      "matches": ["*://*.br/sei/*", "*://*.br/*/sei/*"]
    }
  ]
}
```

> Use `dictionary-pt-BR` do pacote npm `dictionary-pt-BR` (wooorm) — já vem pronto pra `nspell`. Copie `index.aff`/`index.dic` pra dentro da extensão; não dá pra buscar de CDN externo por causa da CSP do SEI/das políticas de MV3.

---

## 4. Ponto de entrada (isolated world) — adicionar em `init.js`

```js
// Mesmo gatilho já usado pro sei-pro-editor.js: só carrega se há editor na página
if (frmEditor.length || $('#divEditores').length || frmEditor5Exists) {
    setTimeout(function () {
        $(document).ready(function () {
            // ponte pro main world — mesma técnica do sei-pro-editor.js
            $.getScript(getUrlExtension("js/lib/nspell.min.js"));
            $.getScript(getUrlExtension("js/spellcheck-editor.js"));
        });
    }, 600); // depois do sei-pro-editor.js já ter rodado addButton()
}
```

---

## 5. `js/spellcheck-editor.js` (roda em main world)

```js
(function () {
    'use strict';

    var SPELL_URL = (typeof URL_SPRO !== 'undefined') ? URL_SPRO : '';
    var spellChecker = null;
    var spellEnabled = false;
    var debounceTimer = null;
    var IGNORED_KEY = 'seiProSpellIgnored';
    var ignoredWords = new Set(JSON.parse(localStorage.getItem(IGNORED_KEY) || '[]'));

    // ---------- 1. Carregar dicionário e instanciar o nspell ----------
    function loadDictionary(cb) {
        if (spellChecker) return cb(spellChecker);
        Promise.all([
            fetch(SPELL_URL + 'js/lib/dictionary-pt-BR/index.aff').then(r => r.text()),
            fetch(SPELL_URL + 'js/lib/dictionary-pt-BR/index.dic').then(r => r.text())
        ]).then(function (res) {
            spellChecker = window.nspell(res[0], res[1]);
            cb(spellChecker);
        }).catch(function (err) {
            console.error('SEI Pro Spellcheck: falha ao carregar dicionário', err);
        });
    }

    // ---------- 2. Utilitário: tokenizar preservando tags ----------
    // Nunca mexe em HTML dentro de tags (evita quebrar <a>, <span class="legis">, etc.)
    // Estratégia: opera sobre TEXT NODES via TreeWalker, não sobre innerHTML bruto.
    function walkTextNodes(root, fn) {
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: function (node) {
                var p = node.parentElement;
                if (!p) return NodeFilter.FILTER_REJECT;
                // não entra em spans já marcados, nem em elementos não-editáveis (legis, refs etc.)
                if (p.closest('.sp-err, [contenteditable="false"], .legis, .reviewSeiPro')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        var node;
        var nodes = [];
        while ((node = walker.nextNode())) nodes.push(node);
        nodes.forEach(fn); // materializa antes, pois vamos alterar o DOM durante o processo
    }

    var WORD_RE = /[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['-][A-Za-zÀ-ÖØ-öø-ÿ]+)*/g;

    function markMisspelledInTextNode(textNode) {
        var text = textNode.nodeValue;
        var matches = [...text.matchAll(WORD_RE)];
        if (!matches.length) return;

        var hasError = matches.some(function (m) {
            var w = m[0];
            return w.length > 2 && !ignoredWords.has(w.toLowerCase()) && !spellChecker.correct(w);
        });
        if (!hasError) return;

        var frag = document.createDocumentFragment();
        var last = 0;
        matches.forEach(function (m) {
            var word = m[0], start = m.index, end = start + word.length;
            if (start > last) frag.appendChild(document.createTextNode(text.slice(last, start)));

            var isWrong = word.length > 2 && !ignoredWords.has(word.toLowerCase()) && !spellChecker.correct(word);
            if (isWrong) {
                var span = document.createElement('span');
                span.className = 'sp-err';
                span.setAttribute('data-word', word);
                span.textContent = word;
                frag.appendChild(span);
            } else {
                frag.appendChild(document.createTextNode(word));
            }
            last = end;
        });
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));

        textNode.parentNode.replaceChild(frag, textNode);
    }

    // ---------- 3. Reescrita de parágrafo com preservação de cursor (padrão SEI Pro) ----------
    function checkParagraph(pElement, oEditor) {
        // limpa marcações antigas primeiro (senão acumula span dentro de span)
        $(pElement).find('.sp-err').each(function () {
            $(this).replaceWith(document.createTextNode($(this).text()));
        });
        pElement.normalize(); // funde text nodes adjacentes

        var bookmark = oEditor.getSelection().createBookmarks(true);
        walkTextNodes(pElement, markMisspelledInTextNode);
        oEditor.getSelection().selectBookmarks(bookmark);
    }

    function checkWholeEditor(oEditor, iframeDoc) {
        if (!spellChecker || !spellEnabled) return;
        var body = iframeDoc ? iframeDoc.find('body')[0] : oEditor.editable().$;
        $(body).find('p, li, td').each(function () {
            checkParagraph(this, oEditor);
        });
    }

    // ---------- 4. Ganchos de evento no editor (CK4 e CK5) ----------
    function attachToCK4Instance(oEditor) {
        var iframeDoc = $('iframe[title*="' + oEditor.name + '"]').contents();
        oEditor.on('key', function () {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function () {
                checkWholeEditor(oEditor, iframeDoc);
            }, 700);
        });
        // primeira checagem ao carregar
        oEditor.on('instanceReady', function () { checkWholeEditor(oEditor, iframeDoc); });
        if (oEditor.status === 'ready') checkWholeEditor(oEditor, iframeDoc);

        // clique numa palavra marcada -> popup de sugestões
        iframeDoc.on('click', '.sp-err', function (e) {
            e.preventDefault();
            showSuggestions(this, oEditor, $(this));
        });
    }

    function attachToCK5Instance(editor) {
        var root = editor.editing.view.getDomRoot();
        editor.editing.view.document.on('keyup', function () {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function () {
                // CK5 exige transação via model; mais simples: opera na view DOM
                // e sincroniza via editor.data.get()/editor.data.set() só se necessário.
                checkWholeEditorCK5(editor, root);
            }, 700);
        });
        $(root).on('click', '.sp-err', function (e) {
            e.preventDefault();
            showSuggestions(this, editor, $(this));
        });
    }

    function checkWholeEditorCK5(editor, root) {
        if (!spellChecker || !spellEnabled) return;
        $(root).find('p, li, td').each(function () {
            var pElement = this;
            $(pElement).find('.sp-err').each(function () {
                $(this).replaceWith(document.createTextNode($(this).text()));
            });
            pElement.normalize();
            walkTextNodes(pElement, markMisspelledInTextNode);
        });
        // CK5 detecta a mudança de DOM via MutationObserver interno da view;
        // não precisamos (nem devemos) chamar editor.data.set aqui.
    }

    // ---------- 5. Popup de sugestões (mesmo padrão visual do showReviewTips) ----------
    function showSuggestions(el, editorInstance, $span) {
        $('.sp-suggest-box').remove();
        var word = $span.attr('data-word');
        var suggestions = spellChecker.suggest(word).slice(0, 5);

        var html = '<div class="sp-suggest-box" style="position:absolute;z-index:99999;background:#fff;' +
            'border:1px solid #ccc;box-shadow:0 2px 8px rgba(0,0,0,.2);border-radius:4px;padding:4px 0;font-size:13px;">';
        suggestions.forEach(function (s) {
            html += '<div class="sp-suggest-item" data-suggest="' + s + '" style="padding:4px 12px;cursor:pointer;">' + s + '</div>';
        });
        html += '<div class="sp-suggest-item sp-ignore" style="padding:4px 12px;cursor:pointer;color:#888;border-top:1px solid #eee;">Ignorar</div>';
        html += '</div>';

        var $box = $(html).insertAfter($span);
        var offset = $span.offset();
        $box.css({ top: offset.top + $span.outerHeight(), left: offset.left });

        $box.find('.sp-suggest-item[data-suggest]').on('click', function () {
            $span.replaceWith(document.createTextNode($(this).attr('data-suggest')));
            $box.remove();
            // dispara change pra CKEditor registrar no histórico de undo
            if (editorInstance.fire) editorInstance.fire('change');
        });
        $box.find('.sp-ignore').on('click', function () {
            ignoredWords.add(word.toLowerCase());
            localStorage.setItem(IGNORED_KEY, JSON.stringify([...ignoredWords]));
            $span.replaceWith(document.createTextNode(word));
            $box.remove();
        });

        $(document).one('click', function (ev) {
            if (!$(ev.target).closest('.sp-suggest-box, .sp-err').length) $box.remove();
        });
    }

    // ---------- 6. Botão na toolbar — mesmo padrão de injeção do sei-pro-editor.js ----------
    function addSpellcheckButton() {
        var btnHtml = isSEI_5
            ? '<button class="ck ck-button ck-off cke_iconPro cke_buttonPro spellcheckToggleBtn" type="button" data-cke-tooltip-text="Corretor ortográfico"><i class="fab fa-spell-check"></i></button>'
            : '<a class="spellcheckToggleBtn cke_iconPro cke_button cke_buttonPro cke_button_off" href="#" title="Corretor ortográfico" hidefocus="true"><span class="cke_button_icon" style="background:url(\'' + SPELL_URL + 'icons/menu/spellcheck.png\')">&nbsp;</span></a>';

        if (isSEI_5) {
            $('.ck.ck-toolbar__items').append(btnHtml);
        } else {
            $('span.cke_toolbox').append(btnHtml);
        }

        $('.spellcheckToggleBtn').on('click', function () {
            spellEnabled = !spellEnabled;
            $(this).toggleClass('cke_button_on', spellEnabled);
            if (spellEnabled) {
                loadDictionary(function () {
                    for (var id in CKEDITOR.instances) checkWholeEditor(CKEDITOR.instances[id]);
                });
            } else {
                $('.sp-err').each(function () { $(this).replaceWith(document.createTextNode($(this).text())); });
            }
        });
    }

    // ---------- 7. CSS do sublinhado ondulado ----------
    var css = '.sp-err{border-bottom:2px wavy #e53935;cursor:pointer;text-decoration:none;}' +
              '.sp-suggest-item:hover{background:#f0f0f0;}';
    $('<style>').text(css).appendTo('head');
    // precisa injetar também dentro do iframe do CK4:
    function injectCssIntoIframe(iframeDoc) {
        if (iframeDoc.find('style[data-spellcheck]').length) return;
        iframeDoc.find('head').append('<style data-spellcheck>' + css + '</style>');
    }

    // ---------- 8. Bootstrap ----------
    function init() {
        addSpellcheckButton();
        if (!isSEI_5) {
            for (var id in CKEDITOR.instances) {
                attachToCK4Instance(CKEDITOR.instances[id]);
                injectCssIntoIframe($('iframe[title*="' + id + '"]').contents());
            }
            CKEDITOR.on('instanceCreated', function (ev) {
                ev.editor.on('instanceReady', function () {
                    attachToCK4Instance(ev.editor);
                    injectCssIntoIframe($('iframe[title*="' + ev.editor.name + '"]').contents());
                });
            });
        } else {
            // CK5: aguarda a instância global que o próprio SEI expõe (mesmo padrão de polling do addButton)
            (function waitCK5(timeout) {
                if (timeout <= 0) return;
                if (window.editor && window.editor.editing) {
                    attachToCK5Instance(window.editor);
                } else {
                    setTimeout(function () { waitCK5(timeout - 300); }, 300);
                }
            })(9000);
        }
    }

    init();
})();
```

---

## 6. Observações importantes

- **Não use `innerHTML =` no parágrafo inteiro** pra fazer a marcação — use `TreeWalker` sobre text nodes (item 5.2) e `DocumentFragment` pra substituir só o necessário. Fazer `$(p).html(regexReplace(...))` como o `updateLegis` faz é aceitável pra marcadores estruturais pontuais, mas para spellcheck (que roda a cada pausa de digitação, em qualquer parágrafo) isso é mais arriscado — regex sobre HTML bruto corrompe atributos/tags facilmente. TreeWalker é mais seguro.
- **Bookmark antes/depois é obrigatório** (`createBookmarks(true)` / `selectBookmarks`) — é exatamente o padrão que o próprio SEI Pro usa em `replaceTextOnEditor` (`storeCursorLocation`/`restoreCursorLocation`). Sem isso, o cursor pula pro início do parágrafo a cada verificação e o usuário não consegue digitar.
- **CK5 (`isSEI_5`) não expõe API de range tão simples quanto o CK4** — por isso a v5 acima opera direto na `view` DOM (`editing.view.getDomRoot()`) em vez de tentar usar o `model` do CKEditor 5. Isso funciona porque CK5 tem um `MutationObserver` interno que resincroniza model↔view automaticamente quando o DOM muda por fora — mas é mais frágil que a via CK4. Se notar dessincronia, o fallback mais seguro é rodar a marcação só no `blur` do editor CK5 (menos "ao vivo", porém 100% estável).
- **Performance**: para documentos grandes, considere limitar a verificação a parágrafos que mudaram desde a última passada (guarde um hash do texto por parágrafo em `data-sp-hash` e pule os que não mudaram).
- **Dicionário customizado do SEI**: siglas/termos jurídicos (ex.: "SEI", "LGPD", "art.", nomes de leis) vão aparecer como erro. Adicione uma lista de exceções fixas (`ignoredWords` pré-populado) além da lista dinâmica de "Ignorar" por clique.
