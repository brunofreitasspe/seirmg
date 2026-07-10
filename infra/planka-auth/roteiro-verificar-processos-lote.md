# Roteiro — Workflow n8n "SEIRMG - Verificar Processos em Lote"

> Documento autocontido: dá pra colar isto inteiro num chat e pedir pra gerar o JSON de
> importação do n8n para este workflow, sem precisar de mais nenhum arquivo do repositório.

## Contexto

Este é um **quarto workflow**, adicional aos três já existentes e em produção
(`SEIRMG - Login`, `SEIRMG - Consultar Processo`, `SEIRMG - Cadastro de Usuário` —
ver `infra/planka-auth/roteiro.md`). Ele **não altera nada** nesses três workflows
nem no schema do Postgres.

**Objetivo:** dado um token de sessão e uma lista de números de processo do SEI (NUPs),
devolver só os NUPs que têm card correspondente no Planka — sem os detalhes (tipo,
localização, último comentário), que continuam vindo de uma chamada separada ao
workflow "SEIRMG - Consultar Processo" quando o usuário pedir explicitamente.
Serve pra extensão do Chrome decidir, numa tela com várias linhas de processo (Controle
de Processos), em quais linhas mostrar um link "Ver Planka" — sem precisar consultar
processo por processo.

## Pré-requisitos

- A mesma credencial Postgres do n8n que já aponta pro **banco do Planka** (usada hoje
  pelo Workflow 2, "SEIRMG - Consultar Processo").
- A mesma variável de ambiente `SEIRMG_JWT_SECRET` já configurada no ambiente do n8n
  (usada pelos Workflows 1 e 2 para assinar/verificar o JWT).
- Não precisa da credencial do banco de `usuarios` — este workflow só verifica o token
  (que já prova a autenticação) e consulta o banco do Planka.

## Contrato HTTP

**Requisição:**
```
POST /webhook/seirmg-verificar-processos-lote
Authorization: Bearer <token>
Content-Type: application/json

{ "processos": ["HMMG.2025.00002346-08", "HMMG.2025.00001111-22"] }
```

**Resposta — sucesso (200), sempre — mesmo sem nenhum encontrado:**
```json
{ "encontrados": ["HMMG.2025.00002346-08"] }
```

**Resposta — token inválido/expirado (401):**
```json
{ "error": "Token inválido ou expirado" }
```

Não existe resposta 404 neste workflow: lista vazia em `encontrados` é um resultado
normal (nenhum dos processos enviados tem card no Planka), não um erro.

## Passo a passo

1. **Webhook**
   - Método: `POST`
   - Path: `seirmg-verificar-processos-lote`
   - Modo de resposta: "Using Respond to Webhook node"

2. **Code** — valida o token (idêntico ao passo 2 do Workflow 2, copiar sem alteração):

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

4. **Postgres (Execute Query)** (ramo falso) — credencial do banco do Planka:

   ```sql
   SELECT DISTINCT split_part(card.description, E'\n', 1) AS "processo"
   FROM card
   LEFT JOIN board b   ON b.id = card.board_id
   LEFT JOIN project p ON p.id = b.project_id
   WHERE p.id = 1551564557133022214
     AND b.id <> 1572619262520985419
     AND split_part(card.description, E'\n', 1) = ANY($1::text[])
   ```

   Parâmetro `$1`: `{{$('Webhook').first().json.body.processos}}` (a lista recebida no
   body, passada direto — o node Postgres do n8n converte a lista JS num array do
   Postgres para o `ANY($1::text[])`).

   **Importante:** habilite **"Always Output Data"** nas Settings deste node — mesmo
   motivo dos outros dois workflows: sem isso, quando nenhum processo da lista tem
   card, a query retorna zero linhas, o node não emite nenhum item, e a requisição
   fica pendurada até estourar o timeout do webhook em vez de responder uma lista
   vazia.

5. **Code** — junta os resultados numa lista só, tolerando o item vazio que o "Always
   Output Data" produz quando não há nenhuma linha:

   ```js
   const processos = $input.all()
     .map((item) => item.json.processo)
     .filter((valor) => typeof valor === 'string' && valor.length > 0)

   return [{ json: { encontrados: [...new Set(processos)] } }]
   ```

6. **Respond to Webhook** — status 200, body `{{$json}}` (já é `{ "encontrados": [...] }`).
   Este é o único caminho de resposta de sucesso — não há branch de "não encontrado"
   neste workflow.

## Fluxograma resumido

```
Webhook
  → Code (validar token)
  → IF (token inválido?)
      verdadeiro → Respond 401
      falso      → Postgres (buscar processos, Always Output Data ON)
                     → Code (agregar em { encontrados: [...] })
                     → Respond 200
```

## Teste manual (depois de montado)

```bash
curl -X POST https://<seu-n8n>/webhook/seirmg-verificar-processos-lote \
  -H "Authorization: Bearer <token válido do login>" \
  -H "Content-Type: application/json" \
  -d '{"processos": ["<NUP com card>", "<NUP sem card>"]}'
```

Esperado: `200`, `{ "encontrados": ["<só o NUP com card>"] }`. Repetir com token
vencido/adulterado: `401`. Repetir com todos os NUPs sem card: `200`,
`{ "encontrados": [] }`.
