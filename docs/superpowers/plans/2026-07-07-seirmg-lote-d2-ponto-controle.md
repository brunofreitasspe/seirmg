# SEIRMG — Lote D2: Ponto de Controle com Cor Customizável Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar `colorToFilter.js` (solver de filtro CSS que aproxima uma cor HEX/RGB alvo) e `pontoControleCores.js` do Sei++, reaproveitando o componente `listaEditavel.ts` genérico já entregue no Lote D. O filtro é computado e cacheado ao salvar nas opções, não recalculado a cada página.

**Architecture:** Ver `docs/superpowers/specs/2026-07-07-seirmg-lote-d2-ponto-controle-design.md`. Lógica pura testável em `features/`, wiring fino não-testado em `content-scripts/`/`options/main.ts`.

**Tech Stack:** TypeScript, Vite, `@crxjs/vite-plugin`, Bun, Vitest — mesma infraestrutura já existente. Nenhuma dependência nova.

## Global Constraints

- Nenhuma permissão nova, nenhum host novo — só um bloco a mais de `content_scripts`, `matches` idêntico ao já usado pelo `core` (`acao=*`).
- `colorToFilter` é testado por **contrato** (não lança para entrada válida, formato de saída via regex, lança `Error` para formato inválido) — nunca por valor exato de saída, já que o solver interno usa busca aleatória (SPSA) e a mesma cor pode gerar filtros ligeiramente diferentes entre execuções.
- O filtro é calculado uma única vez, no momento em que o usuário salva a regra nas opções (`options/main.ts`), e persistido junto da regra — o content script só lê o `filter` já pronto, nunca chama `colorToFilter`.
- Todo listener/callback assíncrono novo segue o padrão já estabelecido: guard `try/catch`, loga via `console.error('[SEIRMG] ...', error)`, nunca lança exceção não tratada.

---

## Mapa de arquivos (visão geral)

```
seirmg/
├── manifest.config.ts (modificado)
├── src/
│   ├── lib/storage.ts (modificado)
│   ├── features/ponto-controle/
│   │   ├── colorToFilter.ts (+ .test.ts, novo)
│   │   └── seletor.ts (+ .test.ts, novo)
│   ├── content-scripts/ponto_controle/index.ts (novo)
│   └── options/index.html, main.ts (modificados)
```

---

### Task 1: `lib/storage.ts` — schema de `pontoControle`

**Files:**
- Modify: `C:\sei\seirmg\src\lib\storage.ts`
- Modify: `C:\sei\seirmg\src\lib\storage.test.ts`

**Interfaces:**
- Consumes: nenhuma
- Produces: `ConfiguracaoPontoControle { nome: string; cor: string; filter: string }`; `PontoControleConfig { ativo: boolean; regras: ConfiguracaoPontoControle[] }`; `SyncConfig.pontoControle: PontoControleConfig`; `DEFAULT_SYNC_CONFIG.pontoControle = { ativo: true, regras: [] }`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final do `describe('createSyncConfigStore', ...)` já existente em `src/lib/storage.test.ts`:

```ts
  it('inclui pontoControle padrão quando vazio', async () => {
    const store = createSyncConfigStore(criarAreaFalsa())
    expect((await store.get()).pontoControle).toEqual({ ativo: true, regras: [] })
  })

  it('persiste alteração de pontoControle', async () => {
    const area = criarAreaFalsa()
    const store = createSyncConfigStore(area)
    const atualizado = {
      ...DEFAULT_SYNC_CONFIG,
      pontoControle: {
        ativo: false,
        regras: [{ nome: 'Concluído', cor: '#00ff00', filter: 'filter: invert(1);' }],
      },
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/lib/storage.test.ts`
Expected: FAIL — `pontoControle` é `undefined` (campo ainda não existe em `SyncConfig`/`DEFAULT_SYNC_CONFIG`)

- [ ] **Step 3: Implementar em `src/lib/storage.ts`**

Adicionar as interfaces novas (depois de `ControleProcessosConfig`, antes de `SyncConfig`):

```ts
export interface ConfiguracaoPontoControle {
  nome: string
  cor: string
  filter: string
}

export interface PontoControleConfig {
  ativo: boolean
  regras: ConfiguracaoPontoControle[]
}
```

Modificar `SyncConfig` (adicionar o campo `pontoControle` depois de `controleProcessos`):

```ts
export interface SyncConfig {
  schemaVersion: 1
  featureFlags: FeatureFlags
  tema: ThemeConfig
  blocoAssinatura: BlocoAssinaturaConfig
  processosNovos: ProcessosNovosConfig
  controleProcessos: ControleProcessosConfig
  pontoControle: PontoControleConfig
}
```

Modificar `DEFAULT_SYNC_CONFIG` (adicionar `pontoControle` depois de `controleProcessos`):

```ts
  pontoControle: {
    ativo: true,
    regras: [],
  },
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/lib/storage.test.ts`
Expected: PASS (16 testes — 14 já existentes + 2 novos)

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "feat(storage): add pontoControle config schema"
```

---

### Task 2: `features/ponto-controle/colorToFilter.ts`

**Files:**
- Create: `C:\sei\seirmg\src\features\ponto-controle\colorToFilter.ts`
- Test: `C:\sei\seirmg\src\features\ponto-controle\colorToFilter.test.ts`

**Contexto**: porte de `C:\sei\seiplus\cs_modules\lib\colorToFilter.js` (baseado em [css-color-filter-generator](https://github.com/angel-rs/css-color-filter-generator)). `Color`/`Solver` são detalhes de implementação do solver SPSA, não exportados.

**Interfaces:**
- Consumes: nenhuma
- Produces: `isHEXValid(color: string): boolean`; `isRGBValid(color: string): boolean`; `hexToRgb(hex: string): [number, number, number] | null`; `rgbToHex(r: number, g: number, b: number): string`; `colorToFilter(input: string): string`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/features/ponto-controle/colorToFilter.test.ts
import { describe, expect, it } from 'vitest'
import { colorToFilter, hexToRgb, isHEXValid, isRGBValid, rgbToHex } from './colorToFilter'

describe('isHEXValid', () => {
  it('aceita HEX de 6 dígitos', () => {
    expect(isHEXValid('#ff0000')).toBe(true)
  })

  it('aceita HEX de 3 dígitos', () => {
    expect(isHEXValid('#f00')).toBe(true)
  })

  it('rejeita string sem #', () => {
    expect(isHEXValid('ff0000')).toBe(false)
  })

  it('rejeita HEX com tamanho inválido', () => {
    expect(isHEXValid('#ff00')).toBe(false)
  })
})

describe('isRGBValid', () => {
  it('aceita "rgb(255, 0, 0)"', () => {
    expect(isRGBValid('rgb(255, 0, 0)')).toBe(true)
  })

  it('aceita "255,0,0" sem o prefixo rgb', () => {
    expect(isRGBValid('255,0,0')).toBe(true)
  })

  it('rejeita valores de componente fora de 0-255', () => {
    expect(isRGBValid('300,0,0')).toBe(false)
  })

  it('rejeita prefixo sem fechamento', () => {
    expect(isRGBValid('rgb(255,0,0')).toBe(false)
  })
})

describe('hexToRgb', () => {
  it('converte HEX de 6 dígitos', () => {
    expect(hexToRgb('#ff0000')).toEqual([255, 0, 0])
  })

  it('expande e converte HEX de 3 dígitos', () => {
    expect(hexToRgb('#f00')).toEqual([255, 0, 0])
  })

  it('retorna null para HEX malformado', () => {
    expect(hexToRgb('#zzzzzz')).toBeNull()
  })
})

describe('rgbToHex', () => {
  it('converte componentes RGB para HEX', () => {
    expect(rgbToHex(255, 0, 0)).toBe('#ff0000')
  })

  it('preenche com zero à esquerda componentes de um dígito', () => {
    expect(rgbToHex(0, 0, 0)).toBe('#000000')
  })
})

describe('colorToFilter', () => {
  it('lança erro para formato inválido', () => {
    expect(() => colorToFilter('não é uma cor')).toThrow('Invalid format!')
  })

  it('retorna uma string de filtro CSS válida para HEX', () => {
    const filtro = colorToFilter('#ff0000')
    expect(filtro).toMatch(
      /^brightness\(0\) saturate\(100%\) invert\(-?\d+%\) sepia\(-?\d+%\) saturate\(-?\d+%\) hue-rotate\(-?\d+deg\) brightness\(-?\d+%\) contrast\(-?\d+%\)$/
    )
  })

  it('retorna uma string de filtro CSS válida para RGB', () => {
    const filtro = colorToFilter('rgb(0, 255, 0)')
    expect(filtro).toMatch(/^brightness\(0\) saturate\(100%\)/)
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/features/ponto-controle/colorToFilter.test.ts`
Expected: FAIL — `Cannot find module './colorToFilter'`

- [ ] **Step 3: Implementar `src/features/ponto-controle/colorToFilter.ts`**

```ts
export function isHEXValid(color: string): boolean {
  const HEXColorRegExp = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
  return HEXColorRegExp.test(color)
}

export function isRGBValid(color: string): boolean {
  const RGBColorRegExp = /^(rgb\()?\d{1,3}, ?\d{1,3}, ?\d{1,3}(\))?$/i

  if (!RGBColorRegExp.test(color)) return false

  const lower = color.toLowerCase()
  const startCheck = lower.startsWith('rgb')
  const endCheck = lower.endsWith(')')
  if ((startCheck && !endCheck) || (!startCheck && endCheck)) return false

  const [r, g, b] = lower
    .replace(/^rgb\(|\)| /, '')
    .split(',')
    .map((x) => parseInt(x))

  return r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255
}

function expandHex(hextexp: string): string {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i
  return hextexp.replace(shorthandRegex, (_m, r, g, b) => r + r + g + g + b + b)
}

export function rgbToHex(r: number, g: number, b: number): string {
  function componentToHex(c: number): string {
    const hex = c.toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }
  return '#' + componentToHex(r) + componentToHex(g) + componentToHex(b)
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const expandedHex = expandHex(hex)
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(expandedHex)
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : null
}

function trimRgb(rgb: string): [number, number, number] {
  const [r, g, b] = rgb
    .replace(/rgb\(|\) /i, '')
    .split(',')
    .map((x) => parseInt(x))
  return [r, g, b]
}

export function colorToFilter(input: string): string {
  let rgb: [number, number, number] | null

  if (isHEXValid(input)) {
    rgb = hexToRgb(input)
  } else if (isRGBValid(input)) {
    rgb = trimRgb(input)
  } else {
    throw new Error('Invalid format!')
  }

  if (!rgb || rgb.length !== 3) {
    throw new Error('Invalid format!')
  }

  for (let i = 0; i < 10; i++) {
    const color = new Color(rgb[0], rgb[1], rgb[2])
    const solver = new Solver(color)
    const result = solver.solve()
    if (result.loss < 1) {
      return String(result.filterRaw)
    }
  }
  throw new Error('No suitable filter found!')
}

class Color {
  r: number
  g: number
  b: number

  constructor(r: number, g: number, b: number) {
    this.r = this.clamp(r)
    this.g = this.clamp(g)
    this.b = this.clamp(b)
  }

  set(r: number, g: number, b: number): void {
    this.r = this.clamp(r)
    this.g = this.clamp(g)
    this.b = this.clamp(b)
  }

  hueRotate(angle = 0): void {
    const rad = (angle / 180) * Math.PI
    const sin = Math.sin(rad)
    const cos = Math.cos(rad)

    this.multiply([
      0.213 + cos * 0.787 - sin * 0.213,
      0.715 - cos * 0.715 - sin * 0.715,
      0.072 - cos * 0.072 + sin * 0.928,
      0.213 - cos * 0.213 + sin * 0.143,
      0.715 + cos * 0.285 + sin * 0.14,
      0.072 - cos * 0.072 - sin * 0.283,
      0.213 - cos * 0.213 - sin * 0.787,
      0.715 - cos * 0.715 + sin * 0.715,
      0.072 + cos * 0.928 + sin * 0.072,
    ])
  }

  sepia(value = 1): void {
    this.multiply([
      0.393 + 0.607 * (1 - value),
      0.769 - 0.769 * (1 - value),
      0.189 - 0.189 * (1 - value),
      0.349 - 0.349 * (1 - value),
      0.686 + 0.314 * (1 - value),
      0.168 - 0.168 * (1 - value),
      0.272 - 0.272 * (1 - value),
      0.534 - 0.534 * (1 - value),
      0.131 + 0.869 * (1 - value),
    ])
  }

  saturate(value = 1): void {
    this.multiply([
      0.213 + 0.787 * value,
      0.715 - 0.715 * value,
      0.072 - 0.072 * value,
      0.213 - 0.213 * value,
      0.715 + 0.285 * value,
      0.072 - 0.072 * value,
      0.213 - 0.213 * value,
      0.715 - 0.715 * value,
      0.072 + 0.928 * value,
    ])
  }

  multiply(matrix: number[]): void {
    const newR = this.clamp(this.r * matrix[0] + this.g * matrix[1] + this.b * matrix[2])
    const newG = this.clamp(this.r * matrix[3] + this.g * matrix[4] + this.b * matrix[5])
    const newB = this.clamp(this.r * matrix[6] + this.g * matrix[7] + this.b * matrix[8])
    this.r = newR
    this.g = newG
    this.b = newB
  }

  brightness(value = 1): void {
    this.linear(value)
  }

  contrast(value = 1): void {
    this.linear(value, -(0.5 * value) + 0.5)
  }

  linear(slope = 1, intercept = 0): void {
    this.r = this.clamp(this.r * slope + intercept * 255)
    this.g = this.clamp(this.g * slope + intercept * 255)
    this.b = this.clamp(this.b * slope + intercept * 255)
  }

  invert(value = 1): void {
    this.r = this.clamp((value + (this.r / 255) * (1 - 2 * value)) * 255)
    this.g = this.clamp((value + (this.g / 255) * (1 - 2 * value)) * 255)
    this.b = this.clamp((value + (this.b / 255) * (1 - 2 * value)) * 255)
  }

  hsl(): { h: number; s: number; l: number } {
    const r = this.r / 255
    const g = this.g / 255
    const b = this.b / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    let h = 0
    let s = 0
    const l = (max + min) / 2

    if (max !== min) {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0)
          break
        case g:
          h = (b - r) / d + 2
          break
        case b:
          h = (r - g) / d + 4
          break
      }
      h /= 6
    }

    return { h: h * 100, s: s * 100, l: l * 100 }
  }

  clamp(value: number): number {
    if (value > 255) return 255
    if (value < 0) return 0
    return value
  }
}

class Solver {
  target: Color
  targetHSL: { h: number; s: number; l: number }
  reusedColor: Color

  constructor(target: Color) {
    this.target = target
    this.targetHSL = target.hsl()
    this.reusedColor = new Color(0, 0, 0)
  }

  solve(): { values: number[]; loss: number; filter: string; filterRaw: string } {
    const result = this.solveNarrow(this.solveWide())
    return {
      values: result.values,
      loss: result.loss,
      filter: this.css(result.values),
      filterRaw: this.raw(result.values),
    }
  }

  solveWide(): { values: number[]; loss: number } {
    const A = 5
    const c = 15
    const a = [60, 180, 18000, 600, 1.2, 1.2]

    let best: { loss: number; values: number[] } = { loss: Infinity, values: [] }
    for (let i = 0; best.loss > 25 && i < 3; i++) {
      const initial = [50, 20, 3750, 50, 100, 100]
      const result = this.spsa(A, a, c, initial, 1000)
      if (result.loss < best.loss) {
        best = result
      }
    }
    return best
  }

  solveNarrow(wide: { values: number[]; loss: number }): { values: number[]; loss: number } {
    const A = wide.loss
    const c = 2
    const A1 = A + 1
    const a = [0.25 * A1, 0.25 * A1, A1, 0.25 * A1, 0.2 * A1, 0.2 * A1]
    return this.spsa(A, a, c, wide.values, 500)
  }

  spsa(
    A: number,
    a: number[],
    c: number,
    values: number[],
    iters: number
  ): { values: number[]; loss: number } {
    const alpha = 1
    const gamma = 0.16666666666666666

    let best: number[] | null = null
    let bestLoss = Infinity
    const deltas = new Array(6)
    const highArgs = new Array(6)
    const lowArgs = new Array(6)

    function fix(value: number, idx: number): number {
      let max = 100
      if (idx === 2) {
        max = 7500
      } else if (idx === 4 || idx === 5) {
        max = 200
      }

      if (idx === 3) {
        if (value > max) {
          value %= max
        } else if (value < 0) {
          value = max + (value % max)
        }
      } else if (value < 0) {
        value = 0
      } else if (value > max) {
        value = max
      }
      return value
    }

    for (let k = 0; k < iters; k++) {
      const ck = c / Math.pow(k + 1, gamma)
      for (let i = 0; i < 6; i++) {
        deltas[i] = Math.random() > 0.5 ? 1 : -1
        highArgs[i] = values[i] + ck * deltas[i]
        lowArgs[i] = values[i] - ck * deltas[i]
      }

      const lossDiff = this.loss(highArgs) - this.loss(lowArgs)
      for (let i = 0; i < 6; i++) {
        const g = (lossDiff / (2 * ck)) * deltas[i]
        const ak = a[i] / Math.pow(A + k + 1, alpha)
        values[i] = fix(values[i] - ak * g, i)
      }

      const currentLoss = this.loss(values)
      if (currentLoss < bestLoss) {
        best = values.slice(0)
        bestLoss = currentLoss
      }
    }
    return { values: best ?? values, loss: bestLoss }
  }

  loss(filters: number[]): number {
    const color = this.reusedColor
    color.set(0, 0, 0)

    color.invert(filters[0] / 100)
    color.sepia(filters[1] / 100)
    color.saturate(filters[2] / 100)
    color.hueRotate(filters[3] * 3.6)
    color.brightness(filters[4] / 100)
    color.contrast(filters[5] / 100)

    const colorHSL = color.hsl()
    return (
      Math.abs(color.r - this.target.r) +
      Math.abs(color.g - this.target.g) +
      Math.abs(color.b - this.target.b) +
      Math.abs(colorHSL.h - this.targetHSL.h) +
      Math.abs(colorHSL.s - this.targetHSL.s) +
      Math.abs(colorHSL.l - this.targetHSL.l)
    )
  }

  raw(filters: number[]): string {
    function fmt(idx: number, multiplier = 1): number {
      return Math.round(filters[idx] * multiplier)
    }
    return `brightness(0) saturate(100%) invert(${fmt(0)}%) sepia(${fmt(1)}%) saturate(${fmt(
      2
    )}%) hue-rotate(${fmt(3, 3.6)}deg) brightness(${fmt(4)}%) contrast(${fmt(5)}%)`
  }

  css(filters: number[]): string {
    function fmt(idx: number, multiplier = 1): number {
      return Math.round(filters[idx] * multiplier)
    }
    return `filter: brightness(0) saturate(100%) invert(${fmt(0)}%) sepia(${fmt(
      1
    )}%) saturate(${fmt(2)}%) hue-rotate(${fmt(3, 3.6)}deg) brightness(${fmt(
      4
    )}%) contrast(${fmt(5)}%);`
  }
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/features/ponto-controle/colorToFilter.test.ts`
Expected: PASS (16 testes)

- [ ] **Step 5: Commit**

```bash
git add src/features/ponto-controle/colorToFilter.ts src/features/ponto-controle/colorToFilter.test.ts
git commit -m "feat(ponto-controle): port colorToFilter SPSA solver"
```

---

### Task 3: `features/ponto-controle/seletor.ts`

**Files:**
- Create: `C:\sei\seirmg\src\features\ponto-controle\seletor.ts`
- Test: `C:\sei\seirmg\src\features\ponto-controle\seletor.test.ts`

**Contexto**: porte da lógica de seleção de `C:\sei\seiplus\cs_modules\lib\pontoControleCores.js`, extraída como função pura (recebe o booleano em vez de ler `document.location` diretamente).

**Interfaces:**
- Consumes: nenhuma
- Produces: `construirSeletorPontoControle(nome: string, emProcedimentoVisualizar: boolean): string`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/features/ponto-controle/seletor.test.ts
import { describe, expect, it } from 'vitest'
import { construirSeletorPontoControle } from './seletor'

describe('construirSeletorPontoControle', () => {
  it('usa seletor por title em procedimento_visualizar', () => {
    expect(construirSeletorPontoControle('Concluído', true)).toBe('img[title*="Concluído" i]')
  })

  it('usa seletor por aria-label fora de procedimento_visualizar', () => {
    expect(construirSeletorPontoControle('Concluído', false)).toBe('a[aria-label*="Concluído" i] img')
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/features/ponto-controle/seletor.test.ts`
Expected: FAIL — `Cannot find module './seletor'`

- [ ] **Step 3: Implementar `src/features/ponto-controle/seletor.ts`**

```ts
export function construirSeletorPontoControle(nome: string, emProcedimentoVisualizar: boolean): string {
  return emProcedimentoVisualizar ? `img[title*="${nome}" i]` : `a[aria-label*="${nome}" i] img`
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/features/ponto-controle/seletor.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add src/features/ponto-controle/seletor.ts src/features/ponto-controle/seletor.test.ts
git commit -m "feat(ponto-controle): add DOM selector builder for control point icons"
```

---

### Task 4: `content-scripts/ponto_controle/index.ts` + `manifest.config.ts`

**Files:**
- Create: `C:\sei\seirmg\src\content-scripts\ponto_controle\index.ts`
- Modify: `C:\sei\seirmg\manifest.config.ts`

**Contexto**: wiring fino — só lê o `filter` já cacheado em cada regra e aplica aos elementos encontrados. Nunca chama `colorToFilter` (cálculo pesado fica em `options/main.ts`, só ao salvar). Não é coberto por TDD — verificado via build.

**Interfaces:**
- Consumes: `construirSeletorPontoControle` (Task 3); `createSyncConfigStore` (`../../lib/storage`)

- [ ] **Step 1: Criar `src/content-scripts/ponto_controle/index.ts`**

```ts
import { construirSeletorPontoControle } from '../../features/ponto-controle/seletor'
import { createSyncConfigStore } from '../../lib/storage'

async function bootstrap(): Promise<void> {
  try {
    const config = await createSyncConfigStore().get()
    if (!config.pontoControle.ativo) return

    const emProcedimentoVisualizar = document.location.search.indexOf('acao=procedimento_visualizar') > 0

    config.pontoControle.regras.forEach((regra) => {
      const seletor = construirSeletorPontoControle(regra.nome, emProcedimentoVisualizar)
      document.querySelectorAll<HTMLImageElement>(seletor).forEach((img) => {
        img.style.filter = regra.filter
      })
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao aplicar cores de ponto de controle:', error)
  }
}

bootstrap()
```

- [ ] **Step 2: Adicionar o bloco novo em `manifest.config.ts`**

No array `content_scripts`, adicionar (depois do bloco de `procedimento_controlar`):

```ts
    {
      matches: [
        '*://*.br/*controlador.php?acao=*',
        '*://*.org/*controlador.php?acao=*',
      ],
      js: ['src/content-scripts/ponto_controle/index.ts'],
      run_at: 'document_idle',
    },
```

- [ ] **Step 3: Rodar toda a suíte de testes para confirmar que nada quebrou**

Run: `cd C:\sei\seirmg && bunx vitest run`
Expected: todos os testes continuam passando (148 testes no total — 128 antes deste plano + 2 (Task 1) + 16 (Task 2) + 2 (Task 3) = 148)

- [ ] **Step 4: Rodar o build**

Run: `bun run build`
Expected: sucesso, sem erros de tipo. Se houver erro, rode `bun run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/content-scripts/ponto_controle/index.ts manifest.config.ts
git commit -m "feat(ponto-controle): wire control point color content script"
```

---

### Task 5: `options/index.html` + `options/main.ts` — seção Ponto de Controle

**Files:**
- Modify: `C:\sei\seirmg\src\options\index.html`
- Modify: `C:\sei\seirmg\src\options\main.ts`

**Contexto**: DOM-heavy, não coberto por TDD, verificado via build. Adiciona uma 4ª seção à aba Processos (já implementada no Lote D), reaproveitando `montarListaEditavel` sem alterações. Ao salvar, calcula `colorToFilter(cor)` uma vez por regra e persiste o resultado junto — cada cálculo é isolado em `try/catch` (regra com cor inválida é descartada, sem travar o salvamento das demais).

**Interfaces:**
- Consumes: `montarListaEditavel` (`./listaEditavel`); `colorToFilter` (Task 2, `../features/ponto-controle/colorToFilter`); `type ConfiguracaoPontoControle` (Task 1, `../lib/storage`)

- [ ] **Step 1: Adicionar a seção "Ponto de Controle" em `src/options/index.html`**

Trecho atual (dentro de `#painel-processos`, logo antes do botão Salvar):

```html
      <br />
      <button id="processos-salvar">Salvar</button>
      <span id="processos-status"></span>
    </section>
```

Substituir por:

```html
      <h3>Ponto de Controle</h3>
      <label>
        <input type="checkbox" id="processos-ponto-controle-ativo" />
        Ativar cor customizável do ponto de controle
      </label>
      <div id="processos-ponto-controle-lista"></div>

      <br />
      <button id="processos-salvar">Salvar</button>
      <span id="processos-status"></span>
    </section>
```

- [ ] **Step 2: Modificar `src/options/main.ts`**

Modificar o import do topo do arquivo:

Atual:

```ts
import {
  createSyncConfigStore,
  type ConfiguracaoCor,
  type ModoEspecificacao,
  type ThemePreset,
} from '../lib/storage'
import { montarListaEditavel } from './listaEditavel'
```

Substituir por:

```ts
import {
  createSyncConfigStore,
  type ConfiguracaoCor,
  type ConfiguracaoPontoControle,
  type ModoEspecificacao,
  type ThemePreset,
} from '../lib/storage'
import { montarListaEditavel } from './listaEditavel'
import { colorToFilter } from '../features/ponto-controle/colorToFilter'

interface RegraPontoControleEditavel {
  nome: string
  cor: string
  [chave: string]: string
}
```

Substituir a função `carregarAbaProcessos` inteira. Atual:

```ts
async function carregarAbaProcessos(): Promise<void> {
  try {
    const store = createSyncConfigStore()
    const config = await store.get()

    const inputPrazosAtivo = document.getElementById('processos-prazos-ativo') as HTMLInputElement | null
    const inputExibirDias = document.getElementById('processos-prazos-exibir-dias') as HTMLInputElement | null
    const inputAlertaDias = document.getElementById('processos-prazos-alerta-dias') as HTMLInputElement | null
    const inputCriticoDias = document.getElementById('processos-prazos-critico-dias') as HTMLInputElement | null
    const inputExibirPrazo = document.getElementById('processos-prazos-exibir-prazo') as HTMLInputElement | null
    const inputAlertaPrazo = document.getElementById('processos-prazos-alerta-prazo') as HTMLInputElement | null
    const inputCriticoPrazo = document.getElementById('processos-prazos-critico-prazo') as HTMLInputElement | null
    const inputCoresAtivo = document.getElementById('processos-cores-ativo') as HTMLInputElement | null
    const inputEspecificacaoAtivo = document.getElementById(
      'processos-especificacao-ativo'
    ) as HTMLInputElement | null
    const selectModo = document.getElementById('processos-especificacao-modo') as HTMLSelectElement | null
    const status = document.getElementById('processos-status')

    if (inputPrazosAtivo) inputPrazosAtivo.checked = config.controleProcessos.prazos.ativo
    if (inputExibirDias) inputExibirDias.checked = config.controleProcessos.prazos.exibirDias
    if (inputAlertaDias) inputAlertaDias.value = String(config.controleProcessos.prazos.alertaDias)
    if (inputCriticoDias) inputCriticoDias.value = String(config.controleProcessos.prazos.criticoDias)
    if (inputExibirPrazo) inputExibirPrazo.checked = config.controleProcessos.prazos.exibirPrazo
    if (inputAlertaPrazo) inputAlertaPrazo.value = String(config.controleProcessos.prazos.alertaPrazo)
    if (inputCriticoPrazo) inputCriticoPrazo.value = String(config.controleProcessos.prazos.criticoPrazo)
    if (inputCoresAtivo) inputCoresAtivo.checked = config.controleProcessos.coresProcesso.ativo
    if (inputEspecificacaoAtivo) {
      inputEspecificacaoAtivo.checked = config.controleProcessos.especificacao.ativo
    }
    if (selectModo) selectModo.value = config.controleProcessos.especificacao.modo

    const containerCores = document.getElementById('processos-cores-lista')
    const listaCores = containerCores
      ? montarListaEditavel<ConfiguracaoCor>(
          containerCores,
          [
            { chave: 'valor', rotulo: 'Especificação contém', tipo: 'text' },
            { chave: 'cor', rotulo: 'Cor', tipo: 'color' },
          ],
          config.controleProcessos.coresProcesso.regras
        )
      : null

    document.getElementById('processos-salvar')?.addEventListener('click', async () => {
      try {
        const atualizado = {
          ...config,
          controleProcessos: {
            prazos: {
              ativo: inputPrazosAtivo?.checked ?? true,
              exibirDias: inputExibirDias?.checked ?? true,
              exibirPrazo: inputExibirPrazo?.checked ?? true,
              alertaDias: Number(inputAlertaDias?.value ?? 30),
              criticoDias: Number(inputCriticoDias?.value ?? 60),
              alertaPrazo: Number(inputAlertaPrazo?.value ?? 10),
              criticoPrazo: Number(inputCriticoPrazo?.value ?? 5),
            },
            coresProcesso: {
              ativo: inputCoresAtivo?.checked ?? true,
              regras: listaCores?.obterItens() ?? [],
            },
            especificacao: {
              ativo: inputEspecificacaoAtivo?.checked ?? true,
              modo: (selectModo?.value ?? 'mostrar') as ModoEspecificacao,
            },
          },
        }
        await store.set(atualizado)
        if (status) {
          status.textContent = 'Salvo!'
          setTimeout(() => {
            status.textContent = ''
          }, 2000)
        }
      } catch (error) {
        console.error('[SEIRMG] Falha ao salvar configuração de Processos:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao carregar aba Processos:', error)
  }
}
```

Substituir por (adiciona os campos/lista de Ponto de Controle e o cálculo de `filter` no salvamento; o resto da função é idêntico):

```ts
async function carregarAbaProcessos(): Promise<void> {
  try {
    const store = createSyncConfigStore()
    const config = await store.get()

    const inputPrazosAtivo = document.getElementById('processos-prazos-ativo') as HTMLInputElement | null
    const inputExibirDias = document.getElementById('processos-prazos-exibir-dias') as HTMLInputElement | null
    const inputAlertaDias = document.getElementById('processos-prazos-alerta-dias') as HTMLInputElement | null
    const inputCriticoDias = document.getElementById('processos-prazos-critico-dias') as HTMLInputElement | null
    const inputExibirPrazo = document.getElementById('processos-prazos-exibir-prazo') as HTMLInputElement | null
    const inputAlertaPrazo = document.getElementById('processos-prazos-alerta-prazo') as HTMLInputElement | null
    const inputCriticoPrazo = document.getElementById('processos-prazos-critico-prazo') as HTMLInputElement | null
    const inputCoresAtivo = document.getElementById('processos-cores-ativo') as HTMLInputElement | null
    const inputEspecificacaoAtivo = document.getElementById(
      'processos-especificacao-ativo'
    ) as HTMLInputElement | null
    const selectModo = document.getElementById('processos-especificacao-modo') as HTMLSelectElement | null
    const inputPontoControleAtivo = document.getElementById(
      'processos-ponto-controle-ativo'
    ) as HTMLInputElement | null
    const status = document.getElementById('processos-status')

    if (inputPrazosAtivo) inputPrazosAtivo.checked = config.controleProcessos.prazos.ativo
    if (inputExibirDias) inputExibirDias.checked = config.controleProcessos.prazos.exibirDias
    if (inputAlertaDias) inputAlertaDias.value = String(config.controleProcessos.prazos.alertaDias)
    if (inputCriticoDias) inputCriticoDias.value = String(config.controleProcessos.prazos.criticoDias)
    if (inputExibirPrazo) inputExibirPrazo.checked = config.controleProcessos.prazos.exibirPrazo
    if (inputAlertaPrazo) inputAlertaPrazo.value = String(config.controleProcessos.prazos.alertaPrazo)
    if (inputCriticoPrazo) inputCriticoPrazo.value = String(config.controleProcessos.prazos.criticoPrazo)
    if (inputCoresAtivo) inputCoresAtivo.checked = config.controleProcessos.coresProcesso.ativo
    if (inputEspecificacaoAtivo) {
      inputEspecificacaoAtivo.checked = config.controleProcessos.especificacao.ativo
    }
    if (selectModo) selectModo.value = config.controleProcessos.especificacao.modo
    if (inputPontoControleAtivo) inputPontoControleAtivo.checked = config.pontoControle.ativo

    const containerCores = document.getElementById('processos-cores-lista')
    const listaCores = containerCores
      ? montarListaEditavel<ConfiguracaoCor>(
          containerCores,
          [
            { chave: 'valor', rotulo: 'Especificação contém', tipo: 'text' },
            { chave: 'cor', rotulo: 'Cor', tipo: 'color' },
          ],
          config.controleProcessos.coresProcesso.regras
        )
      : null

    const containerPontoControle = document.getElementById('processos-ponto-controle-lista')
    const listaPontoControle = containerPontoControle
      ? montarListaEditavel<RegraPontoControleEditavel>(
          containerPontoControle,
          [
            { chave: 'nome', rotulo: 'Nome do ponto de controle', tipo: 'text' },
            { chave: 'cor', rotulo: 'Cor', tipo: 'color' },
          ],
          config.pontoControle.regras.map(({ nome, cor }) => ({ nome, cor }))
        )
      : null

    document.getElementById('processos-salvar')?.addEventListener('click', async () => {
      try {
        const regrasPontoControle: ConfiguracaoPontoControle[] = (
          listaPontoControle?.obterItens() ?? []
        ).flatMap((regra) => {
          try {
            return [{ nome: regra.nome, cor: regra.cor, filter: colorToFilter(regra.cor) }]
          } catch (error) {
            console.error(`[SEIRMG] Falha ao calcular filtro de cor para "${regra.nome}":`, error)
            return []
          }
        })

        const atualizado = {
          ...config,
          controleProcessos: {
            prazos: {
              ativo: inputPrazosAtivo?.checked ?? true,
              exibirDias: inputExibirDias?.checked ?? true,
              exibirPrazo: inputExibirPrazo?.checked ?? true,
              alertaDias: Number(inputAlertaDias?.value ?? 30),
              criticoDias: Number(inputCriticoDias?.value ?? 60),
              alertaPrazo: Number(inputAlertaPrazo?.value ?? 10),
              criticoPrazo: Number(inputCriticoPrazo?.value ?? 5),
            },
            coresProcesso: {
              ativo: inputCoresAtivo?.checked ?? true,
              regras: listaCores?.obterItens() ?? [],
            },
            especificacao: {
              ativo: inputEspecificacaoAtivo?.checked ?? true,
              modo: (selectModo?.value ?? 'mostrar') as ModoEspecificacao,
            },
          },
          pontoControle: {
            ativo: inputPontoControleAtivo?.checked ?? true,
            regras: regrasPontoControle,
          },
        }
        await store.set(atualizado)
        if (status) {
          status.textContent = 'Salvo!'
          setTimeout(() => {
            status.textContent = ''
          }, 2000)
        }
      } catch (error) {
        console.error('[SEIRMG] Falha ao salvar configuração de Processos:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao carregar aba Processos:', error)
  }
}
```

- [ ] **Step 3: Rodar toda a suíte e o build**

Run: `cd C:\sei\seirmg && bunx vitest run && bun run build`
Expected: todos os testes continuam passando (148), build sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/options/index.html src/options/main.ts
git commit -m "feat(options): add Ponto de Controle section with cached color filter"
```

---

### Task 6: Checagem final (typecheck/lint/test/build/manifest)

**Files:** nenhum arquivo novo — checklist de verificação, mesmo padrão dos planos anteriores.

- [ ] **Step 1: Rodar a checagem completa**

Run:
```bash
cd C:\sei\seirmg
bun run typecheck
bun run lint
bun run test
bun run build
```
Expected: os 4 comandos terminam com código de saída 0. `bun run test` reporta 148 testes, todos passando.

- [ ] **Step 2: Validar o `manifest.json` gerado e confirmar que as permissões não mudaram**

Run: `node -e "const m = JSON.parse(require('fs').readFileSync('dist/manifest.json', 'utf8')); console.log('manifest.json válido'); console.log(JSON.stringify(m.permissions))"`
Expected: `manifest.json válido` seguido de `["storage","notifications","alarms","tabs"]` — exatamente as mesmas permissões de antes.

---

## Self-Review (checklist do autor do plano)

1. **Cobertura da spec**: schema `pontoControle` (Task 1), `colorToFilter.ts` com Color/Solver internos (Task 2), `seletor.ts` (Task 3), wiring do content script lendo só o `filter` cacheado (Task 4), seção Ponto de Controle reaproveitando `listaEditavel.ts` e calculando o filtro ao salvar (Task 5). Todas as seções da spec têm task correspondente.
2. **Placeholders**: nenhum "TBD"/"TODO"; todo código de teste e implementação está completo e literal.
3. **Consistência de tipos**: `ConfiguracaoPontoControle` (Task 1, `lib/storage`) usado identicamente pelo content script (Task 4, via `config.pontoControle.regras`) e pela aba Processos (Task 5, tipo de retorno de `regrasPontoControle`). `construirSeletorPontoControle` (Task 3) consumido identicamente pelo content script (Task 4). `montarListaEditavel` (Lote D, sem alterações) reaproveitado com um novo par de campos (`nome`/`cor`) exatamente como a spec previu.
4. **Contagem de testes**: 128 (baseline antes deste plano) + 2 (Task 1) + 16 (Task 2) + 2 (Task 3) = 148 testes esperados ao final da Task 4 em diante.
