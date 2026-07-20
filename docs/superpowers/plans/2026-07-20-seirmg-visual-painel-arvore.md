# Visual do painel lateral da árvore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar visualmente o painel lateral da árvore (Anotações, Tipo do processo, Nível de Acesso, Especificação, Assuntos, Interessado(s), Observação, Atribuído para) conforme o mockup aprovado — cada seção com ícone + rótulo, divisores sutis, badge colorido pro Nível de Acesso, chips com botão de copiar pros interessados.

**Architecture:** Substitui a função `criarSeparador` (só um `<div>` com texto) por `criarSecao`, que retorna `{ secao, corpo }` — `secao` é o wrapper com cabeçalho (ícone + título) já embutido, `corpo` é onde cada função de renderização já existente continua colocando seu conteúdo, sem mudar a lógica de extração/dados. Nenhuma função de `features/procedimento-visualizar/painelLateral.ts` muda.

**Tech Stack:** TypeScript, Vite. Ícones via `lucide-static` (`?raw` import, mesmo padrão já usado no arquivo pra `copy.svg`).

**Mockup aprovado:** https://claude.ai/code/artifact/c27a11ed-cba5-4530-8ae4-56fe94b13554

## Global Constraints

- Nenhuma mudança em `features/procedimento-visualizar/painelLateral.ts` (extração de dados) nem em `features/procedimento-visualizar/historico.ts` — só wiring visual em `content-scripts/procedimento_visualizar/index.ts` e CSS em `content-scripts/core/theme.css`.
- Cores reaproveitam a paleta já usada no popup (verde `#17875a`/laranja `#b5530a`/vermelho `#b3261e` pros 3 níveis de acesso) e a variável global já existente `--seirmg-accent-color` (`#017fff`) pro azul de destaque — não inventar uma paleta nova.

---

### Task 1: Ícones + `criarSecao` + atualizar as 8 funções de renderização

**Files:**
- Modify: `src/content-scripts/procedimento_visualizar/index.ts`
- Modify: `src/content-scripts/core/theme.css`

**Interfaces:**
- Consumes: nenhuma interface nova de outros arquivos.
- Produces: nenhuma interface nova exposta a outros arquivos — `criarSecao` fica privada a este content script.

- [ ] **Step 1: Adicionar os imports de ícone**

Substituir:

```ts
import copyIconSvg from 'lucide-static/icons/copy.svg?raw'
```

por:

```ts
import copyIconSvg from 'lucide-static/icons/copy.svg?raw'
import stickyNoteIconSvg from 'lucide-static/icons/sticky-note.svg?raw'
import briefcaseIconSvg from 'lucide-static/icons/briefcase.svg?raw'
import globeIconSvg from 'lucide-static/icons/globe.svg?raw'
import lockIconSvg from 'lucide-static/icons/lock.svg?raw'
import shieldAlertIconSvg from 'lucide-static/icons/shield-alert.svg?raw'
import fileTextIconSvg from 'lucide-static/icons/file-text.svg?raw'
import messageSquareIconSvg from 'lucide-static/icons/message-square.svg?raw'
import tagsIconSvg from 'lucide-static/icons/tags.svg?raw'
import usersIconSvg from 'lucide-static/icons/users.svg?raw'
import userCheckIconSvg from 'lucide-static/icons/user-check.svg?raw'
```

- [ ] **Step 2: Substituir `criarSeparador` por `criarSecao`**

Substituir:

```ts
function criarSeparador(titulo: string): HTMLDivElement {
  const separador = document.createElement('div')
  separador.className = 'seirmg-separador'
  const span = document.createElement('span')
  span.textContent = titulo
  separador.appendChild(span)
  return separador
}
```

por:

```ts
function criarSecao(titulo: string, iconeSvg: string): { secao: HTMLDivElement; corpo: HTMLDivElement } {
  const secao = document.createElement('div')
  secao.className = 'seirmg-secao'

  const cabecalho = document.createElement('div')
  cabecalho.className = 'seirmg-secao-cabecalho'
  const icone = document.createElement('span')
  icone.className = 'seirmg-secao-icone'
  icone.innerHTML = iconeSvg
  const rotulo = document.createElement('span')
  rotulo.textContent = titulo
  cabecalho.append(icone, rotulo)

  const corpo = document.createElement('div')
  corpo.className = 'seirmg-secao-corpo'

  secao.append(cabecalho, corpo)
  return { secao, corpo }
}
```

- [ ] **Step 3: Atualizar `renderizarInteressados`**

Substituir a função inteira:

```ts
function renderizarInteressados(container: HTMLElement, interessados: InteressadoExtraido[]): void {
  container.appendChild(criarSeparador('Interessado(s)'))
  const div = document.createElement('div')
  div.id = 'seirmg-interessados'

  if (interessados.length === 0) {
    const p = document.createElement('p')
    p.className = 'seirmg-interessado'
    p.textContent = 'Nenhum interessado especificado.'
    div.appendChild(p)
  } else {
    interessados.forEach((interessado) => {
      const p = document.createElement('p')
      p.className = 'seirmg-interessado'
      const spanNome = document.createElement('span')
      spanNome.textContent = interessado.nome
      p.appendChild(spanNome)
      if (interessado.sigla) {
        const spanSigla = document.createElement('span')
        spanSigla.textContent = ` (${interessado.sigla})`
        p.appendChild(spanSigla)
        p.appendChild(criarIconeCopiar(interessado.sigla, p))
      }
      div.appendChild(p)
    })
  }

  container.appendChild(div)
}
```

por:

```ts
function renderizarInteressados(container: HTMLElement, interessados: InteressadoExtraido[]): void {
  const { secao, corpo } = criarSecao('Interessado(s)', usersIconSvg)
  corpo.id = 'seirmg-interessados'

  if (interessados.length === 0) {
    const p = document.createElement('p')
    p.className = 'seirmg-interessado seirmg-vazio'
    p.textContent = 'Nenhum interessado especificado.'
    corpo.appendChild(p)
  } else {
    interessados.forEach((interessado) => {
      const p = document.createElement('p')
      p.className = 'seirmg-interessado'
      const marcador = document.createElement('span')
      marcador.className = 'seirmg-interessado-marcador'
      p.appendChild(marcador)
      const spanNome = document.createElement('span')
      spanNome.textContent = interessado.nome
      p.appendChild(spanNome)
      if (interessado.sigla) {
        const spanSigla = document.createElement('span')
        spanSigla.className = 'seirmg-interessado-sigla'
        spanSigla.textContent = `(${interessado.sigla})`
        p.appendChild(spanSigla)
        p.appendChild(criarIconeCopiar(interessado.sigla, p))
      }
      corpo.appendChild(p)
    })
  }

  container.appendChild(secao)
}
```

- [ ] **Step 4: Atualizar `renderizarNivelAcesso`**

Substituir a função inteira:

```ts
function renderizarNivelAcesso(container: HTMLElement, dados: NivelAcessoExtraido): void {
  container.appendChild(criarSeparador('Nível de Acesso'))
  const p = document.createElement('p')
  p.className = 'seirmg-nivel-acesso'
  if (!dados.nivel) {
    p.textContent = 'Não especificado.'
  } else if (dados.hipoteseLegal) {
    p.textContent = `${dados.nivel}: ${dados.hipoteseLegal}`
  } else {
    p.textContent = dados.nivel
  }
  container.appendChild(p)
}
```

por:

```ts
const ICONES_NIVEL_ACESSO: Record<'Público' | 'Restrito' | 'Sigiloso', { classe: string; icone: string }> = {
  Público: { classe: 'seirmg-badge-nivel-publico', icone: globeIconSvg },
  Restrito: { classe: 'seirmg-badge-nivel-restrito', icone: lockIconSvg },
  Sigiloso: { classe: 'seirmg-badge-nivel-sigiloso', icone: shieldAlertIconSvg },
}

function renderizarNivelAcesso(container: HTMLElement, dados: NivelAcessoExtraido): void {
  const { secao, corpo } = criarSecao('Nível de Acesso', shieldAlertIconSvg)

  if (!dados.nivel) {
    const p = document.createElement('p')
    p.className = 'seirmg-vazio'
    p.textContent = 'Não especificado.'
    corpo.appendChild(p)
  } else {
    const info = ICONES_NIVEL_ACESSO[dados.nivel]
    const badge = document.createElement('span')
    badge.className = `seirmg-badge-nivel ${info.classe}`
    const icone = document.createElement('span')
    icone.innerHTML = info.icone
    badge.append(icone, document.createTextNode(dados.nivel))
    corpo.appendChild(badge)

    if (dados.hipoteseLegal) {
      const hipotese = document.createElement('p')
      hipotese.className = 'seirmg-hipotese-legal'
      hipotese.textContent = dados.hipoteseLegal
      corpo.appendChild(hipotese)
    }
  }

  container.appendChild(secao)
}
```

- [ ] **Step 5: Atualizar `renderizarAssuntos`**

Substituir a função inteira:

```ts
function renderizarAssuntos(container: HTMLElement, assuntos: string[]): void {
  container.appendChild(criarSeparador('Assuntos'))
  const div = document.createElement('div')
  div.id = 'seirmg-assuntos'

  if (assuntos.length === 0) {
    const p = document.createElement('p')
    p.className = 'seirmg-assunto'
    p.textContent = 'Nenhum assunto especificado.'
    div.appendChild(p)
  } else {
    assuntos.forEach((assunto) => {
      const p = document.createElement('p')
      p.className = 'seirmg-assunto'
      p.textContent = assunto
      div.appendChild(p)
    })
  }

  container.appendChild(div)
}
```

por:

```ts
function renderizarAssuntos(container: HTMLElement, assuntos: string[]): void {
  const { secao, corpo } = criarSecao('Assuntos', tagsIconSvg)
  corpo.id = 'seirmg-assuntos'

  if (assuntos.length === 0) {
    const p = document.createElement('p')
    p.className = 'seirmg-assunto seirmg-vazio'
    p.textContent = 'Nenhum assunto especificado.'
    corpo.appendChild(p)
  } else {
    assuntos.forEach((assunto) => {
      const p = document.createElement('p')
      p.className = 'seirmg-assunto'
      p.textContent = assunto
      corpo.appendChild(p)
    })
  }

  container.appendChild(secao)
}
```

- [ ] **Step 6: Atualizar `renderizarTextoSimples`**

Substituir a função inteira:

```ts
function renderizarTextoSimples(container: HTMLElement, titulo: string, classe: string, texto: string, vazio: string): void {
  container.appendChild(criarSeparador(titulo))
  const p = document.createElement('p')
  p.className = classe
  p.textContent = texto || vazio
  container.appendChild(p)
}
```

por:

```ts
function renderizarTextoSimples(
  container: HTMLElement,
  titulo: string,
  classe: string,
  texto: string,
  vazio: string,
  iconeSvg: string
): void {
  const { secao, corpo } = criarSecao(titulo, iconeSvg)
  const p = document.createElement('p')
  p.className = texto ? classe : `${classe} seirmg-vazio`
  p.textContent = texto || vazio
  corpo.appendChild(p)
  container.appendChild(secao)
}
```

- [ ] **Step 7: Atualizar `renderizarAtribuicao`**

Substituir a função inteira:

```ts
function renderizarAtribuicao(container: HTMLElement, dados: DadosAtribuicao): void {
  container.appendChild(criarSeparador(dados.sigiloso ? 'Credencial para' : 'Atribuído para'))
  const div = document.createElement('div')
  div.id = 'seirmg-atribuicao'

  if (dados.usuarios.length === 0) {
    const p = document.createElement('p')
    p.className = 'seirmg-atribuido-para seirmg-sem-atribuicao'
    p.textContent = '(processo sem atribuição)'
    div.appendChild(p)
  } else {
    dados.usuarios.forEach((usuario) => {
      const p = document.createElement('p')
      p.className = 'seirmg-atribuido-para'
      p.title = dados.sigiloso
        ? `Credencial para ${usuario.nome} (${usuario.login}).`
        : `Atribuído para ${usuario.nome} (${usuario.login}).`
      p.textContent = usuario.login
      div.appendChild(p)
    })
    if (dados.sigiloso && dados.mais) {
      const p = document.createElement('p')
      p.className = 'seirmg-atribuido-para seirmg-atribuido-para-mais'
      p.textContent = `+${dados.mais}`
      p.title = `Mais ${dados.mais} usuário(s) de outra(s) área(s).`
      div.appendChild(p)
    }
  }

  container.appendChild(div)
}
```

por:

```ts
function renderizarAtribuicao(container: HTMLElement, dados: DadosAtribuicao): void {
  const { secao, corpo } = criarSecao(dados.sigiloso ? 'Credencial para' : 'Atribuído para', userCheckIconSvg)
  corpo.id = 'seirmg-atribuicao'

  if (dados.usuarios.length === 0) {
    const p = document.createElement('p')
    p.className = 'seirmg-atribuido-para seirmg-sem-atribuicao'
    p.textContent = '(processo sem atribuição)'
    corpo.appendChild(p)
  } else {
    dados.usuarios.forEach((usuario) => {
      const p = document.createElement('p')
      p.className = 'seirmg-atribuido-para'
      p.title = dados.sigiloso
        ? `Credencial para ${usuario.nome} (${usuario.login}).`
        : `Atribuído para ${usuario.nome} (${usuario.login}).`
      p.textContent = usuario.login
      corpo.appendChild(p)
    })
    if (dados.sigiloso && dados.mais) {
      const p = document.createElement('p')
      p.className = 'seirmg-atribuido-para seirmg-atribuido-para-mais'
      p.textContent = `+${dados.mais}`
      p.title = `Mais ${dados.mais} usuário(s) de outra(s) área(s).`
      corpo.appendChild(p)
    }
  }

  container.appendChild(secao)
}
```

- [ ] **Step 8: Atualizar a seção "Tipo do processo" em `montarPainelTipoEInteressados`**

Substituir:

```ts
  const tipo = extrairTipoProcesso(doc)

  container.appendChild(criarSeparador('Tipo do processo'))
  const divTipo = document.createElement('div')
  divTipo.id = 'seirmg-tipo-processo'
  const pTipo = document.createElement('p')
  pTipo.className = 'seirmg-tipo-processo'
  pTipo.textContent = tipo
  divTipo.appendChild(pTipo)
  container.appendChild(divTipo)
```

por:

```ts
  const tipo = extrairTipoProcesso(doc)

  const { secao: secaoTipo, corpo: divTipo } = criarSecao('Tipo do processo', briefcaseIconSvg)
  divTipo.id = 'seirmg-tipo-processo'
  const pTipo = document.createElement('p')
  pTipo.className = 'seirmg-tipo-processo-texto'
  pTipo.textContent = tipo
  divTipo.appendChild(pTipo)
  container.appendChild(secaoTipo)
```

(`divTipo` continua sendo usado embaixo, sem mudança, pro card do Planka que é anexado nele quando a consulta responde.)

- [ ] **Step 9: Atualizar `renderizarTextoSimples` (Especificação/Observação) e `montarPainelAnotacao`**

Em `montarPainelTipoEInteressados`, substituir:

```ts
  renderizarTextoSimples(container, 'Especificação', 'seirmg-especificacao', extrairEspecificacao(doc), 'Sem especificação.')
  renderizarAssuntos(container, extrairAssuntos(doc))
  renderizarInteressados(container, extrairInteressados(doc))
  renderizarTextoSimples(container, 'Observação', 'seirmg-observacao', extrairObservacao(doc), 'Sem observação.')
```

por:

```ts
  renderizarTextoSimples(container, 'Especificação', 'seirmg-especificacao', extrairEspecificacao(doc), 'Sem especificação.', fileTextIconSvg)
  renderizarAssuntos(container, extrairAssuntos(doc))
  renderizarInteressados(container, extrairInteressados(doc))
  renderizarTextoSimples(container, 'Observação', 'seirmg-observacao', extrairObservacao(doc), 'Sem observação.', messageSquareIconSvg)
```

Em `montarPainelAnotacao`, substituir:

```ts
    const container = document.getElementById('container') ?? document.body

    const separador = document.createElement('div')
    separador.className = 'seirmg-separador'
    const spanSep = document.createElement('span')
    spanSep.textContent = 'Anotações'
    separador.appendChild(spanSep)

    const divAnotacao = document.createElement('div')
    divAnotacao.id = 'seirmg-anotacao'
    container.append(separador, divAnotacao)
```

por:

```ts
    const container = document.getElementById('container') ?? document.body

    const { secao, corpo: divAnotacao } = criarSecao('Anotações', stickyNoteIconSvg)
    divAnotacao.id = 'seirmg-anotacao'
    container.appendChild(secao)
```

- [ ] **Step 10: Typecheck**

Run: `bunx tsc --noEmit` (a partir de `C:\sei\seirmg`)
Expected: sem erros.

- [ ] **Step 11: Rodar a suíte de testes inteira**

Run: `bun run test`
Expected: PASS, sem regressão (este arquivo não tem teste próprio).

- [ ] **Step 12: Substituir o bloco de CSS do painel lateral em `theme.css`**

Substituir o bloco inteiro a partir do comentário `/* ===== Painel lateral — procedimento_visualizar ===== */` até (mas não incluindo) o comentário seguinte `/* ===== Alerta de documentos não assinados — procedimento_enviar ===== */`:

```css
/* ===== Painel lateral — procedimento_visualizar ===== */

p.seirmg-tipo-processo {
  margin: 0 0 0 1.2em;
  font-size: 12px;
}

#seirmg-interessados,
#seirmg-atribuicao {
  margin-left: 1.2em;
}

p.seirmg-interessado,
p.seirmg-atribuido-para {
  margin: 3px 0 0 0;
  font-size: 12px;
}

p.seirmg-atribuido-para.seirmg-sem-atribuicao {
  color: red;
}

p.seirmg-atribuido-para.seirmg-atribuido-para-mais {
  font-size: 11px;
  color: #757575;
}

span.seirmg-copiar-sigla {
  display: inline-flex;
  cursor: pointer;
  margin-left: 4px;
  opacity: 0.6;
}

span.seirmg-copiar-sigla svg {
  width: 12px;
  height: 12px;
}

.seirmg-tooltip-copiado {
  display: inline-block;
  margin-left: 6px;
  font-size: 10px;
  color: #017fff;
}
```

por:

```css
/* ===== Painel lateral — procedimento_visualizar ===== */

.seirmg-secao {
  padding: 9px 6px;
  border-bottom: 1px solid #e2e7f0;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}

.seirmg-secao:last-child {
  border-bottom: none;
}

.seirmg-secao-cabecalho {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #667085;
  margin-bottom: 4px;
}

.seirmg-secao-icone {
  display: inline-flex;
  flex-shrink: 0;
  color: var(--seirmg-accent-color);
}

.seirmg-secao-icone svg {
  width: 13px;
  height: 13px;
  display: block;
}

.seirmg-secao-cabecalho span:last-child {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.seirmg-secao-corpo {
  padding-left: 20px;
  font-size: 12.5px;
  line-height: 1.45;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.seirmg-secao-corpo p {
  margin: 0;
}

.seirmg-vazio {
  color: #667085;
  font-style: italic;
}

.seirmg-badge-nivel {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px 2px 6px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
  width: fit-content;
}

.seirmg-badge-nivel svg {
  width: 12px;
  height: 12px;
  display: block;
}

.seirmg-badge-nivel-publico {
  background: #e7f6ef;
  color: #17875a;
}

.seirmg-badge-nivel-restrito {
  background: #fdf1e6;
  color: #b5530a;
}

.seirmg-badge-nivel-sigiloso {
  background: #fdecec;
  color: #b3261e;
}

.seirmg-hipotese-legal {
  color: #667085;
  font-size: 11.5px;
}

p.seirmg-interessado {
  display: flex;
  align-items: center;
  gap: 6px;
}

.seirmg-interessado-marcador {
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: #667085;
  flex-shrink: 0;
}

.seirmg-interessado-sigla {
  color: #667085;
  font-size: 11px;
}

span.seirmg-copiar-sigla {
  display: inline-flex;
  cursor: pointer;
  margin-left: auto;
  opacity: 0;
  transition: opacity 120ms ease;
}

p.seirmg-interessado:hover span.seirmg-copiar-sigla {
  opacity: 1;
}

span.seirmg-copiar-sigla svg {
  width: 12px;
  height: 12px;
}

.seirmg-tooltip-copiado {
  display: inline-block;
  margin-left: 6px;
  font-size: 10px;
  color: var(--seirmg-accent-color);
}

p.seirmg-atribuido-para {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 2px 9px 2px 3px;
  border-radius: 999px;
  background: #eaf3ff;
  color: var(--seirmg-accent-color);
  font-size: 11.5px;
  font-weight: 600;
}

p.seirmg-atribuido-para.seirmg-sem-atribuicao {
  background: transparent;
  padding: 0;
  color: #b3261e;
  font-weight: 400;
}

p.seirmg-atribuido-para.seirmg-atribuido-para-mais {
  font-size: 11px;
  background: #f4f7fb;
  color: #667085;
}
```

- [ ] **Step 13: Rodar o build**

Run: `bun run build`
Expected: build conclui sem erros.

- [ ] **Step 14: Commit**

```bash
git add src/content-scripts/procedimento_visualizar/index.ts src/content-scripts/core/theme.css
git commit -m "style: redesenha o painel lateral da árvore (ícones, badges, chips)"
```

---

## Verificação manual pendente (fora do escopo de teste automatizado)

Numa instância SEI real: abrir a árvore de um processo e conferir visualmente cada seção contra o mockup
aprovado (https://claude.ai/code/artifact/c27a11ed-cba5-4530-8ae4-56fe94b13554) — ícones aparecendo,
divisores entre seções, badge de Nível de Acesso com a cor certa (verde/laranja/vermelho), botão de copiar
aparecendo ao passar o mouse num interessado, chip de "Atribuído para" com o fundo azul. Testar também nos
3 temas do SEIRMG (claro/black/super-black) pra conferir que nada fica ilegível.
