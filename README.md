# Balestras & Cia — Loja de Armamento Branco (Balestras)

Projeto acadêmico full-stack: **MariaDB (Views/CTEs/Triggers/Functions/
Stored Procedures) + PHP (API/PDO) + Bootstrap 5 + TypeScript**.

## 📁 Estrutura

```
project/
├── index.html                     <- página principal (abrir no navegador)
├── sql/
│   ├── 01_schema.sql               tabelas + dados de exemplo
│   ├── 02_funcoes.sql              Function fn_classificar_estoque (reuso)
│   ├── 03_views_ctes.sql           Views analíticas com CTE (limpeza/consolidação)
│   ├── 04_triggers.sql             Triggers BEFORE UPDATE (valores sempre positivos)
│   └── 05_procedures.sql           Stored Procedures (listagem paginada + CRUD)
├── backend/
│   ├── config/db.php               conexão PDO com o MariaDB
│   └── api/
│       ├── produtos.php            GET    -> catálogo paginado/filtrado (JSON)
│       ├── categorias.php          GET    -> lista de categorias (JSON)
│       ├── produto_salvar.php      POST   -> cria OU edita produto (JSON)
│       ├── produto_excluir.php     POST   -> exclusão lógica de produto (JSON)
│       └── dashboard.php           GET    -> métricas + views consolidadas (JSON)
└── frontend/
    ├── css/style.css
    ├── img/ (fotos dos produtos + placeholder.svg)
    ├── ts/app.ts                   código-fonte TypeScript
    ├── js/app.js (+ .map)          JS já compilado (gerado por tsc)
    └── tsconfig.json
```

## 🚀 Como rodar no XAMPP

1. **Copie a pasta inteira** `project/` para dentro de `htdocs`, por exemplo:
   `C:\xampp\htdocs\balestras_cia\` (Windows) ou `/opt/lampp/htdocs/balestras_cia/` (Linux).

2. **Abra o XAMPP Control Panel** e inicie os módulos **Apache** e **MySQL**.

3. **Crie o banco de dados** — abra o phpMyAdmin (`http://localhost/phpmyadmin`)
   e execute, na aba "SQL", os arquivos **NESTA ORDEM** (a ordem importa: a
   function precisa existir antes das views que a usam, e as tabelas antes
   de tudo):

   1. `sql/01_schema.sql`
   2. `sql/02_funcoes.sql`
   3. `sql/03_views_ctes.sql`
   4. `sql/04_triggers.sql`
   5. `sql/05_procedures.sql`

   (Ou via terminal: `mysql -u root -p < sql/01_schema.sql` e assim por diante,
   respeitando a mesma ordem.)

4. **Confira as credenciais** em `backend/config/db.php`. Por padrão o XAMPP
   usa usuário `root` sem senha — se você configurou senha, ajuste a
   variável `$pass`.

5. **Acesse no navegador:**
   `http://localhost/balestras_cia/index.html`

   - A aba **Loja** carrega o catálogo via `backend/api/produtos.php`
     (com busca, filtro por categoria e paginação) e permite
     **criar, editar e excluir** produtos direto pela interface.
   - A aba **Dashboard** carrega as métricas via `backend/api/dashboard.php`.

## 🖼️ Fotos dos produtos e funcionamento sem servidor

Se a página for aberta sem o XAMPP rodando (ou o PHP/MariaDB não
responder), a aba **Loja** cai automaticamente para um catálogo local
(`PRODUTOS_FALLBACK` em `app.ts`) com os mesmos 7 produtos do
`sql/01_schema.sql`. Busca e filtro por categoria continuam funcionando
localmente; **criar/editar/excluir exige o backend rodando**, e o
sistema avisa isso educadamente ao usuário em vez de travar.

## 🛠️ Recompilando o TypeScript

O JS já vem compilado em `frontend/js/app.js`, mas se você editar
`frontend/ts/app.ts`, recompile com:

```bash
cd frontend
npx tsc -p tsconfig.json
```

(ou apenas `tsc -p tsconfig.json` se o TypeScript estiver instalado
globalmente: `npm install -g typescript`).

## ✅ Checklist de requisitos atendidos (mapeado à rubrica)

### Banco de Dados Avançado
| Requisito | Onde está |
|---|---|
| CTEs e Views analíticas que limpam/consolidam dados brutos | `sql/03_views_ctes.sql` — CTE `vendas_saneadas` (remove qtd/valor negativos) alimenta `vw_vendas_limpas`, `vw_faturamento_por_produto`, `vw_faturamento_por_categoria`, `vw_estoque_saude`, `vw_dashboard_raw` |
| Stored Procedures que centralizam busca, filtros e paginação, com chamadas assíncronas | `sql/05_procedures.sql` — `sp_listar_produtos(busca, categoria_id, pagina, por_pagina)`; chamada por `produtos.php` e consumida no front via `fetch` + `async/await` a cada busca/filtro/paginação |
| Trigger BEFORE UPDATE para padronizar valores positivos | `sql/04_triggers.sql` — `trg_produtos_before_update` e `trg_vendas_before_update` usam `ABS()` |
| Função no banco reutilizável em múltiplos pontos | `sql/02_funcoes.sql` — `fn_classificar_estoque()` usada em `vw_estoque_saude` **e** em `sp_listar_produtos` (mesma regra, um único lugar) |
| View que centraliza informações importantes | `vw_dashboard_raw` (linha a linha, pronta para o `.reduce()` do front) |

### Desenvolvimento Web Avançado
| Requisito | Onde está |
|---|---|
| Interface amigável / usabilidade | Busca com debounce, filtro por categoria, checkbox "somente em estoque", paginação, formulário de cadastro/edição com validação e mensagens de erro claras |
| Bootstrap com 3+ componentes | Navbar, Nav-pills (tabs), Cards, 3 Modals (detalhes / formulário / confirmação), Table, Alerts, Spinner, Badges, Pagination, Progress bars |
| 3 CRUDs completos (Create, Read, Update, Delete) | **Create**: `produto_salvar.php` (sem `id`) · **Read**: `produtos.php` · **Update**: `produto_salvar.php` (com `id`) · **Delete**: `produto_excluir.php` — tudo acessível pelos botões nos cards da Loja |
| Regras de exclusão claras | Exclusão é **lógica** (`ativo = 0`, via `sp_produto_excluir`): o produto some da loja mas o histórico de vendas não é perdido; a API sempre devolve uma mensagem explicando isso ao usuário |

### Lógica Avançada (TypeScript)
| Requisito | Onde está (`frontend/ts/app.ts`) |
|---|---|
| Modelagem de dados / contratos de interface | `interface Produto`, `Categoria`, `VendaRaw`, `FaturamentoPorProduto`, `PaginacaoMeta`, `ApiEnvelope<T>` etc. — tipagem estrita, sem `any` |
| Agregações e cálculos financeiros (`.reduce()`) | `renderCardsMetricas()` — um único `.reduce()` calcula faturamento total, unidades vendidas, ticket médio e maior venda |
| Segmentação e filtros de negócio (`.filter()`) | Filtro "somente em estoque" na Loja e `renderAlertasEstoque()` (isola produtos em estoque `CRITICO`) |
| Algoritmos de ranking (`.sort()`/`.slice()`) | `renderRankingProdutos()` — ordena por faturamento e destaca o Top 3 dinamicamente (pódio 🥇🥈🥉) |
| Transformação/formatação de estruturas (`.map()`) | `renderDistribuicaoCategorias()` — transforma a lista de faturamento por categoria em uma nova lista com percentual calculado, para as barras de participação |
| Tratamento de cenários de exceção | Estoque vazio, busca sem resultado (mensagem diferente de "sem cadastro"), falha de rede/backend (fallback local), divisão por zero no ticket médio, JSON inválido no POST |

### Tech Forge
| Requisito | Onde está |
|---|---|
| Consumo de API / fluxo assíncrono | Todas as chamadas usam `async/await` dentro de `try/catch` |
| Integração XAMPP + compilação TypeScript | Instruções acima; `app.js` é gerado de `app.ts` via `tsc` |
| Manipulação segura do DOM | `el<T>()` centraliza `getElementById` com checagem de nulo; `escapeHtml()` evita XSS ao renderizar nomes/descrições vindos do banco |
| Organização do código e modularidade | Funções pequenas e nomeadas por responsabilidade (busca, render, CRUD, dashboard), cada endpoint PHP focado em uma única ação |
| Comunicação técnico-visual do dashboard | Cards de métricas, pódio de ranking, barras de participação por categoria e tabela detalhada — layout limpo em HTML/CSS |

## 🧪 Testando os triggers manualmente (phpMyAdmin ou console MySQL)

```sql
UPDATE produtos SET preco_unitario = -50 WHERE id = 1;
SELECT preco_unitario FROM produtos WHERE id = 1; -- volta 50.00

UPDATE vendas SET quantidade = -3 WHERE id = 1;
SELECT quantidade FROM vendas WHERE id = 1; -- volta 3
```

## 🧪 Testando a função reutilizável

```sql
SELECT fn_classificar_estoque(3);   -- CRITICO
SELECT fn_classificar_estoque(10);  -- ATENCAO
SELECT fn_classificar_estoque(50);  -- OK
```

## 🧪 Testando as Stored Procedures

```sql
CALL sp_listar_produtos(NULL, NULL, 1, 8);        -- página 1, sem filtro
CALL sp_listar_produtos('balestra', NULL, 1, 8);  -- busca por nome
CALL sp_listar_produtos(NULL, 1, 1, 8);           -- só categoria 1

CALL sp_produto_criar('Facão de Mata', 3, 129.90, 15, NULL, 'Teste', @novo_id);
SELECT @novo_id;

CALL sp_produto_atualizar(@novo_id, 'Facão de Mata Pro', 3, 149.90, 10, NULL, 'Editado');
CALL sp_produto_excluir(@novo_id);
SELECT ativo FROM produtos WHERE id = @novo_id;   -- 0
```

## 🧪 Testando o cenário "banco vazio"

```sql
DELETE FROM vendas;
```

Recarregue a aba Dashboard: em vez de quebrar ou mostrar `NaN`, o sistema
exibirá a mensagem "Nenhum dado registrado."
