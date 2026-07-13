# Dicionário pt-BR — origem e licença

Os arquivos `pt-br.aff` e `pt-br.dic` deste diretório são vendorizados a partir do
pacote npm [`dictionary-pt`](https://www.npmjs.com/package/dictionary-pt) v4.0.0
(projeto [wooorm/dictionaries](https://github.com/wooorm/dictionaries)), que por sua
vez embute o **VERO — Verificador Ortográfico Livre — versão 3.2**, o dicionário
Hunspell de português do Brasil usado pelo LibreOffice.

- Copyright (C) 2006–2013 Raimundo Santos Moura (<raimundo.smoura@gmail.com>)
- Licença dupla: GNU Lesser General Public License v3 (LGPLv3) OU Mozilla Public License (MPL)
- Fonte: https://unpkg.com/dictionary-pt@4.0.0/

Vendorizados diretamente (em vez de instalados via `node_modules`) porque o pacote
`dictionary-pt` restringe suas exportações a `./index.js` (que por sua vez só
funciona em Node.js via `node:fs/promises`) — não dá pra importar os arquivos
`.aff`/`.dic` de dentro do pacote num content script de extensão de navegador.
