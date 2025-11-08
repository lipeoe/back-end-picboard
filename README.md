# PicBoard Backend – API Documentation

Backend em Node.js + Express para os KPIs e relatórios do PicBoard / PicMoney.

> **Resumo rápido**
> - **Base URL (dev):** `http://localhost:3001`
> - **Prefixos:** autenticação em `/auth`, rotas de negócio em `/api`
> - **Banco:** PostgreSQL (tabelas principais: `picmoney_unificada` e `picmoney_players`)
> - **Formato de datas:** ISO (`YYYY-MM-DD`) nas queries; respostas em JSON
> - **Contato:** Felipe O. S. Ojo – FECAP

---

## Índice

- [Requisitos](#requisitos)
- [Instalação](#instalação)
- [Configuração (ambiente)](#configuração-ambiente)
- [Execução](#execução)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Autenticação](#autenticação)
- [Rotas da API](#rotas-da-api)
  - [CEO – Rotas](#ceo--rotas)
  - [CFO – Rotas](#cfo--rotas)
- [Códigos de erro](#códigos-de-erro)
- [Boas práticas e observações](#boas-práticas-e-observações)
- [Licença](#licença)

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

Crie um arquivo `.env` (ou use suas variáveis em outro meio) com as credenciais do Postgres e porta:

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

Autentica o usuário e retorna um **JWT** com validade de **1h**.

- **Body (JSON):**
  ```json
  { "userId": "string|number", "password": "string" }
  ```

- **Validações/Fluxo:**
  1. Busca usuário por `user_id` na tabela **users**.
  2. Se não encontrar: **404** `{ "msg": "Conta não encontrada" }`
  3. Compara senha recebida com `user.senha` (comparação direta `==`).
  4. Se não bater: **401** `{ "msg": "Senha incorreta" }`
  5. Se ok: assina JWT com payload:
     ```json
     { "user_id": <user.user_id>, "role": "<user.cargo>" }
     ```
     - **Chave:** `process.env.JWT_SECRET_KEY`
     - **expiresIn:** `"1h"`

- **Resposta 200 (exemplo):**
  ```json
  {
    "msg": "Usuário logado",
    "token": "<jwt>",
    "user_id": 123,
    "role": "ceo"
  }
  ```

- **Erros possíveis:**
  - **500** `{ "msg": "Erro no servidor" }`
  - **404** `{ "msg": "Conta não encontrada" }`
  - **401** `{ "msg": "Senha incorreta" }`

> **Observação de segurança:** atualmente a senha é comparada em texto puro (`password == user.senha`). Em produção, use **hashing** (ex.: `bcrypt`) e comparação timing-safe.

---

## Rotas da API

> **Base path:** `/api`  
> **Headers padrão:** `Content-Type: application/json` e, se aplicável, `Authorization: Bearer <token>`.

### CEO – Rotas

<details>
<summary><strong>GET <code>/api/kpis/receita-total</code></strong></summary>

Retorna totais de **valor de cupons** (all-time) e comparação **mês atual vs mês anterior**, com **variação %** e **trend**.

- **Query:** —
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

</details>

<details>
<summary><strong>GET <code>/api/kpis/receita-liquida</code></strong></summary>

Retorna **receita líquida** (soma de `valor_cupom - repasse_picmoney`) all-time + comparativo mensal e tendência.

- **Query:** —
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

</details>

<details>
<summary><strong>GET <code>/api/kpis/total-segmentos</code></strong></summary>

Ranking por **categoria de estabelecimento** (segmentos), com filtros/ordenação/paginação.

- **Query (opcional):**
  - `start` `YYYY-MM-DD`
  - `end`   `YYYY-MM-DD`
  - `sort`  `total | media | qtd | nome` (default: `total`)
  - `order` `asc | desc` (default: `desc`)
  - `limit` inteiro ≥ 0 (default: `100`)
  - `offset` inteiro ≥ 0 (default: `0`)
- **Resposta 200:**
  ```json
  {
    "filtros": { "start": null, "end": null, "sort": "total", "order": "desc", "limit": 100, "offset": 0 },
    "seguimentos": [
      {
        "categoria_estabelecimento": "Cafeteria",
        "total_ocorrencias": 0,
        "total_valor_cupom": 0,
        "media_valor_cupom": 0
      }
    ]
  }
  ```
- **Exemplo:**
  ```bash
  curl -s "http://localhost:3001/api/kpis/total-segmentos?start=2025-10-01&end=2025-10-31&sort=qtd&order=desc&limit=20&offset=0"
  ```

</details>

<details>
<summary><strong>GET <code>/api/kpis/total-parceiros</code></strong></summary>

Ranking por **nome do estabelecimento** (parceiros), com os mesmos filtros/ordenadores da rota acima.

- **Query (opcional):** `start`, `end`, `sort` (`total|media|qtd|nome`), `order` (`asc|desc`), `limit`, `offset`
- **Resposta 200:**
  ```json
  {
    "filtros": { "start": null, "end": null, "sort": "total", "order": "desc", "limit": 100, "offset": 0 },
    "parceiros": [
      {
        "nome_estabelecimento": "Starbucks",
        "total_ocorrencias": 0,
        "total_valor_cupom": 0,
        "media_valor_cupom": 0
      }
    ]
  }
  ```
- **Exemplo:**
  ```bash
  curl -s "http://localhost:3001/api/kpis/total-parceiros?sort=media&order=asc&limit=50"
  ```

</details>

<details>
<summary><strong>GET <code>/api/kpis/usuarios</code></strong></summary>

KPIs de **usuários**: total **all-time**, **mês atual**, **mês anterior**, **% variação** e **trend**.

- **Query:** —
- **Resposta 200:**
  ```json
  {
    "total_usuarios": 0,
    "mes_atual": 0,
    "mes_anterior": 0,
    "variacao_percent": 0,
    "trend": "new | up | down | flat"
  }
  ```
- **Exemplo:**
  ```bash
  curl -s http://localhost:3001/api/kpis/usuarios
  ```

</details>

<details>
<summary><strong>GET <code>/api/kpis/principais-categorias</code></strong></summary>

Categorias mais frequentes entre os **players** (não cupons), com taxa de **pegou_cupom**.

- **Query:** —
- **Resposta 200:**
  ```json
  {
    "principais_categorias": [
      {
        "categoria_frequentada": "Farmácia",
        "total_usuarios": 0,
        "total_pegou_cupom": 0,
        "percentual_cupom": 0
      }
    ]
  }
  ```
- **Exemplo:**
  ```bash
  curl -s http://localhost:3001/api/kpis/principais-categorias
  ```

</details>

<details>
<summary><strong>GET <code>/api/kpis/retencao</code></strong></summary>

Retenção **mensal** (usuários com `ultima_sessao` no mês anterior **e** no mês atual).

- **Query:** —
- **Resposta 200:**
  ```json
  {
    "usuarios_prev": 0,
    "usuarios_cur": 0,
    "usuarios_retidos": 0,
    "retencao_percentual": 0
  }
  ```
- **Exemplo:**
  ```bash
  curl -s http://localhost:3001/api/kpis/retencao
  ```

</details>

<details>
<summary><strong>GET <code>/api/kpis/inativos-14/por-mes</code></strong></summary>

Quantidade de usuários **inativos por ≥14 dias** agregada **por mês** (últimos `meses`, incluindo o atual).

- **Query (opcional):** `meses` (1..36; default: 6)
- **Resposta 200:**
  ```json
  {
    "inativos_14_por_mes": [
      { "mes": "2025-07-01", "inativos_qnt": 0 }
    ],
    "meses": 6
  }
  ```
- **Exemplo:**
  ```bash
  curl -s "http://localhost:3001/api/kpis/inativos-14/por-mes?meses=12"
  ```

</details>

### CFO – Rotas

<details>
<summary><strong>GET <code>/api/kpis/ticket-medio</code></strong></summary>

Ticket médio (média de `valor_cupom`).

- **Query:** —
- **Resposta 200:**
  ```json
  { "ticket_medio": 0 }
  ```
- **Exemplo:**
  ```bash
  curl -s http://localhost:3001/api/kpis/ticket-medio
  ```

</details>

<details>
<summary><strong>GET <code>/api/kpis/receita-por-cupom</code></strong></summary>

Performance por **tipo de cupom**: quantidade, totais, ticket médio, repasse, **receita líquida** e **participação %**.

- **Query:** —
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

</details>

<details>
<summary><strong>GET <code>/api/kpis/participacao-por-periodo</code></strong></summary>

Participação por **período do dia** (**Manhã/Tarde/Noite**) — faixa de hora de 6h a 22:59.

- **Query:** —
- **Resposta 200:**
  ```json
  [
    {
      "periodo": "Manhã",
      "quantidade": 0,
      "total_valor_cupom": 0,
      "ticket_medio": 0,
      "participacao_percentual": 0
    }
  ]
  ```
- **Exemplo:**
  ```bash
  curl -s http://localhost:3001/api/kpis/participacao-por-periodo
  ```

</details>

<details>
<summary><strong>GET <code>/api/kpis/participacao-diaria</code></strong></summary>

Participação por **dia da semana (ISO DOW)**, com **ticket médio** e **total por dia**, mais **% de participação**.

- **Query:** —
- **Resposta 200:**
  ```json
  [
    {
      "dow": 1,
      "dia_semana": "Segunda",
      "ticket_medio": 0,
      "total_por_dia": 0,
      "participacao_percentual": 0
    }
  ]
  ```
- **Exemplo:**
  ```bash
  curl -s http://localhost:3001/api/kpis/participacao-diaria
  ```

</details>

---

## Códigos de erro

- **400** – parâmetros inválidos (ex.: datas `start/end` mal formatadas, sort/order inválidos)
- **401** – não autorizado (se ativado JWT/Auth nas rotas)
- **404** – rota não encontrada
- **500** – erro interno

---

## Boas práticas e observações

- **Paginação/Ordenação segura:** nas rotas de ranking (`total-segmentos` e `total-parceiros`), os campos `sort` e `order` são mapeados e validados para evitar SQL injection.
- **Fuso horário:** se precisar de coerência SP, normalize `CURRENT_DATE`/`timezone` no Postgres.
- **Índices:** índices em `data_captura`, `hora`, `nome_estabelecimento`, `categoria_estabelecimento` e `id_usuario` ajudam muito em produção.
- **Variáveis de ambiente:** não versione `.env`.
- **Observabilidade:** adicionar logs com `pino`/`winston` e métricas (Prometheus) facilita troubleshooting.

---

## Licença

MIT (ou ajuste conforme seu projeto).
