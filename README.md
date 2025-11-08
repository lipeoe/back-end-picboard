# PicBoard Backend – API Documentation (atualizado)

Backend em Node.js + Express para os KPIs e relatórios do PicBoard / PicMoney.

> **Resumo rápido**
>
> - **Base URL (dev):** `http://localhost:3001`
> - **Prefixos:** autenticação em `/auth`, rotas de negócio em `/api`
> - **Banco:** PostgreSQL (tabelas principais: `picmoney_unificada` e `picmoney_players`)
> - **Formato de datas:** ISO (`YYYY-MM-DD`) nas queries; respostas em JSON
> - **Contato:** Felipe O. S. Ojo – FECAP

---

## Índice

- Requisitos
- Instalação
- Configuração (ambiente)
- Execução
- Estrutura do projeto
- Autenticação
- Rotas da API
  - CEO – Rotas
  - CEO – Clientes (players)
  - CFO – Rotas
- Códigos de erro
- Boas práticas e observações
- Licença

---

## Requisitos

- Node.js 18+
- npm 9+ (ou pnpm/yarn)
- PostgreSQL 13+
- Variáveis de ambiente para conexão ao banco

## Instalação

```bash
git clone https://github.com/lipeoe/back-end-picboard.git
cd back-end-picboard
npm install
```

## Configuração (ambiente)

Crie um arquivo `.env` com as credenciais do Postgres e porta:

```env
PGHOST=seu-host.rds.amazonaws.com
PGPORT=5432
PGDATABASE=picboard
PGUSER=usuario
PGPASSWORD=senha
PORT=3001
NODE_ENV=development
JWT_SECRET_KEY=uma_chave_bem_secreta
```

> O banco no RDS já deve estar acessível pelo backend. Garanta que o **security group** do RDS permite conexões da instância/ambiente onde você executa o Node.

## Execução

```bash
npm run start
# ou
node server.js
```

- Dev: `http://localhost:3001`
- Produção: `https://<seu-dominio>`

## Estrutura do projeto

```
server.js
routes/
  ├─ loginRoutes.js        # /auth
  ├─ ceoRoutes.js          # /api (KPIs gerais e ranking por segmentos/parceiros)
  ├─ ceoRoutesClientes.js  # /api (KPIs focados em usuários/players)
  └─ cfoRoutes.js          # /api (KPIs financeiros e distribuição)
middleware/
  └─ userLogin.js          # lógica de /auth/login (JWT)
```

---

## Autenticação

### `POST /auth/login`

Autentica o usuário e retorna um JWT com validade de 1h.

- **Body (JSON):**

```json
{ "userId": "string|number", "password": "string" }
```

- **Validações/Fluxo:**
  1. Busca usuário por `user_id` na tabela users.
  2. Se não encontrar: **404** `{ "msg": "Conta não encontrada" }`
  3. Compara senha recebida com `user.senha` (comparação direta `==`).
  4. Se não bater: **401** `{ "msg": "Senha incorreta" }`
  5. Se ok: assina JWT com payload `{ "user_id": <user.user_id>, "role": "<user.cargo>" }`
     - Chave: `process.env.JWT_SECRET_KEY`
     - `expiresIn: "1h"`

- **Resposta 200 (exemplo):**
```json
{
  "msg": "Usuário logado",
  "token": "<jwt>",
  "user_id": 123,
  "role": "ceo"
}
```

> **Observação de segurança:** atualmente a senha é comparada em texto puro (`password == user.senha`). Em produção, use hashing (ex.: `bcrypt`) e comparação timing-safe.

---

## Rotas da API

> **Base path:** `/api`  
> **Headers padrão:** `Content-Type: application/json` e, se aplicável, `Authorization: Bearer <token>`.

### CEO – Rotas

#### GET `/api/kpis/receita-total`

Retorna totais de valor de cupons (all-time) e comparação mês atual vs mês anterior, com variação % e trend.

- Query: —
- **Resposta 200:**
```json
{
  "total_valor_cupom": 0,
  "mes_atual": 0,
  "mes_anterior": 0,
  "variacao_percent": 0,
  "trend": "up | down | flat"
}
```
- **Exemplo:**
```bash
curl -s http://localhost:3001/api/kpis/receita-total
```

#### GET `/api/kpis/receita-liquida`

Retorna receita líquida (soma de `valor_cupom - repasse_picmoney`) all-time + comparativo mensal e tendência.

- Query: —
- **Resposta 200:**
```json
{
  "receita_liquida": 0,
  "mes_atual": 0,
  "mes_anterior": 0,
  "variacao_percent": 0,
  "trend": "up | down | flat"
}
```
- **Exemplo:**
```bash
curl -s http://localhost:3001/api/kpis/receita-liquida
```

#### GET `/api/kpis/total-segmentos`

Ranking por categoria de estabelecimento (segmentos), com filtros/ordenação/paginação.

- Query (opcional):
  - `start` `YYYY-MM-DD`
  - `end` `YYYY-MM-DD`
  - `sort` `total | media | qtd | nome` (default: `total`)
  - `order` `asc | desc` (default: `desc`)
  - `limit` inteiro ≥ 0 (default: `100`)
  - `offset` inteiro ≥ 0 (default: `0`)

- **Resposta 200:**
```json
{
  "filtros": { "start": null, "end": null, "sort": "total", "order": "desc", "limit": 100, "offset": 0 },
  "seguimentos": [
    { "categoria_estabelecimento": "Cafeteria", "total_ocorrencias": 0, "total_valor_cupom": 0, "media_valor_cupom": 0 }
  ]
}
```
- **Exemplo:**
```bash
curl -s "http://localhost:3001/api/kpis/total-segmentos?start=2025-10-01&end=2025-10-31&sort=qtd&order=desc&limit=20&offset=0"
```

#### GET `/api/kpis/total-parceiros`

Ranking por nome do estabelecimento (parceiros), com os mesmos filtros/ordenadores da rota acima.

- Query (opcional): `start`, `end`, `sort` (`total|media|qtd|nome`), `order` (`asc|desc`), `limit`, `offset`
- **Resposta 200:**
```json
{
  "filtros": { "start": null, "end": null, "sort": "total", "order": "desc", "limit": 100, "offset": 0 },
  "parceiros": [
    { "nome_estabelecimento": "Starbucks", "total_ocorrencias": 0, "total_valor_cupom": 0, "media_valor_cupom": 0 }
  ]
}
```
- **Exemplo:**
```bash
curl -s "http://localhost:3001/api/kpis/total-parceiros?sort=media&order=asc&limit=50"
```

### CEO – Clientes (players)

#### GET `/api/kpis/usuarios`

KPIs de usuários: total all-time, mês atual, mês anterior, % variação e trend.

- Query: —
- **Resposta 200:**
```json
{ "total_usuarios": 0, "mes_atual": 0, "mes_anterior": 0, "variacao_percent": 0, "trend": "new | up | down | flat" }
```
- **Exemplo:**
```bash
curl -s http://localhost:3001/api/kpis/usuarios
```

#### GET `/api/kpis/principais-categorias`

Categorias mais frequentes entre os players (não cupons), com taxa de `pegou_cupom`.

- Query: —
- **Resposta 200:**
```json
{
  "principais_categorias": [
    { "categoria_frequentada": "Farmácia", "total_usuarios": 0, "total_pegou_cupom": 0, "percentual_cupom": 0 }
  ]
}
```
- **Exemplo:**
```bash
curl -s http://localhost:3001/api/kpis/principais-categorias
```

#### GET `/api/kpis/retencao`

Retenção mensal (usuários com `ultima_sessao` no mês anterior e no mês atual).

- Query: —
- **Resposta 200:**
```json
{ "usuarios_prev": 0, "usuarios_cur": 0, "usuarios_retidos": 0, "retencao_percentual": 0 }
```
- **Exemplo:**
```bash
curl -s http://localhost:3001/api/kpis/retencao
```

#### GET `/api/kpis/inativos-14/por-mes`

Quantidade de usuários inativos por ≥14 dias agregada por mês (últimos `meses`, incluindo o atual).

- Query (opcional): `meses` (1..36; default: 6)
- **Resposta 200:**
```json
{ "inativos_14_por_mes": [ { "mes": "2025-07-01", "inativos_qnt": 0 } ], "meses": 6 }
```
- **Exemplo:**
```bash
curl -s "http://localhost:3001/api/kpis/inativos-14/por-mes?meses=12"
```

#### GET `/api/kpis/ativos-por-semana`

Soma e média diária de usuários ativos (DAU) por dia da semana no mês atual.

- Query: —
- **Resposta 200:**
```json
[ { "dia_semana": "segunda", "ordem_semana": 1, "usuarios_ativos_mes": 0, "media_diaria_no_mes": 0 } ]
```

#### GET `/api/kpis/usuarios-ultimos-30d`

Série diária dos últimos 30 dias com contagem de usuários únicos por dia.

- Query: —
- **Resposta 200:**
```json
[ { "dia": "2025-10-15", "usuarios": 0 } ]
```

#### GET `/api/kpis/tempo-sessao/time`

Distribuição de `tempo_online` por faixas (0–15, 16–30, 31–45, 46–60, 61–120, >120 minutos).

- Query (opcional):
  - `start` (YYYY-MM-DD) — default: 1º dia do mês atual
  - `end`   (YYYY-MM-DD) — default: último dia do mês atual
- **Resposta 200:**
```json
[ { "faixa": "0-15", "qtd": 0, "percentual": 0 } ]
```

#### GET `/api/kpis/sessoes-por-usuario`

Para cada `id_usuario` distinto, retorna a quantidade de ocorrências (linhas) no período.

- Query (opcional): `start`, `end`, `limit` (default 100)
- **Resposta 200:**
```json
[ { "id_usuario": "abc", "sessoes": 3 } ]
```

#### GET `/api/kpis/usuarios-por-zona`

Usuários distintos por `zona` no período, com percentual relativo.

- Query (opcional): `start`, `end`, `limit`
- **Resposta 200:**
```json
{ "periodo": { "start": "mes_atual", "end": "mes_atual" }, "total_zonas": 5, "data": [ { "zona": "Centro", "total_usuarios": 0, "percentual": 0 } ] }
```

#### GET `/api/kpis/usuarios-por-bairro`

Usuários distintos por bairro (campo selecionável).

- Query (opcional):
  - `tipo` = `bairro_residencial` | `bairro_trabalho` | `bairro_escola` (default: `bairro_residencial`)
  - `start`, `end`, `limit`
- **Resposta 200:**
```json
{ "periodo": { "start": "mes_atual", "end": "mes_atual" }, "tipo": "bairro_residencial", "total_bairros": 0, "data": [ { "bairro": "Bela Vista", "total_usuarios": 0, "percentual": 0 } ] }
```

---

### CFO – Rotas

#### GET `/api/kpis/ticket-medio`

Ticket médio (média de `valor_cupom`).

- Query: —
- **Resposta 200:** `{ "ticket_medio": 0 }`
- **Exemplo:**
```bash
curl -s http://localhost:3001/api/kpis/ticket-medio
```

#### GET `/api/kpis/receita-por-cupom`

Performance por tipo de cupom: quantidade, totais, ticket médio, repasse, receita líquida e participação %.

- Query: —
- **Resposta 200:**
```json
{
  "dados_cupons": [
    {
      "tipo_cupom": "(Sem tipo)",
      "quantidade": 0,
      "total_valor_cupom": 0,
      "ticket_medio": 0,
      "total_repasse": 0,
      "receita_liquida": 0,
      "participacao_percentual": 0
    }
  ]
}
```
- **Exemplo:**
```bash
curl -s http://localhost:3001/api/kpis/receita-por-cupom
```

#### GET `/api/kpis/participacao-por-periodo`

Participação por período do dia (Manhã/Tarde/Noite) — faixa de hora de 6h a 22:59.

- Query: —
- **Resposta 200:**
```json
[
  { "periodo": "Manhã", "quantidade": 0, "total_valor_cupom": 0, "ticket_medio": 0, "participacao_percentual": 0 }
]
```
- **Exemplo:**
```bash
curl -s http://localhost:3001/api/kpis/participacao-por-periodo
```

#### GET `/api/kpis/participacao-diaria`

Participação por dia da semana (ISO DOW), com ticket médio e total por dia, mais % de participação.

- Query: —
- **Resposta 200:**
```json
[
  { "dow": 1, "dia_semana": "Segunda", "ticket_medio": 0, "total_por_dia": 0, "participacao_percentual": 0 }
]
```
- **Exemplo:**
```bash
curl -s http://localhost:3001/api/kpis/participacao-diaria
```

---

## Códigos de erro

- **400** – parâmetros inválidos (ex.: datas `start/end` mal formatadas, sort/order inválidos)
- **401** – não autorizado (se ativado JWT/Auth nas rotas)
- **404** – rota não encontrada
- **500** – erro interno

---

## Licença

MIT.
