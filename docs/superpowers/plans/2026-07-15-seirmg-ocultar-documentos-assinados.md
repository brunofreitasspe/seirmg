# SEIRMG — Bloco de Assinatura: ocultar documentos já assinados — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma opção independente (aba Geral das Opções) que, quando ativada, oculta a linha inteira (não só desabilita o checkbox) de documentos já assinados pelo usuário logado ou por um cargo da lista já configurada, no Bloco de Assinatura.

**Architecture:** Extrai a lógica de "qual cargo assinou" (hoje inline em `aplicarDesabilitacaoAssinados`) para uma função pura testada em `features/bloco-assinatura/selecaoDocumentos.ts`, reaproveitada por uma nova função de wiring `aplicarOcultacaoAssinados()` em `content-scripts/rel_bloco_protocolo_listar/index.ts`. Nova flag `featureFlags.ocultarDocumentosAssinados` (default `false`), novo checkbox na aba Geral reaproveitando o campo de texto "cargos adicionais" já existente.

**Tech Stack:** TypeScript, Vitest (jsdom), Vite/CRXJS (extensão Chrome MV3). Sem dependências novas.

## Global Constraints

- As duas opções (desabilitar checkbox / ocultar linha) são independentes — nenhuma desliga a outra.
- "Ocultar" usa a mesma lista de cargos adicionais já configurada (`blocoAssinatura.cargosAdicionais`), sem campo próprio novo.
- `tsconfig.json` tem `noUnusedParameters: true` — qualquer parâmetro de callback não usado precisa do prefixo `_` (ex. `_checkbox`), senão o build quebra.
- Guard `try/catch` em todo wiring de DOM que já tem esse padrão no arquivo (nunca lançar, sempre `console.error('[SEIRMG] ...', error)`).
- Lógica pura testada em `features/`; wiring de DOM em `content-scripts/`/`options/` sem teste automatizado (padrão já estabelecido no projeto — verificado via build/typecheck).

---

## Task 1: Extrair `encontrarCargoAssinante` em `selecaoDocumentos.ts`

**Files:**
- Modify: `src/features/bloco-assinatura/selecaoDocumentos.ts`
- Test: `src/features/bloco-assinatura/selecaoDocumentos.test.ts`

**Interfaces:**
- Consumes: `contemTermoNasAssinaturas(textoAssinaturas: string, termo: string): boolean` (já existe, inalterada).
- Produces: `encontrarCargoAssinante(textoAssinaturas: string, cargos: string[]): string | null` — usada pela Task 2 (em `aplicarDesabilitacaoAssinados`, substituindo o `cargos.find(...)` inline, e pela nova `aplicarOcultacaoAssinados`).

- [ ] **Step 1: Adicionar os testes novos em `selecaoDocumentos.test.ts`**

Adicionar ao final do arquivo (depois do último `describe`, mantendo tudo que já existe):

```ts
describe('encontrarCargoAssinante', () => {
  it('retorna o primeiro cargo da lista cujo termo aparece nas assinaturas', () => {
    expect(
      encontrarCargoAssinante('Assinado por João (Diretor)', ['Vice-Diretor', 'Diretor'])
    ).toBe('Diretor')
  })

  it('retorna null quando nenhum cargo da lista aparece', () => {
    expect(encontrarCargoAssinante('Assinado por Maria', ['Diretor', 'Vice-Diretor'])).toBeNull()
  })

  it('retorna null para lista de cargos vazia', () => {
    expect(encontrarCargoAssinante('Assinado por Maria (Diretor)', [])).toBeNull()
  })

  it('retorna null quando não há assinaturas', () => {
    expect(encontrarCargoAssinante('', ['Diretor'])).toBeNull()
  })
})
```

E adicionar `encontrarCargoAssinante` ao import no topo do arquivo:

```ts
import {
  contemTermoNasAssinaturas,
  deveSelecionar,
  encontrarCargoAssinante,
  encontrarIndiceColunaAssinaturas,
  extrairNomeUsuario,
  marcarCheckboxComoJaAssinado,
  tituloCheckboxJaAssinadoPorCargo,
} from './selecaoDocumentos'
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd C:\sei\seirmg && npx vitest run src/features/bloco-assinatura/selecaoDocumentos.test.ts`
Expected: FAIL — `encontrarCargoAssinante` não exportada.

- [ ] **Step 3: Implementar `encontrarCargoAssinante` em `selecaoDocumentos.ts`**

Adicionar, logo depois da função `contemTermoNasAssinaturas` (que já existe no arquivo):

```ts
export function encontrarCargoAssinante(textoAssinaturas: string, cargos: string[]): string | null {
  return cargos.find((cargo) => contemTermoNasAssinaturas(textoAssinaturas, cargo)) ?? null
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd C:\sei\seirmg && npx vitest run src/features/bloco-assinatura/selecaoDocumentos.test.ts`
Expected: PASS (todos os `describe`, incluindo o novo `encontrarCargoAssinante`).

- [ ] **Step 5: Commit**

```bash
cd C:\sei\seirmg
git add src/features/bloco-assinatura/selecaoDocumentos.ts src/features/bloco-assinatura/selecaoDocumentos.test.ts
git commit -m "$(cat <<'EOF'
refactor: extrai encontrarCargoAssinante de selecaoDocumentos.ts

Mesma lógica que já existia inline dentro de aplicarDesabilitacaoAssinados
(content-scripts/rel_bloco_protocolo_listar/index.ts) — agora pura,
testada e reaproveitável pela próxima funcionalidade (ocultar linha).
EOF
)"
```

---

## Task 2: Adicionar `featureFlags.ocultarDocumentosAssinados` em `lib/storage.ts`

**Files:**
- Modify: `src/lib/storage.ts:1-5` (interface `FeatureFlags`), `src/lib/storage.ts` (bloco `DEFAULT_SYNC_CONFIG.featureFlags`)
- Test: `src/lib/storage.test.ts`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: `FeatureFlags.ocultarDocumentosAssinados: boolean` — usada pelas Tasks 3 e 4.

- [ ] **Step 1: Adicionar o teste de default em `storage.test.ts`**

Logo depois do teste existente `it('inclui selecaoEmMassaBlocoAssinatura ativo por padrão', ...)` (por volta da linha 41-44), adicionar:

```ts
  it('inclui ocultarDocumentosAssinados desativado por padrão', async () => {
    const store = createSyncConfigStore(criarAreaFalsa())
    expect((await store.get()).featureFlags.ocultarDocumentosAssinados).toBe(false)
  })
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd C:\sei\seirmg && npx vitest run src/lib/storage.test.ts`
Expected: FAIL — `ocultarDocumentosAssinados` é `undefined`, não `false`.

- [ ] **Step 3: Atualizar a interface `FeatureFlags`**

Em `src/lib/storage.ts`, trocar:

```ts
export interface FeatureFlags {
  blocoAssinaturaNotificacoes: boolean
  selecaoEmMassaBlocoAssinatura: boolean
  desabilitarDocumentosAssinados: boolean
}
```

por:

```ts
export interface FeatureFlags {
  blocoAssinaturaNotificacoes: boolean
  selecaoEmMassaBlocoAssinatura: boolean
  desabilitarDocumentosAssinados: boolean
  ocultarDocumentosAssinados: boolean
}
```

- [ ] **Step 4: Atualizar o default em `DEFAULT_SYNC_CONFIG`**

No mesmo arquivo, trocar:

```ts
  featureFlags: {
    blocoAssinaturaNotificacoes: true,
    selecaoEmMassaBlocoAssinatura: true,
    desabilitarDocumentosAssinados: true,
  },
```

por:

```ts
  featureFlags: {
    blocoAssinaturaNotificacoes: true,
    selecaoEmMassaBlocoAssinatura: true,
    desabilitarDocumentosAssinados: true,
    ocultarDocumentosAssinados: false,
  },
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `cd C:\sei\seirmg && npx vitest run src/lib/storage.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd C:\sei\seirmg
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "$(cat <<'EOF'
feat: adiciona featureFlags.ocultarDocumentosAssinados (default off)

Nova flag independente de desabilitarDocumentosAssinados — controla
se a linha do documento já assinado é ocultada inteira, não só o
checkbox desabilitado.
EOF
)"
```

---

## Task 3: Ocultar a linha em `content-scripts/rel_bloco_protocolo_listar/index.ts`

**Files:**
- Modify: `src/content-scripts/rel_bloco_protocolo_listar/index.ts`

**Interfaces:**
- Consumes:
  - `encontrarCargoAssinante(textoAssinaturas: string, cargos: string[]): string | null` (Task 1)
  - `deveSelecionar(tipo, textoAssinaturas, usuario): boolean` (já existe, inalterada)
  - `syncConfig.featureFlags.ocultarDocumentosAssinados: boolean` (Task 2)
- Produces: nada consumido por outra task (content script final, sem exports).

Sem teste automatizado (wiring de DOM, mesmo padrão já estabelecido pro resto deste arquivo).

- [ ] **Step 1: Atualizar o import do topo do arquivo**

Trocar:

```ts
import {
  contemTermoNasAssinaturas,
  deveSelecionar,
  encontrarIndiceColunaAssinaturas,
  extrairNomeUsuario,
  marcarCheckboxComoJaAssinado,
  tituloCheckboxJaAssinadoPorCargo,
  type TipoSelecaoDocumentos,
} from '../../features/bloco-assinatura/selecaoDocumentos'
```

por:

```ts
import {
  deveSelecionar,
  encontrarCargoAssinante,
  encontrarIndiceColunaAssinaturas,
  extrairNomeUsuario,
  marcarCheckboxComoJaAssinado,
  tituloCheckboxJaAssinadoPorCargo,
  type TipoSelecaoDocumentos,
} from '../../features/bloco-assinatura/selecaoDocumentos'
```

(`contemTermoNasAssinaturas` deixa de ser usada diretamente neste arquivo — quem a chama agora é
`encontrarCargoAssinante`, dentro de `selecaoDocumentos.ts`.)

- [ ] **Step 2: Mudar a assinatura de `paraCadaLinhaDeDocumento` pra incluir a linha**

Trocar:

```ts
function paraCadaLinhaDeDocumento(
  callback: (checkbox: HTMLInputElement, textoAssinaturas: string) => void
): void {
  const tabela = document.querySelector('#divInfraAreaTabela')
  if (!tabela) return

  const cabecalhos = Array.from(tabela.querySelectorAll('tr > th')).map(
    (th) => th.textContent?.trim() ?? ''
  )
  const indiceAssinaturas = encontrarIndiceColunaAssinaturas(cabecalhos)

  const linhas = tabela.querySelectorAll('tbody > tr[id^="trSeq"], tbody > tr[id^="trPos"]')
  linhas.forEach((linha) => {
    const checkbox = linha.querySelector<HTMLInputElement>('input[type="checkbox"]')
    if (!checkbox) return

    const celulaAssinaturas = linha.querySelectorAll('td')[indiceAssinaturas]
    const textoAssinaturas = celulaAssinaturas?.textContent?.trim() ?? ''
    callback(checkbox, textoAssinaturas)
  })
}
```

por:

```ts
function paraCadaLinhaDeDocumento(
  callback: (linha: Element, checkbox: HTMLInputElement, textoAssinaturas: string) => void
): void {
  const tabela = document.querySelector('#divInfraAreaTabela')
  if (!tabela) return

  const cabecalhos = Array.from(tabela.querySelectorAll('tr > th')).map(
    (th) => th.textContent?.trim() ?? ''
  )
  const indiceAssinaturas = encontrarIndiceColunaAssinaturas(cabecalhos)

  const linhas = tabela.querySelectorAll('tbody > tr[id^="trSeq"], tbody > tr[id^="trPos"]')
  linhas.forEach((linha) => {
    const checkbox = linha.querySelector<HTMLInputElement>('input[type="checkbox"]')
    if (!checkbox) return

    const celulaAssinaturas = linha.querySelectorAll('td')[indiceAssinaturas]
    const textoAssinaturas = celulaAssinaturas?.textContent?.trim() ?? ''
    callback(linha, checkbox, textoAssinaturas)
  })
}
```

- [ ] **Step 3: Ajustar os dois chamadores existentes pra nova assinatura**

Trocar:

```ts
function aplicarSelecao(tipo: TipoSelecaoDocumentos, usuario: string): void {
  paraCadaLinhaDeDocumento((checkbox, textoAssinaturas) => {
    const selecionado = deveSelecionar(tipo, textoAssinaturas, usuario)
    if (selecionado !== checkbox.checked) checkbox.click()
  })
}
```

por:

```ts
function aplicarSelecao(tipo: TipoSelecaoDocumentos, usuario: string): void {
  paraCadaLinhaDeDocumento((_linha, checkbox, textoAssinaturas) => {
    const selecionado = deveSelecionar(tipo, textoAssinaturas, usuario)
    if (selecionado !== checkbox.checked) checkbox.click()
  })
}
```

E trocar (dentro de `aplicarDesabilitacaoAssinados`):

```ts
    paraCadaLinhaDeDocumento((checkbox, textoAssinaturas) => {
      if (usuario && deveSelecionar('com-minha-assinatura', textoAssinaturas, usuario)) {
        marcarCheckboxComoJaAssinado(checkbox)
        return
      }

      const cargoAssinante = cargos.find((cargo) => contemTermoNasAssinaturas(textoAssinaturas, cargo))
      if (cargoAssinante) {
        marcarCheckboxComoJaAssinado(checkbox, tituloCheckboxJaAssinadoPorCargo(cargoAssinante))
      }
    })
```

por:

```ts
    paraCadaLinhaDeDocumento((_linha, checkbox, textoAssinaturas) => {
      if (usuario && deveSelecionar('com-minha-assinatura', textoAssinaturas, usuario)) {
        marcarCheckboxComoJaAssinado(checkbox)
        return
      }

      const cargoAssinante = encontrarCargoAssinante(textoAssinaturas, cargos)
      if (cargoAssinante) {
        marcarCheckboxComoJaAssinado(checkbox, tituloCheckboxJaAssinadoPorCargo(cargoAssinante))
      }
    })
```

- [ ] **Step 4: Adicionar `aplicarOcultacaoAssinados()`**

Logo depois da função `aplicarDesabilitacaoAssinados` (que termina com o `catch` dela), adicionar:

```ts
async function aplicarOcultacaoAssinados(): Promise<void> {
  try {
    const syncConfig = await createSyncConfigStore().get()
    if (!syncConfig.featureFlags.ocultarDocumentosAssinados) return

    if (!estaNaTelaDoBloco()) return

    const usuario = obterNomeUsuarioLogado()
    const cargos = (syncConfig.blocoAssinatura.cargosAdicionais ?? []).filter((cargo) => cargo.trim() !== '')
    if (!usuario && cargos.length === 0) return

    paraCadaLinhaDeDocumento((linha, _checkbox, textoAssinaturas) => {
      const assinadoPorMim = usuario ? deveSelecionar('com-minha-assinatura', textoAssinaturas, usuario) : false
      const cargoAssinante = encontrarCargoAssinante(textoAssinaturas, cargos)

      if (assinadoPorMim || cargoAssinante) {
        ;(linha as HTMLElement).style.display = 'none'
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao ocultar documentos já assinados:', error)
  }
}
```

- [ ] **Step 5: Chamar a nova função no bootstrap do arquivo e no `MutationObserver`**

No final do arquivo, trocar:

```ts
processarPagina()
montarSelecaoDocumentos()
aplicarDesabilitacaoAssinados()

const areaTabela = document.querySelector('#divInfraAreaTabela')
if (areaTabela) {
  const observer = new MutationObserver(() => {
    processarPagina()
    aplicarDesabilitacaoAssinados()
  })
  observer.observe(areaTabela, { childList: true, subtree: true })
}
```

por:

```ts
processarPagina()
montarSelecaoDocumentos()
aplicarDesabilitacaoAssinados()
aplicarOcultacaoAssinados()

const areaTabela = document.querySelector('#divInfraAreaTabela')
if (areaTabela) {
  const observer = new MutationObserver(() => {
    processarPagina()
    aplicarDesabilitacaoAssinados()
    aplicarOcultacaoAssinados()
  })
  observer.observe(areaTabela, { childList: true, subtree: true })
}
```

- [ ] **Step 6: Typecheck**

Run: `cd C:\sei\seirmg && npx tsc --noEmit`
Expected: sem erros (nenhuma referência restante a `contemTermoNasAssinaturas` neste arquivo; parâmetros não
usados prefixados com `_`).

- [ ] **Step 7: Lint**

Run: `cd C:\sei\seirmg && npx eslint src`
Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
cd C:\sei\seirmg
git add src/content-scripts/rel_bloco_protocolo_listar/index.ts
git commit -m "$(cat <<'EOF'
feat: opção de ocultar (não só desabilitar) documentos já assinados

Nova aplicarOcultacaoAssinados(), independente de
aplicarDesabilitacaoAssinados() — mesma detecção (assinatura do
usuário logado OU de um cargo da lista já configurada), mas oculta a
linha inteira (display: none) em vez de só desabilitar o checkbox.
paraCadaLinhaDeDocumento agora também entrega a própria linha ao
callback, pra permitir isso.
EOF
)"
```

---

## Task 4: Opção na aba Geral (`options/index.html` + `options/main.ts`)

**Files:**
- Modify: `src/options/index.html` (seção `#painel-geral`)
- Modify: `src/options/main.ts` (`carregarAbaGeral`)

**Interfaces:**
- Consumes: `FeatureFlags.ocultarDocumentosAssinados: boolean` (Task 2).
- Produces: nada consumido por outra task.

- [ ] **Step 1: Adicionar o checkbox no HTML**

Em `src/options/index.html`, trocar:

```html
      <label>
        <input type="checkbox" id="geral-desabilitar-assinados-ativo" />
        Desabilitar checkbox de documentos já assinados por mim no bloco de assinatura
      </label>
      <label>
        Também desabilitar se já assinado por alguém deste(s) cargo(s) (separe por vírgula):
        <input type="text" id="geral-cargos-adicionais" placeholder="Diretor, Vice-Diretor" />
      </label>
```

por:

```html
      <label>
        <input type="checkbox" id="geral-desabilitar-assinados-ativo" />
        Desabilitar checkbox de documentos já assinados por mim no bloco de assinatura
      </label>
      <label>
        <input type="checkbox" id="geral-ocultar-assinados-ativo" />
        Ocultar (não apenas desabilitar) documentos já assinados por mim no bloco de assinatura
      </label>
      <label>
        Também considerar assinado por alguém deste(s) cargo(s), pras duas opções acima (separe por vírgula):
        <input type="text" id="geral-cargos-adicionais" placeholder="Diretor, Vice-Diretor" />
      </label>
```

- [ ] **Step 2: Ler/gravar o novo campo em `carregarAbaGeral` (`main.ts`)**

Em `src/options/main.ts`, trocar (declaração dos inputs, dentro de `carregarAbaGeral`):

```ts
    const inputDesabilitarAssinados = document.getElementById(
      'geral-desabilitar-assinados-ativo'
    ) as HTMLInputElement | null
    const inputCargosAdicionais = document.getElementById(
      'geral-cargos-adicionais'
    ) as HTMLInputElement | null
```

por:

```ts
    const inputDesabilitarAssinados = document.getElementById(
      'geral-desabilitar-assinados-ativo'
    ) as HTMLInputElement | null
    const inputOcultarAssinados = document.getElementById(
      'geral-ocultar-assinados-ativo'
    ) as HTMLInputElement | null
    const inputCargosAdicionais = document.getElementById(
      'geral-cargos-adicionais'
    ) as HTMLInputElement | null
```

Trocar (carregamento do valor salvo):

```ts
    if (inputDesabilitarAssinados) {
      inputDesabilitarAssinados.checked = config.featureFlags.desabilitarDocumentosAssinados
    }
```

por:

```ts
    if (inputDesabilitarAssinados) {
      inputDesabilitarAssinados.checked = config.featureFlags.desabilitarDocumentosAssinados
    }
    if (inputOcultarAssinados) {
      inputOcultarAssinados.checked = config.featureFlags.ocultarDocumentosAssinados
    }
```

Trocar (gravação ao salvar):

```ts
          featureFlags: {
            ...config.featureFlags,
            selecaoEmMassaBlocoAssinatura: inputSelecaoMassa?.checked ?? true,
            desabilitarDocumentosAssinados: inputDesabilitarAssinados?.checked ?? true,
          },
```

por:

```ts
          featureFlags: {
            ...config.featureFlags,
            selecaoEmMassaBlocoAssinatura: inputSelecaoMassa?.checked ?? true,
            desabilitarDocumentosAssinados: inputDesabilitarAssinados?.checked ?? true,
            ocultarDocumentosAssinados: inputOcultarAssinados?.checked ?? false,
          },
```

- [ ] **Step 3: Typecheck**

Run: `cd C:\sei\seirmg && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Build**

Run: `cd C:\sei\seirmg && npm run build`
Expected: build sem erros.

- [ ] **Step 5: Commit**

```bash
cd C:\sei\seirmg
git add src/options/index.html src/options/main.ts
git commit -m "$(cat <<'EOF'
feat: aba Geral ganha opção de ocultar documentos já assinados

Reaproveita o mesmo campo de "cargos adicionais" já usado pelo
desabilitar checkbox — mesma detecção, resultado visual diferente.
EOF
)"
```

---

## Task 5: Verificação final

**Files:** nenhum arquivo novo — task de verificação.

- [ ] **Step 1: Rodar a suíte de testes inteira**

Run: `cd C:\sei\seirmg && npx vitest run`
Expected: todos os testes passam.

- [ ] **Step 2: Typecheck do projeto inteiro**

Run: `cd C:\sei\seirmg && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Lint**

Run: `cd C:\sei\seirmg && npx eslint src`
Expected: sem erros.

- [ ] **Step 4: Build final**

Run: `cd C:\sei\seirmg && npm run build`
Expected: build sem erros, `dist/` gerado.

- [ ] **Step 5: Atualizar `docs/ROADMAP-LOTES.md`**

Adicionar uma entrada em "Já entregue" (junto da entrada existente da "Melhoria do Lote B — Desabilitar
checkbox de documentos já assinados") descrevendo esta nova opção de ocultar, com link pra spec e plano.

- [ ] **Step 6: Verificação manual (⚠️ requer instância SEI real)**

Carregar `dist/` como extensão descompactada no Chrome, abrir a tela do Bloco de Assinatura numa instância
SEI real, ativar "Ocultar documentos já assinados" nas Opções (aba Geral) e confirmar:
- Documentos já assinados por mim somem da lista (não aparecem mais, nem desabilitados — somem de vez).
- Documentos assinados só por um cargo da lista configurada também somem.
- Documentos não assinados continuam visíveis e selecionáveis normalmente.
- Desligar a opção nas Opções e recarregar a página faz as linhas voltarem a aparecer.
- A opção "Desabilitar checkbox" continua funcionando normalmente de forma independente (testar as duas
  ligadas ao mesmo tempo, e cada uma sozinha).

---
