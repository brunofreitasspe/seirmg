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
   **Importante:** habilite a opção **"Always Output Data"** nas Settings
   deste node. Sem isso, quando o e-mail não existir a query não retorna
   nenhuma linha, o node não emite nenhum item, e o IF do passo seguinte
   nunca executa em nenhum dos dois ramos — a requisição fica pendurada até
   estourar o timeout do webhook, em vez de responder 401.
3. **IF** — duas condições combinadas com **OR**: `{{$json.id}}` está vazio
   (cobre o caso de nenhuma linha retornada, que com "Always Output Data"
   vira um item `{}` sem o campo `id`) OU `{{$json.ativo}}` é `false`.
   - Ramo verdadeiro → **Respond to Webhook**: status 401,
     body `{ "error": "Credenciais inválidas" }`.
4. **Code** (ramo falso do IF acima) — cole exatamente:

```js
const crypto = require('crypto')

function verificarSenha(senha, salt, hashEsperado) {
  const hash = crypto.scryptSync(senha, salt, 64).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(hashEsperado, 'hex'))
}

const linha = $input.first().json
const senhaRecebida = $('Webhook').first().json.body.senha
const senhaConfere = verificarSenha(senhaRecebida, linha.senha_salt, linha.senha_hash)

return [{ json: { senhaConfere, linha } }]
```

5. **IF** — condição: `{{$json.senhaConfere}}` é falso.
   - Ramo verdadeiro → **Respond to Webhook**: status 401,
     body `{ "error": "Credenciais inválidas" }` (mesma mensagem do passo 3
     — não revelar se o problema foi o e-mail ou a senha).
6. **Code** (ramo falso) — assina o JWT. Cole exatamente:

```js
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
```

7. **Respond to Webhook** — status 200, body `{{$json}}` (já é `{ token }`).

## Workflow 2 — "SEIRMG - Consultar Processo"

1. **Webhook** — método POST, path `seirmg-consultar-processo`.
   Espera cabeçalho `Authorization: Bearer <token>` e body
   `{ "processo": "..." }`.
2. **Code** — valida o token. Cole exatamente:

```js
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
```

3. **IF** — condição: `{{$json.tokenValido}}` é falso.
   - Ramo verdadeiro → **Respond to Webhook**: status 401,
     body `{ "error": "Token inválido ou expirado" }`.
4. **Postgres (Execute Query)** (ramo falso) — credencial do banco do
   Planka:

```sql
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
```

   Parâmetro: `{{$('Webhook').first().json.body.processo}}`
   **Importante:** habilite **"Always Output Data"** nas Settings deste
   node também, pelo mesmo motivo do passo 2 do Workflow 1 — sem isso, um
   processo sem card correspondente faz o IF do passo seguinte não
   executar em nenhum ramo, e a requisição fica pendurada em vez de
   responder 404.

5. **IF** — condição: `{{$json.tipoProcesso}}` está vazio (com "Always
   Output Data" habilitado, nenhuma linha encontrada vira um item `{}`
   sem esse campo).
   - Ramo verdadeiro → **Respond to Webhook**: status 404,
     body `{ "error": "Processo não encontrado no Planka" }`.
6. **Respond to Webhook** (ramo falso) — status 200, body `{{$json}}`.

## Workflow 3 — "SEIRMG - Cadastro de Usuário"

1. **Form Trigger** — campos: "Nome" (texto, obrigatório), "Email"
   (texto, obrigatório), "Senha" (senha se o tipo existir na sua versão
   do n8n, senão texto simples).
2. **Code** — gera o hash. Cole exatamente:

```js
const crypto = require('crypto')

function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(senha, salt, 64).toString('hex')
  return { salt, hash }
}

const dados = $input.first().json
const { salt, hash } = hashSenha(dados.Senha)

return [{ json: { nome: dados.Nome, email: dados.Email, senha_salt: salt, senha_hash: hash } }]
```

3. **Postgres (Execute Query)** — credencial do banco de usuários:
   `INSERT INTO usuarios (nome, email, senha_hash, senha_salt) VALUES ($1, $2, $3, $4)`
   Parâmetros, na ordem: `{{$json.nome}}`, `{{$json.email}}`,
   `{{$json.senha_hash}}`, `{{$json.senha_salt}}`.
4. Configurar a mensagem de conclusão do Form Trigger:
   "Usuário cadastrado com sucesso."

**Limitação conhecida:** se o e-mail já existir, a violação da constraint
`UNIQUE` aparece como a página de erro padrão do n8n, não uma mensagem
amigável — aceito por ora (ver spec, seção "Fora de escopo").
