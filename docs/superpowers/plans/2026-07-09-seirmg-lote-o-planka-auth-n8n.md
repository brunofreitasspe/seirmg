# SEIRMG — Lote O (parte 1): Autenticação/Consulta via n8n — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produzir os artefatos versionáveis (schema SQL, funções de criptografia testadas, roteiro de montagem) necessários para o usuário montar manualmente os 3 workflows n8n que substituem o backend de autenticação/consulta ao Planka.

**Architecture:** As funções de hash de senha e JWT são pura lógica JavaScript/TypeScript, sem dependência de `chrome.*` ou de nenhuma API do n8n — por isso ganham testes automatizados de verdade (Vitest), mesmo o destino final delas sendo um node de Code do n8n (que roda JS puro, não TS). O roteiro de montagem (`roteiro.md`) documenta os 3 workflows node a node, incorporando a versão em JS puro (transcrita manualmente a partir do TS testado) para colar direto nos nodes de Code.

**Tech Stack:** TypeScript + Vitest (para os arquivos testáveis, fora do build da extensão) + n8n (montagem manual, fora deste repositório).

## Global Constraints

- Nenhum destes arquivos faz parte do build da extensão (Vite/CRXJS) — vivem em `infra/planka-auth/`, fora de `src/`.
- Hash de senha: `crypto.scryptSync` (Node nativo), salt e hash guardados separados. Comparação com `crypto.timingSafeEqual`.
- JWT: HS256 manual (sem pacote `jsonwebtoken`), payload inclui `exp` em segundos desde epoch, validade de referência 24h (calculada no momento da assinatura, não fixa no código).
- Schema: tabela `usuarios` num Postgres **separado** do banco do Planka (ver spec, seção "Banco de usuários").

---

### Task 1: Configurar Vitest para cobrir `infra/` e implementar hash de senha

**Files:**
- Modify: `vitest.config.ts`
- Create: `infra/planka-auth/hashSenha.ts`
- Test: `infra/planka-auth/hashSenha.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `hashSenha(senha: string): { salt: string; hash: string }`, `verificarSenha(senha: string, salt: string, hashEsperado: string): boolean` — usados pela Task 4 (transcrição pro node de Code de cadastro/login).

- [ ] **Step 1: Adicionar `infra/**/*.test.ts` ao include do Vitest**

Trocar o conteúdo de `vitest.config.ts` (atualmente `include: ['src/**/*.test.ts']`) para:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'infra/**/*.test.ts'],
  },
})
```

- [ ] **Step 2: Escrever o teste (falhando)**

Criar `infra/planka-auth/hashSenha.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { hashSenha, verificarSenha } from './hashSenha'

describe('hashSenha/verificarSenha', () => {
  it('verifica corretamente a senha certa', () => {
    const { salt, hash } = hashSenha('minhaSenhaSegura123')
    expect(verificarSenha('minhaSenhaSegura123', salt, hash)).toBe(true)
  })

  it('rejeita a senha errada', () => {
    const { salt, hash } = hashSenha('minhaSenhaSegura123')
    expect(verificarSenha('senhaErrada', salt, hash)).toBe(false)
  })

  it('gera salts diferentes a cada chamada, mesmo pra mesma senha', () => {
    const a = hashSenha('mesmaSenha')
    const b = hashSenha('mesmaSenha')
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toBe(b.hash)
  })
})
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `cd C:\sei\seirmg && bunx vitest run infra/planka-auth/hashSenha.test.ts`
Expected: FAIL — `Cannot find module './hashSenha'`.

- [ ] **Step 4: Implementar `infra/planka-auth/hashSenha.ts`**

```ts
import crypto from 'node:crypto'

export interface SenhaHash {
  salt: string
  hash: string
}

export function hashSenha(senha: string): SenhaHash {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(senha, salt, 64).toString('hex')
  return { salt, hash }
}

export function verificarSenha(senha: string, salt: string, hashEsperado: string): boolean {
  const hash = crypto.scryptSync(senha, salt, 64).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(hashEsperado, 'hex'))
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `bunx vitest run infra/planka-auth/hashSenha.test.ts`
Expected: PASS — 3 testes.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts infra/planka-auth/hashSenha.ts infra/planka-auth/hashSenha.test.ts
git commit -m "feat(planka-auth): add tested password hashing helpers (scrypt)"
```

---

### Task 2: Implementar assinatura/verificação de JWT

**Files:**
- Create: `infra/planka-auth/jwt.ts`
- Test: `infra/planka-auth/jwt.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `assinarJwt(payload: Record<string, unknown>, segredo: string): string`, `verificarJwt(token: string, segredo: string): Record<string, unknown>` (lança `Error` com mensagem `'Token malformado'` | `'Assinatura inválida'` | `'Token expirado'`) — usados pela Task 4.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `infra/planka-auth/jwt.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { assinarJwt, verificarJwt } from './jwt'

describe('assinarJwt/verificarJwt', () => {
  it('assina e verifica um token válido', () => {
    const payload = { userId: 1, email: 'a@b.com', exp: Math.floor(Date.now() / 1000) + 3600 }
    const token = assinarJwt(payload, 'segredo-de-teste')
    expect(verificarJwt(token, 'segredo-de-teste')).toEqual(payload)
  })

  it('rejeita token com assinatura adulterada', () => {
    const token = assinarJwt({ userId: 1, exp: Math.floor(Date.now() / 1000) + 3600 }, 'segredo-de-teste')
    const partes = token.split('.')
    const tokenAdulterado = `${partes[0]}.${partes[1]}.assinaturaFalsa`
    expect(() => verificarJwt(tokenAdulterado, 'segredo-de-teste')).toThrow('Assinatura inválida')
  })

  it('rejeita token expirado', () => {
    const token = assinarJwt({ userId: 1, exp: Math.floor(Date.now() / 1000) - 10 }, 'segredo-de-teste')
    expect(() => verificarJwt(token, 'segredo-de-teste')).toThrow('Token expirado')
  })

  it('rejeita token malformado', () => {
    expect(() => verificarJwt('nao-e-um-jwt', 'segredo-de-teste')).toThrow('Token malformado')
  })

  it('rejeita verificação com segredo diferente do usado pra assinar', () => {
    const token = assinarJwt({ userId: 1, exp: Math.floor(Date.now() / 1000) + 3600 }, 'segredo-A')
    expect(() => verificarJwt(token, 'segredo-B')).toThrow('Assinatura inválida')
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd C:\sei\seirmg && bunx vitest run infra/planka-auth/jwt.test.ts`
Expected: FAIL — `Cannot find module './jwt'`.

- [ ] **Step 3: Implementar `infra/planka-auth/jwt.ts`**

```ts
import crypto from 'node:crypto'

function base64url(input: string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(input: string): string {
  let normalizado = input.replace(/-/g, '+').replace(/_/g, '/')
  while (normalizado.length % 4) normalizado += '='
  return Buffer.from(normalizado, 'base64').toString('utf8')
}

function assinar(headerCod: string, payloadCod: string, segredo: string): string {
  return crypto
    .createHmac('sha256', segredo)
    .update(`${headerCod}.${payloadCod}`)
    .digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function assinarJwt(payload: Record<string, unknown>, segredo: string): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const headerCod = base64url(JSON.stringify(header))
  const payloadCod = base64url(JSON.stringify(payload))
  const assinatura = assinar(headerCod, payloadCod, segredo)
  return `${headerCod}.${payloadCod}.${assinatura}`
}

export function verificarJwt(token: string, segredo: string): Record<string, unknown> {
  const partes = token.split('.')
  if (partes.length !== 3) throw new Error('Token malformado')
  const [headerCod, payloadCod, assinaturaRecebida] = partes

  const assinaturaEsperada = assinar(headerCod, payloadCod, segredo)
  if (assinaturaRecebida !== assinaturaEsperada) throw new Error('Assinatura inválida')

  const payload = JSON.parse(base64urlDecode(payloadCod)) as Record<string, unknown>
  if (typeof payload.exp === 'number' && Date.now() / 1000 > payload.exp) {
    throw new Error('Token expirado')
  }

  return payload
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bunx vitest run infra/planka-auth/jwt.test.ts`
Expected: PASS — 5 testes.

- [ ] **Step 5: Commit**

```bash
git add infra/planka-auth/jwt.ts infra/planka-auth/jwt.test.ts
git commit -m "feat(planka-auth): add tested manual HS256 JWT sign/verify helpers"
```

---

### Task 3: Schema SQL da tabela de usuários

**Files:**
- Create: `infra/planka-auth/schema.sql`

**Interfaces:**
- Consumes: nada.
- Produces: definição da tabela `usuarios`, referenciada pelo roteiro (Task 4).

- [ ] **Step 1: Criar o arquivo**

```sql
-- Banco separado do Planka. Rodar uma vez, manualmente, contra o Postgres
-- reservado para autenticação do SEIRMG.

CREATE TABLE usuarios (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  senha_hash TEXT NOT NULL,
  senha_salt TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Commit**

```bash
git add infra/planka-auth/schema.sql
git commit -m "feat(planka-auth): add usuarios table schema"
```

---

### Task 4: Roteiro de montagem dos 3 workflows n8n

**Files:**
- Create: `infra/planka-auth/roteiro.md`

**Interfaces:**
- Consumes: `hashSenha`/`verificarSenha` (Task 1), `assinarJwt`/`verificarJwt` (Task 2) — transcritos manualmente para JavaScript puro (sem `import`/`export`, já que o node de Code do n8n não roda TypeScript nem módulos ES).
- Produces: nada consumido por outra task — é o documento final que o usuário segue na Task 5.

- [ ] **Step 1: Criar o arquivo com o roteiro completo**

```markdown
# Roteiro — Montagem dos workflows SEIRMG no n8n

Pré-requisitos: uma credencial Postgres no n8n apontando pro banco de
`usuarios` (Task 3 deste plano) e outra apontando pro banco do Planka.
Uma variável de ambiente `SEIRMG_JWT_SECRET` (string aleatória longa,
gerada uma vez) configurada no ambiente do n8n.

## Workflow 1 — "SEIRMG - Login"

1. **Webhook** — método POST, path `seirmg-login`, modo de resposta
   "Using Respond to Webhook node".
2. **Postgres (Execute Query)** — credencial do banco de usuários:
   `SELECT id, nome, email, senha_hash, senha_salt, ativo FROM usuarios WHERE email = $1`
   Parâmetro: `{{$json.body.email}}`
3. **IF** — condição: nenhuma linha retornada OU `ativo` é `false`.
   - Ramo verdadeiro → **Respond to Webhook**: status 401,
     body `{ "error": "Credenciais inválidas" }`.
4. **Code** (ramo falso do IF acima) — cole exatamente:

\`\`\`js
const crypto = require('crypto')

function verificarSenha(senha, salt, hashEsperado) {
  const hash = crypto.scryptSync(senha, salt, 64).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(hashEsperado, 'hex'))
}

const linha = $input.first().json
const senhaRecebida = $('Webhook').first().json.body.senha
const senhaConfere = verificarSenha(senhaRecebida, linha.senha_salt, linha.senha_hash)

return [{ json: { senhaConfere, linha } }]
\`\`\`

5. **IF** — condição: `{{$json.senhaConfere}}` é falso.
   - Ramo verdadeiro → **Respond to Webhook**: status 401,
     body `{ "error": "Credenciais inválidas" }` (mesma mensagem do passo 3
     — não revelar se o problema foi o e-mail ou a senha).
6. **Code** (ramo falso) — assina o JWT. Cole exatamente:

\`\`\`js
const crypto = require('crypto')

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function assinar(headerCod, payloadCod, segredo) {
  return crypto
    .createHmac('sha256', segredo)
    .update(`${headerCod}.${payloadCod}`)
    .digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function assinarJwt(payload, segredo) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const headerCod = base64url(JSON.stringify(header))
  const payloadCod = base64url(JSON.stringify(payload))
  const assinatura = assinar(headerCod, payloadCod, segredo)
  return `${headerCod}.${payloadCod}.${assinatura}`
}

const linha = $json.linha
const segredo = $env.SEIRMG_JWT_SECRET
const payload = {
  userId: linha.id,
  email: linha.email,
  nome: linha.nome,
  exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
}

return [{ json: { token: assinarJwt(payload, segredo) } }]
\`\`\`

7. **Respond to Webhook** — status 200, body `{{$json}}` (já é `{ token }`).

## Workflow 2 — "SEIRMG - Consultar Processo"

1. **Webhook** — método POST, path `seirmg-consultar-processo`.
   Espera cabeçalho `Authorization: Bearer <token>` e body
   `{ "processo": "..." }`.
2. **Code** — valida o token. Cole exatamente:

\`\`\`js
const crypto = require('crypto')

function base64urlDecode(input) {
  let normalizado = input.replace(/-/g, '+').replace(/_/g, '/')
  while (normalizado.length % 4) normalizado += '='
  return Buffer.from(normalizado, 'base64').toString('utf8')
}

function assinar(headerCod, payloadCod, segredo) {
  return crypto
    .createHmac('sha256', segredo)
    .update(`${headerCod}.${payloadCod}`)
    .digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function verificarJwt(token, segredo) {
  const partes = token.split('.')
  if (partes.length !== 3) throw new Error('Token malformado')
  const [headerCod, payloadCod, assinaturaRecebida] = partes
  const assinaturaEsperada = assinar(headerCod, payloadCod, segredo)
  if (assinaturaRecebida !== assinaturaEsperada) throw new Error('Assinatura inválida')
  const payload = JSON.parse(base64urlDecode(payloadCod))
  if (typeof payload.exp === 'number' && Date.now() / 1000 > payload.exp) {
    throw new Error('Token expirado')
  }
  return payload
}

const cabecalho = $('Webhook').first().json.headers.authorization || ''
const token = cabecalho.replace(/^Bearer\s+/i, '')
const segredo = $env.SEIRMG_JWT_SECRET

try {
  const payload = verificarJwt(token, segredo)
  return [{ json: { tokenValido: true, payload } }]
} catch (error) {
  return [{ json: { tokenValido: false, erro: error.message } }]
}
\`\`\`

3. **IF** — condição: `{{$json.tokenValido}}` é falso.
   - Ramo verdadeiro → **Respond to Webhook**: status 401,
     body `{ "error": "Token inválido ou expirado" }`.
4. **Postgres (Execute Query)** (ramo falso) — credencial do banco do
   Planka:

\`\`\`sql
SELECT DISTINCT ON (card.id)
  b.name AS "tipoProcesso",
  card.name AS "nomeProcesso",
  l.name AS "localizacao",
  split_part(card.description, E'\n', 1) AS "detalhe",
  co."text" AS "ultimoComentario"
FROM card
LEFT JOIN card_label ON card_label.card_id = card.id
LEFT JOIN label      ON label.id = card_label.label_id
LEFT JOIN board b    ON b.id  = card.board_id
LEFT JOIN project p  ON p.id = b.project_id
LEFT JOIN list l     ON l.id = card.list_id
LEFT JOIN comment co ON co.card_id = card.id
WHERE p.id = 1551564557133022214
  AND b.id <> 1572619262520985419
  AND split_part(card.description, E'\n', 1) = $1
ORDER BY card.id, co."created_at" DESC NULLS LAST
LIMIT 1
\`\`\`

   Parâmetro: `{{$('Webhook').first().json.body.processo}}`

5. **IF** — condição: nenhuma linha retornada.
   - Ramo verdadeiro → **Respond to Webhook**: status 404,
     body `{ "error": "Processo não encontrado no Planka" }`.
6. **Respond to Webhook** (ramo falso) — status 200, body `{{$json}}`.

## Workflow 3 — "SEIRMG - Cadastro de Usuário"

1. **Form Trigger** — campos: "Nome" (texto, obrigatório), "Email"
   (texto, obrigatório), "Senha" (senha se o tipo existir na sua versão
   do n8n, senão texto simples).
2. **Code** — gera o hash. Cole exatamente:

\`\`\`js
const crypto = require('crypto')

function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(senha, salt, 64).toString('hex')
  return { salt, hash }
}

const dados = $input.first().json
const { salt, hash } = hashSenha(dados.Senha)

return [{ json: { nome: dados.Nome, email: dados.Email, senha_salt: salt, senha_hash: hash } }]
\`\`\`

3. **Postgres (Execute Query)** — credencial do banco de usuários:
   `INSERT INTO usuarios (nome, email, senha_hash, senha_salt) VALUES ($1, $2, $3, $4)`
   Parâmetros, na ordem: `{{$json.nome}}`, `{{$json.email}}`,
   `{{$json.senha_hash}}`, `{{$json.senha_salt}}`.
4. Configurar a mensagem de conclusão do Form Trigger:
   "Usuário cadastrado com sucesso."

**Limitação conhecida:** se o e-mail já existir, a violação da constraint
`UNIQUE` aparece como a página de erro padrão do n8n, não uma mensagem
amigável — aceito por ora (ver spec, seção "Fora de escopo").
```

- [ ] **Step 2: Commit**

```bash
git add infra/planka-auth/roteiro.md
git commit -m "docs(planka-auth): add n8n workflow assembly guide"
```

---

### Task 5: Verificação

**Files:** nenhum arquivo novo — só validação.

- [ ] **Step 1: Rodar toda a suíte de testes (extensão + infra)**

Run: `cd C:\sei\seirmg && bunx vitest run`
Expected: todos os testes passam, incluindo os 8 novos (`hashSenha.test.ts` + `jwt.test.ts`).

- [ ] **Step 2: Rodar typecheck e lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: sem erros. (`infra/planka-auth/*.ts` precisa compilar limpo mesmo fora do build da extensão — confirma que os arquivos-fonte testados batem exatamente com o que foi transcrito pro `roteiro.md`.)

- [ ] **Step 3: Montagem manual no n8n (fora do agente — para o usuário seguir)**

Não automatizável neste ambiente. Passos:
1. Criar o banco/tabela: rodar `infra/planka-auth/schema.sql` contra o Postgres reservado pra usuários.
2. Gerar uma string aleatória longa (ex. `openssl rand -hex 32`) e configurar como variável de ambiente `SEIRMG_JWT_SECRET` no ambiente do n8n.
3. Criar as credenciais Postgres no n8n: uma pro banco de usuários, outra pro banco do Planka (se ainda não existir).
4. Montar os 3 workflows seguindo `infra/planka-auth/roteiro.md`, node a node.
5. Cadastrar um usuário de teste via Workflow 3 (Form Trigger).
6. Chamar Workflow 1 (login) via curl/Postman com esse usuário — confirmar que retorna um JWT (colar em https://jwt.io só pra inspecionar o payload, nunca em produção com o segredo real).
7. Chamar Workflow 2 (consulta) com esse token e um `processo` que exista de verdade no Planka — confirmar que retorna os 5 campos esperados.
8. Testar os casos de erro: senha errada (espera 401), token adulterado/expirado (espera 401), processo inexistente (espera 404).

- [ ] **Step 4: Commit final (se a montagem manual revelar ajuste no roteiro)**

Só necessário se o teste contra o n8n real revelar que algum node precisa de ajuste (ex. um campo do Form Trigger com nome diferente do esperado). Caso contrário, este task não gera commit.

---

## Self-Review

**Cobertura da spec:** todas as seções de arquitetura da spec (`2026-07-09-seirmg-lote-o-planka-auth-n8n-design.md`) têm task correspondente — hash de senha (Task 1), JWT (Task 2), schema (Task 3), os 3 workflows (Task 4), verificação manual completa (Task 5). As seções "Fora de escopo" da spec (refresh token, rate limiting, painel admin além do cadastro, IDs configuráveis) não têm task — corretamente, por serem fora de escopo.

**Placeholders:** nenhum "TBD" — todo código é completo em cada step, incluindo os 3 blocos JavaScript do roteiro (transcritos por completo, não resumidos).

**Consistência de tipos:** `assinarJwt(payload: Record<string, unknown>, segredo: string): string` e `verificarJwt(token: string, segredo: string): Record<string, unknown>` (Task 2) usam exatamente a mesma lógica (`base64url`, `assinar`) transcrita para JS puro no roteiro (Task 4) — a mensagem de erro `'Token malformado'`/`'Assinatura inválida'`/`'Token expirado'` é idêntica nos dois lugares, já que o Workflow 2 do roteiro depende de capturar `error.message` para decidir a resposta 401.
