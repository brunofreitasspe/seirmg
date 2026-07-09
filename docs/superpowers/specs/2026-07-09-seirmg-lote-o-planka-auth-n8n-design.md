# SEIRMG — Lote O (parte 1): Autenticação e consulta de processos via n8n

> Spec resultante de brainstorming em 2026-07-09. Primeiro dos dois sub-projetos do Lote O revisado (`docs/ROADMAP-LOTES.md`) — o segundo, consumo pela extensão, tem spec própria depois desta. **Este sub-projeto não é código do repositório da extensão**: é um esquema de banco de dados (Postgres, separado do banco do Planka) e três workflows a montar na interface do n8n já existente do usuário. Não há como testar isso automaticamente (sem TDD/CI) — a verificação é manual, contra a instância real do n8n.

## Contexto

O Lote O original (`ANALISE.md` §6, decisão #2) previa só um cliente HTTP configurável + tela de status, com o mapeamento processo↔cartão do Planka explicitamente fora de escopo. O usuário agora tem uma query SQL funcionando contra o banco do Planka e quer expor Tipo de Processo, Localização e Último Comentário do cartão correspondente a um processo do SEI, direto na tela do processo.

A arquitetura da proposta original (backend de autenticação próprio em Node/Python) não é viável agora — não há servidor disponível para hospedar um serviço novo, só acesso ao Postgres do Planka e ao n8n (que já roda). Decisão: **o próprio n8n assume o papel de backend** — sem serviço novo pra manter.

## Decisões validadas com o usuário (2026-07-09)

- Token único (JWT, ~24h de validade), sem par access/refresh — mais simples de manter no n8n, aceitável para uma ferramenta interna de baixo tráfego.
- Tabela de usuários (login/senha/ativo) num Postgres **separado** do banco do Planka (o usuário já tem um banco disponível pra isso).
- Cadastro de usuário via um workflow n8n com **Form Trigger** (formulário hospedado pelo próprio n8n) — sem nenhuma tela nova na extensão. A extensão (sub-projeto 2) só terá um link que abre essa URL.
- Correlação processo↔cartão: o NUP do processo SEI (ex. `HMMG.2025.00002346-08`) é a **primeira linha da descrição do card** (`split_part(card.description, E'\n', 1)`), não `card.name`.
- Sem rate limiting nem log de acesso nesta primeira entrega (fora de escopo, YAGNI).
- Sem tratamento elaborado de erro (ex. e-mail duplicado no cadastro) nesta primeira entrega — aceita a mensagem de erro padrão do n8n como comportamento conhecido.

## Arquitetura

### Banco de usuários (Postgres separado, novo)

```sql
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

`senha_hash`/`senha_salt` guardados separados (em vez de um formato combinado tipo `salt:hash`) para manter a query de verificação simples e explícita.

### Segredo de assinatura do JWT

Guardar como variável de ambiente do n8n (ex. `SEIRMG_JWT_SECRET`, uma string aleatória longa gerada uma vez) e referenciar dentro dos workflows via expressão do n8n (`{{$env.SEIRMG_JWT_SECRET}}`) alimentando um campo de entrada do node de Code — evita acessar `process.env` diretamente de dentro do JavaScript sandboxed, cujo comportamento varia por versão/configuração do n8n.

### Funções JavaScript reaproveitadas nos nodes de Code

Hash de senha (Node `crypto` nativo — sem depender de pacote npm externo instalado no n8n):

```js
const crypto = require('crypto')

function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(senha, salt, 64).toString('hex')
  return { salt, hash }
}

function verificarSenha(senha, salt, hashEsperado) {
  const hash = crypto.scryptSync(senha, salt, 64).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(hashEsperado, 'hex'))
}
```

Assinatura e verificação de JWT (HS256, sem dependência de pacote `jsonwebtoken`):

```js
const crypto = require('crypto')

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function assinarJwt(payload, segredo) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const headerCod = base64url(JSON.stringify(header))
  const payloadCod = base64url(JSON.stringify(payload))
  const assinatura = crypto
    .createHmac('sha256', segredo)
    .update(`${headerCod}.${payloadCod}`)
    .digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${headerCod}.${payloadCod}.${assinatura}`
}

function base64urlDecode(input) {
  let normalizado = input.replace(/-/g, '+').replace(/_/g, '/')
  while (normalizado.length % 4) normalizado += '='
  return Buffer.from(normalizado, 'base64').toString('utf8')
}

function verificarJwt(token, segredo) {
  const partes = token.split('.')
  if (partes.length !== 3) throw new Error('Token malformado')
  const [headerCod, payloadCod, assinaturaRecebida] = partes

  const assinaturaEsperada = crypto
    .createHmac('sha256', segredo)
    .update(`${headerCod}.${payloadCod}`)
    .digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  if (assinaturaRecebida !== assinaturaEsperada) throw new Error('Assinatura inválida')

  const payload = JSON.parse(base64urlDecode(payloadCod))
  if (payload.exp && Date.now() / 1000 > payload.exp) throw new Error('Token expirado')

  return payload
}
```

### Workflow 1 — "SEIRMG - Login"

1. **Webhook** (`POST /seirmg-login`, modo de resposta "Using Respond to Webhook node"). Corpo esperado: `{ "email": "...", "senha": "..." }`.
2. **Postgres** (Execute Query, no banco separado de usuários): `SELECT id, nome, email, senha_hash, senha_salt, ativo FROM usuarios WHERE email = $1`, parâmetro `{{$json.body.email}}`.
3. **IF**: nenhuma linha retornada OU `ativo = false` → **Respond to Webhook** (401, `{ "error": "Credenciais inválidas" }`).
4. **Code** (ramo verdadeiro): roda `verificarSenha(senha recebida, salt, hash)` da linha encontrada.
   - Falhou → **Respond to Webhook** (401, mesma mensagem genérica — não revelar se foi e-mail ou senha).
   - Passou → **Code**: monta `payload = { userId, email, nome, exp: Math.floor(Date.now()/1000) + 24*60*60 }`, chama `assinarJwt(payload, segredo)`.
5. **Respond to Webhook** (200, `{ "token": "..." }`).

### Workflow 2 — "SEIRMG - Consultar Processo"

1. **Webhook** (`POST /seirmg-consultar-processo`). Cabeçalho `Authorization: Bearer <token>`, corpo `{ "processo": "HMMG.2025.00002346-08" }`.
2. **Code**: extrai o token do cabeçalho `Authorization`, chama `verificarJwt(token, segredo)` dentro de um `try/catch` — se lançar, marca inválido.
3. **IF**: token inválido/expirado → **Respond to Webhook** (401, `{ "error": "Token inválido ou expirado" }`).
4. **Postgres** (Execute Query, no banco do Planka): query parametrizada por `{{$json.body.processo}}`:

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

(Colunas renomeadas para camelCase — mais direto de consumir como JSON na extensão do que os títulos em português da query original. O ID do projeto e o board excluído continuam fixos, herdados da query original; se precisarem ser configuráveis por instalação, isso é uma extensão futura, não necessária agora.)

5. **IF**: nenhuma linha retornada → **Respond to Webhook** (404, `{ "error": "Processo não encontrado no Planka" }`).
6. **Respond to Webhook** (200, a linha encontrada como JSON: `{ tipoProcesso, nomeProcesso, localizacao, detalhe, ultimoComentario }`).

### Workflow 3 — "SEIRMG - Cadastro de Usuário"

1. **Form Trigger**: campos "Nome" (texto), "Email" (texto), "Senha" (campo de senha, se o Form Trigger da versão instalada suportar esse tipo — senão, texto simples).
2. **Code**: `hashSenha(senha recebida)` → `{ salt, hash }`.
3. **Postgres** (Execute Query, banco de usuários): `INSERT INTO usuarios (nome, email, senha_hash, senha_salt) VALUES ($1, $2, $3, $4)`.
4. Mensagem de conclusão do formulário: "Usuário cadastrado com sucesso."

Limitação conhecida e aceita: se o e-mail já existir, a violação da constraint `UNIQUE` vai aparecer como a página de erro padrão do n8n, não uma mensagem amigável — refinamento futuro, não necessário agora.

## Segurança

- HTTPS obrigatório entre extensão e n8n (o webhook do n8n deve estar atrás de TLS — configuração de infraestrutura do usuário, fora do escopo desta spec).
- Senha nunca fica em texto puro em lugar nenhum além do corpo da requisição HTTPS de login/cadastro.
- `timingSafeEqual` na comparação de hash evita timing attack trivial.
- Segredo do JWT só existe como variável de ambiente do n8n, nunca em texto no workflow exportado/versionado.

## Testes

Nenhum teste automatizado — este sub-projeto não é código TypeScript deste repositório, é configuração de infraestrutura externa (n8n) que não temos como exercitar via Vitest/CI. Verificação é manual:
1. Montar os 3 workflows na instância n8n do usuário seguindo o roteiro acima.
2. Cadastrar um usuário de teste via Workflow 3.
3. Chamar Workflow 1 (login) com esse usuário via curl/Postman, confirmar que retorna um JWT válido (decodificável, com o `exp` correto).
4. Chamar Workflow 2 (consulta) com esse token e um `processo` que exista no Planka, confirmar que retorna os dados esperados.
5. Testar os casos de erro: senha errada (401), token expirado/adulterado (401), processo inexistente (404).

## Fora de escopo (desta spec)

- Lado da extensão (tela de configuração, login, exibição dos dados) — sub-projeto 2, spec própria.
- Refresh token / renovação automática — token único de 24h, usuário loga de novo quando expirar.
- Rate limiting e log de acesso.
- Painel administrativo além do formulário de cadastro (edição de usuário, exclusão, troca de senha) — só criação, por enquanto.
- ID do projeto/board excluído configuráveis por instalação — hoje fixos na query, herdados do que o usuário já tinha funcionando.
