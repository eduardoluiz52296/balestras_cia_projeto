// ============================================================
// Balestras & Cia - app.ts
//
// Consome a API PHP (async/await + try/catch), aplica filtros e
// paginação vindos do backend, calcula métricas do dashboard com
// .reduce()/.map()/.sort()/.filter() e trata cenários de exceção
// (sem dados, sem resultado de busca, falha de rede, falha de
// banco) sem quebrar a tela.
// ============================================================

// ---------- Tipagens (contratos de interface com a API) ----------
interface Categoria {
    id: number;
    nome: string;
    descricao: string | null;
}

interface Produto {
    id: number;
    nome: string;
    categoria: string;
    categoria_id: number;
    preco_unitario: string | number;
    estoque: number;
    imagem: string | null;
    descricao: string;
    status_estoque?: 'CRITICO' | 'ATENCAO' | 'OK';
}

interface PaginacaoMeta {
    pagina_atual: number;
    por_pagina: number;
    total_registros: number;
    total_paginas: number;
}

interface VendaRaw {
    venda_id: number;
    produto_id: number;
    produto_nome: string;
    categoria_nome: string;
    quantidade: string | number;
    valor_unitario: string | number;
    data_venda: string;
}

interface FaturamentoPorProduto {
    produto_id: number;
    produto_nome: string;
    categoria_nome: string;
    unidades_vendidas: string | number;
    faturamento_total: string | number;
    ticket_medio_unitario: string | number;
    numero_vendas: string | number;
}

interface FaturamentoPorCategoria {
    categoria_nome: string;
    unidades_vendidas: string | number;
    faturamento_total: string | number;
}

interface EstoqueSaude {
    produto_id: number;
    produto_nome: string;
    estoque_atual: number;
    total_vendido: string | number;
    status_estoque: 'CRITICO' | 'ATENCAO' | 'OK';
}

interface ApiEnvelope<T> {
    success: boolean;
    data: T;
    message?: string;
}

interface ApiListEnvelope<T> extends ApiEnvelope<T> {
    paginacao?: PaginacaoMeta;
}

interface DashboardData {
    vendas: VendaRaw[];
    por_categoria: FaturamentoPorCategoria[];
    por_produto: FaturamentoPorProduto[];
    estoque: EstoqueSaude[];
}

/** Linha já transformada (.map()) para exibir a barra de participação por categoria. */
interface CategoriaComPercentual extends FaturamentoPorCategoria {
    percentual: number;
}

// ---------- Config ----------
const API_BASE = 'backend/api';

// ---------- Estado dos filtros da Loja (usado pela paginação/busca) ----------
interface FiltroLoja {
    busca: string;
    categoriaId: number | null;
    pagina: number;
    somenteEmEstoque: boolean;
}

const filtroLoja: FiltroLoja = {
    busca: '',
    categoriaId: null,
    pagina: 1,
    somenteEmEstoque: false,
};

/** true quando a última tentativa de falar com a API falhou (modo catálogo local). */
let modoOffline = false;

// ---------- Catálogo de fallback ----------
// Usado quando o backend PHP/MariaDB não está disponível (ex.: o arquivo
// foi aberto direto no navegador, ou o XAMPP/Apache/MySQL ainda não foi
// configurado). Mantém os MESMOS produtos de sql/01_schema.sql, para que
// a Loja nunca fique vazia ou quebrada — mesmo sem o servidor rodando.
const PRODUTOS_FALLBACK: Produto[] = [
    { id: 1, nome: 'Balestra Recurva TR-150', categoria: 'Balestras', categoria_id: 1, preco_unitario: 899.90, estoque: 12, imagem: 'balestra1.jpg', descricao: 'Balestra recurva de alta precisão, 150 lbs, ideal para tiro esportivo.' },
    { id: 2, nome: 'Balestra Compound Predator', categoria: 'Balestras', categoria_id: 1, preco_unitario: 1590.00, estoque: 5, imagem: 'balestra2.jpg', descricao: 'Balestra compound com mira 4x32 e case rígido incluso.' },
    { id: 3, nome: 'Mini Balestra de Pulso', categoria: 'Balestras', categoria_id: 1, preco_unitario: 249.90, estoque: 20, imagem: 'balestra3.jpg', descricao: 'Balestra de pulso compacta para uso recreativo.' },
    { id: 4, nome: 'Arco Recurvo 62"', categoria: 'Arcos', categoria_id: 2, preco_unitario: 620.00, estoque: 8, imagem: 'arco1.jpg', descricao: 'Arco recurvo tradicional em madeira laminada.' },
    { id: 5, nome: 'Faca Bowie Tática', categoria: 'Facas de Coleção', categoria_id: 3, preco_unitario: 189.90, estoque: 30, imagem: 'faca1.jpg', descricao: 'Faca estilo Bowie com lâmina em aço inox 440C.' },
    { id: 6, nome: 'Espada Katana Decorativa', categoria: 'Espadas Decorativas', categoria_id: 4, preco_unitario: 459.00, estoque: 10, imagem: 'espada1.jpg', descricao: 'Réplica decorativa de katana com suporte de madeira.' },
    { id: 7, nome: 'Pack 12 Virotes Alumínio', categoria: 'Acessórios', categoria_id: 5, preco_unitario: 89.90, estoque: 50, imagem: 'virote1.jpg', descricao: 'Virotes em alumínio 6061, compatíveis com balestras recurvas.' },
];

const CATEGORIAS_FALLBACK: Categoria[] = [
    { id: 1, nome: 'Balestras', descricao: null },
    { id: 2, nome: 'Arcos', descricao: null },
    { id: 3, nome: 'Facas de Coleção', descricao: null },
    { id: 4, nome: 'Espadas Decorativas', descricao: null },
    { id: 5, nome: 'Acessórios', descricao: null },
];

// ---------- Helpers ----------

/** Converte string/number vindo do PHP em number seguro (0 se inválido). */
function toNumber(value: unknown): number {
    const n = typeof value === 'string' ? parseFloat(value) : (value as number);
    return Number.isFinite(n) ? n : 0;
}

function formatBRL(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function el<T extends HTMLElement>(id: string): T {
    const found = document.getElementById(id);
    if (!found) {
        throw new Error(`Elemento #${id} não encontrado no DOM.`);
    }
    return found as T;
}

function showAlert(containerId: string, message: string, type: 'warning' | 'danger' | 'info' | 'success' = 'warning'): void {
    const container = el<HTMLDivElement>(containerId);
    container.innerHTML = `
        <div class="alert alert-${type} d-flex align-items-center gap-2" role="alert">
            <i class="bi bi-info-circle"></i>
            <span>${message}</span>
        </div>`;
}

/** Toast simples reaproveitando o container de alertas do topo da Loja. */
function toastLoja(message: string, type: 'success' | 'danger' | 'warning' = 'success'): void {
    const container = el<HTMLDivElement>('loja-alert');
    container.innerHTML = `
        <div class="alert alert-${type} alert-dismissible fade show d-flex align-items-center gap-2" role="alert">
            <i class="bi bi-check-circle"></i>
            <span>${message}</span>
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>`;
}

/** Debounce genérico: evita 1 requisição por tecla digitada na busca. */
function debounce<A extends unknown[]>(fn: (...args: A) => void, delayMs: number): (...args: A) => void {
    let timer: number | undefined;
    return (...args: A) => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => fn(...args), delayMs);
    };
}

function escapeHtml(texto: string): string {
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
}

// ------------------------------------------------------------
// 1) CATEGORIAS (filtro da Loja + <select> do formulário)
// ------------------------------------------------------------
async function carregarCategorias(): Promise<Categoria[]> {
    try {
        const resp = await fetch(`${API_BASE}/categorias.php`);
        if (!resp.ok) throw new Error(`Falha HTTP ${resp.status}`);

        const json = (await resp.json()) as ApiEnvelope<Categoria[]>;
        if (!json.success) throw new Error(json.message ?? 'Erro ao carregar categorias.');

        return json.data ?? [];
    } catch (erro) {
        console.warn('Categorias: usando lista local (backend indisponível):', erro);
        return CATEGORIAS_FALLBACK;
    }
}

function popularSelectCategorias(selectId: string, categorias: Categoria[], comOpcaoTodas: boolean): void {
    const select = el<HTMLSelectElement>(selectId);
    const opcoes = categorias
        .map((c) => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`)
        .join('');

    select.innerHTML = comOpcaoTodas
        ? `<option value="">Todas as categorias</option>${opcoes}`
        : `<option value="" disabled selected>Selecione...</option>${opcoes}`;
}

// ------------------------------------------------------------
// 2) CARREGAR CATÁLOGO (Loja) — busca + filtro + paginação
// ------------------------------------------------------------
async function carregarProdutos(): Promise<void> {
    const grid = el<HTMLDivElement>('produtos-grid');
    const paginacaoWrap = el<HTMLElement>('produtos-paginacao');

    const params = new URLSearchParams();
    if (filtroLoja.busca) params.set('busca', filtroLoja.busca);
    if (filtroLoja.categoriaId) params.set('categoria_id', String(filtroLoja.categoriaId));
    params.set('pagina', String(filtroLoja.pagina));
    params.set('por_pagina', '8');

    try {
        const resp = await fetch(`${API_BASE}/produtos.php?${params.toString()}`);

        if (!resp.ok) {
            throw new Error(`Falha HTTP ${resp.status} ao buscar produtos.`);
        }

        const json = (await resp.json()) as ApiListEnvelope<Produto[]>;

        if (!json.success) {
            throw new Error(json.message ?? 'Erro desconhecido ao carregar produtos.');
        }

        modoOffline = false;
        let produtos = json.data ?? [];

        // Filtro client-side extra (.filter()) sobre a página atual:
        // "somente em estoque" não depende de nova ida ao servidor.
        if (filtroLoja.somenteEmEstoque) {
            produtos = produtos.filter((p) => p.estoque > 0);
        }

        // Edge case: filtros aplicados não retornaram nada (diferente de "sem cadastro nenhum")
        if (produtos.length === 0) {
            const temFiltro = Boolean(filtroLoja.busca || filtroLoja.categoriaId || filtroLoja.somenteEmEstoque);
            grid.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-info text-center mb-0">
                        ${temFiltro
                            ? 'Nenhum produto encontrado para os filtros aplicados. Tente ajustar a busca.'
                            : 'Nenhum produto cadastrado no momento.'}
                    </div>
                </div>`;
            paginacaoWrap.innerHTML = '';
            return;
        }

        grid.innerHTML = produtos.map(renderCardProduto).join('');
        anexarEventosDosCards(produtos);
        renderPaginacao(json.paginacao ?? null);

    } catch (erro) {
        // Edge case: falha de rede / backend fora do ar (ex.: página aberta
        // sem servidor PHP/MariaDB, ou XAMPP ainda não configurado).
        // Em vez de deixar a Loja quebrada, cai para o catálogo local
        // (mesmos dados de sql/01_schema.sql) para a vitrine nunca ficar vazia.
        console.warn('Não foi possível falar com a API PHP, usando catálogo local:', erro);
        modoOffline = true;

        let locais = PRODUTOS_FALLBACK.filter((p) => {
            const buscaOk = !filtroLoja.busca || p.nome.toLowerCase().includes(filtroLoja.busca.toLowerCase());
            const categoriaOk = !filtroLoja.categoriaId || p.categoria_id === filtroLoja.categoriaId;
            const estoqueOk = !filtroLoja.somenteEmEstoque || p.estoque > 0;
            return buscaOk && categoriaOk && estoqueOk;
        });

        grid.innerHTML = `
            <div class="col-12 mb-3">
                <div class="alert alert-warning small py-2 px-3 mb-0">
                    <i class="bi bi-plug"></i>
                    Exibindo catálogo local (o backend PHP/MariaDB não respondeu).
                    Busca e filtro funcionam, mas cadastrar/editar/excluir produtos exige
                    o XAMPP configurado — veja o README.
                </div>
            </div>` +
            (locais.length === 0
                ? `<div class="col-12"><div class="alert alert-info text-center mb-0">Nenhum produto encontrado para os filtros aplicados.</div></div>`
                : locais.map(renderCardProduto).join(''));

        anexarEventosDosCards(locais);
        paginacaoWrap.innerHTML = '';
    }
}

function renderCardProduto(p: Produto): string {
    const preco = toNumber(p.preco_unitario);
    const imgSrc = p.imagem ? `frontend/img/${p.imagem}` : 'frontend/img/placeholder.svg';
    const semEstoque = p.estoque <= 0;

    return `
    <div class="col-sm-6 col-lg-4 col-xl-3">
        <div class="card h-100 shadow-sm produto-card">
            <div class="ratio ratio-4x3 bg-light">
                <img src="${imgSrc}" class="card-img-top object-fit-cover" alt="${escapeHtml(p.nome)}"
                     onerror="this.src='frontend/img/placeholder.svg'">
            </div>
            <div class="card-body d-flex flex-column">
                <span class="badge text-bg-secondary mb-2 align-self-start">${escapeHtml(p.categoria)}</span>
                <h6 class="card-title">${escapeHtml(p.nome)}</h6>
                <p class="fw-bold text-success mb-1">${formatBRL(preco)}</p>
                <p class="small text-muted mb-3">
                    ${semEstoque ? '<span class="text-danger">Fora de estoque</span>' : `${p.estoque} un. disponíveis`}
                </p>
                <div class="mt-auto d-flex gap-2">
                    <button class="btn btn-outline-dark btn-sm flex-fill btn-detalhes"
                            data-id="${p.id}" ${semEstoque ? 'disabled' : ''}>
                        Ver detalhes
                    </button>
                    <button class="btn btn-outline-secondary btn-sm btn-editar" data-id="${p.id}" title="Editar produto">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-outline-danger btn-sm btn-excluir" data-id="${p.id}" title="Excluir produto">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    </div>`;
}

function renderPaginacao(meta: PaginacaoMeta | null): void {
    const wrap = el<HTMLElement>('produtos-paginacao');

    if (!meta || meta.total_paginas <= 1) {
        wrap.innerHTML = '';
        return;
    }

    const itens: string[] = [];
    for (let i = 1; i <= meta.total_paginas; i++) {
        itens.push(`
            <li class="page-item ${i === meta.pagina_atual ? 'active' : ''}">
                <button class="page-link btn-pagina" data-pagina="${i}">${i}</button>
            </li>`);
    }

    wrap.innerHTML = `
        <nav aria-label="Paginação do catálogo">
            <ul class="pagination pagination-sm justify-content-center mb-0">
                <li class="page-item ${meta.pagina_atual <= 1 ? 'disabled' : ''}">
                    <button class="page-link btn-pagina" data-pagina="${meta.pagina_atual - 1}">&laquo;</button>
                </li>
                ${itens.join('')}
                <li class="page-item ${meta.pagina_atual >= meta.total_paginas ? 'disabled' : ''}">
                    <button class="page-link btn-pagina" data-pagina="${meta.pagina_atual + 1}">&raquo;</button>
                </li>
            </ul>
        </nav>`;

    wrap.querySelectorAll<HTMLButtonElement>('.btn-pagina').forEach((btn) => {
        btn.addEventListener('click', () => {
            const novaPagina = Number(btn.dataset.pagina);
            if (!novaPagina || novaPagina < 1 || novaPagina > meta.total_paginas) return;
            filtroLoja.pagina = novaPagina;
            void carregarProdutos();
            window.scrollTo({ top: el<HTMLElement>('painel-loja').offsetTop - 80, behavior: 'smooth' });
        });
    });
}

function anexarEventosDosCards(produtos: Produto[]): void {
    const modalDetalhesEl = el<HTMLDivElement>('produtoModal');
    // @ts-ignore - bootstrap é carregado via CDN (script global)
    const modalDetalhes = new bootstrap.Modal(modalDetalhesEl);

    document.querySelectorAll<HTMLButtonElement>('.btn-detalhes').forEach((btn) => {
        btn.addEventListener('click', () => {
            const produto = produtos.find((p) => p.id === Number(btn.dataset.id));
            if (!produto) return;

            el<HTMLElement>('modalProdutoNome').textContent = produto.nome;
            el<HTMLElement>('modalProdutoCategoria').textContent = produto.categoria;
            el<HTMLElement>('modalProdutoDescricao').textContent = produto.descricao || 'Sem descrição cadastrada.';
            el<HTMLElement>('modalProdutoPreco').textContent = formatBRL(toNumber(produto.preco_unitario));
            el<HTMLElement>('modalProdutoEstoque').textContent = `${produto.estoque} unidades em estoque`;

            modalDetalhes.show();
        });
    });

    document.querySelectorAll<HTMLButtonElement>('.btn-editar').forEach((btn) => {
        btn.addEventListener('click', () => {
            const produto = produtos.find((p) => p.id === Number(btn.dataset.id));
            if (!produto) return;
            abrirFormularioProduto(produto);
        });
    });

    document.querySelectorAll<HTMLButtonElement>('.btn-excluir').forEach((btn) => {
        btn.addEventListener('click', () => {
            const produto = produtos.find((p) => p.id === Number(btn.dataset.id));
            if (!produto) return;
            abrirConfirmacaoExclusao(produto);
        });
    });
}

// ------------------------------------------------------------
// 3) CRUD — Criar / Editar / Excluir produto
// ------------------------------------------------------------
function abrirFormularioProduto(produto: Produto | null): void {
    if (modoOffline) {
        toastLoja('Cadastro/edição exige o backend PHP/MariaDB rodando (XAMPP). Veja o README.', 'warning');
        return;
    }

    const form = el<HTMLFormElement>('form-produto');
    form.reset();

    el<HTMLElement>('produtoFormTitulo').textContent = produto ? 'Editar produto' : 'Novo produto';
    el<HTMLInputElement>('campo-id').value = produto ? String(produto.id) : '';
    el<HTMLInputElement>('campo-nome').value = produto?.nome ?? '';
    el<HTMLSelectElement>('campo-categoria').value = produto ? String(produto.categoria_id) : '';
    el<HTMLInputElement>('campo-preco').value = produto ? String(toNumber(produto.preco_unitario)) : '';
    el<HTMLInputElement>('campo-estoque').value = produto ? String(produto.estoque) : '';
    el<HTMLInputElement>('campo-imagem').value = produto?.imagem ?? '';
    el<HTMLTextAreaElement>('campo-descricao').value = produto?.descricao ?? '';
    el<HTMLDivElement>('produtoFormErro').classList.add('d-none');

    const modalEl = el<HTMLDivElement>('produtoFormModal');
    // @ts-ignore
    new bootstrap.Modal(modalEl).show();
}

async function salvarProduto(evento: SubmitEvent): Promise<void> {
    evento.preventDefault();

    const erroBox = el<HTMLDivElement>('produtoFormErro');
    erroBox.classList.add('d-none');

    const idTexto = el<HTMLInputElement>('campo-id').value;
    const payload = {
        id: idTexto ? Number(idTexto) : undefined,
        nome: el<HTMLInputElement>('campo-nome').value.trim(),
        categoria_id: Number(el<HTMLSelectElement>('campo-categoria').value),
        preco_unitario: Number(el<HTMLInputElement>('campo-preco').value),
        estoque: Number(el<HTMLInputElement>('campo-estoque').value),
        imagem: el<HTMLInputElement>('campo-imagem').value.trim() || null,
        descricao: el<HTMLTextAreaElement>('campo-descricao').value.trim(),
    };

    const botaoSalvar = el<HTMLButtonElement>('btn-salvar-produto');
    botaoSalvar.disabled = true;
    botaoSalvar.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Salvando...`;

    try {
        const resp = await fetch(`${API_BASE}/produto_salvar.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const json = (await resp.json()) as ApiEnvelope<{ id: number }>;

        if (!resp.ok || !json.success) {
            throw new Error(json.message ?? 'Não foi possível salvar o produto.');
        }

        // @ts-ignore
        bootstrap.Modal.getInstance(el('produtoFormModal'))?.hide();
        toastLoja(json.message ?? 'Produto salvo com sucesso.', 'success');
        filtroLoja.pagina = 1;
        await carregarProdutos();

    } catch (erro) {
        erroBox.textContent = erro instanceof Error ? erro.message : 'Erro inesperado ao salvar.';
        erroBox.classList.remove('d-none');
    } finally {
        botaoSalvar.disabled = false;
        botaoSalvar.innerHTML = 'Salvar';
    }
}

let produtoParaExcluir: Produto | null = null;

function abrirConfirmacaoExclusao(produto: Produto): void {
    if (modoOffline) {
        toastLoja('Exclusão exige o backend PHP/MariaDB rodando (XAMPP). Veja o README.', 'warning');
        return;
    }

    produtoParaExcluir = produto;
    el<HTMLElement>('confirmExclusaoNome').textContent = produto.nome;

    const modalEl = el<HTMLDivElement>('confirmExclusaoModal');
    // @ts-ignore
    new bootstrap.Modal(modalEl).show();
}

async function confirmarExclusao(): Promise<void> {
    if (!produtoParaExcluir) return;

    const botao = el<HTMLButtonElement>('btn-confirmar-exclusao');
    botao.disabled = true;

    try {
        const resp = await fetch(`${API_BASE}/produto_excluir.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: produtoParaExcluir.id }),
        });

        const json = (await resp.json()) as ApiEnvelope<null>;

        if (!resp.ok || !json.success) {
            throw new Error(json.message ?? 'Não foi possível excluir o produto.');
        }

        // @ts-ignore
        bootstrap.Modal.getInstance(el('confirmExclusaoModal'))?.hide();
        toastLoja(json.message ?? 'Produto excluído.', 'success');
        await carregarProdutos();

    } catch (erro) {
        toastLoja(erro instanceof Error ? erro.message : 'Erro inesperado ao excluir.', 'danger');
    } finally {
        botao.disabled = false;
        produtoParaExcluir = null;
    }
}

// ------------------------------------------------------------
// 4) Barra de busca/filtro da Loja
// ------------------------------------------------------------
function inicializarFiltrosLoja(): void {
    const inputBusca = el<HTMLInputElement>('filtro-busca');
    const selectCategoria = el<HTMLSelectElement>('filtro-categoria');
    const checkEstoque = el<HTMLInputElement>('filtro-estoque');
    const botaoNovo = el<HTMLButtonElement>('btn-novo-produto');

    const dispararBusca = debounce(() => {
        filtroLoja.busca = inputBusca.value.trim();
        filtroLoja.pagina = 1;
        void carregarProdutos();
    }, 350);

    inputBusca.addEventListener('input', dispararBusca);

    selectCategoria.addEventListener('change', () => {
        filtroLoja.categoriaId = selectCategoria.value ? Number(selectCategoria.value) : null;
        filtroLoja.pagina = 1;
        void carregarProdutos();
    });

    checkEstoque.addEventListener('change', () => {
        filtroLoja.somenteEmEstoque = checkEstoque.checked;
        void carregarProdutos();
    });

    botaoNovo.addEventListener('click', () => abrirFormularioProduto(null));

    el<HTMLFormElement>('form-produto').addEventListener('submit', (e) => void salvarProduto(e));
    el<HTMLButtonElement>('btn-confirmar-exclusao').addEventListener('click', () => void confirmarExclusao());
}

// ------------------------------------------------------------
// 5) CARREGAR DASHBOARD (agregações .reduce(), ranking .sort(),
//    distribuição .map(), alertas .filter())
// ------------------------------------------------------------
async function carregarDashboard(): Promise<void> {
    const cardsWrap = el<HTMLDivElement>('dashboard-cards');
    const tabelaWrap = el<HTMLDivElement>('dashboard-tabela-wrap');
    const rankingWrap = el<HTMLDivElement>('dashboard-ranking');
    const categoriasWrap = el<HTMLDivElement>('dashboard-categorias');
    const alertWrap = el<HTMLDivElement>('dashboard-alert');

    alertWrap.innerHTML = '';

    try {
        const resp = await fetch(`${API_BASE}/dashboard.php`);

        if (!resp.ok) {
            throw new Error(`Falha HTTP ${resp.status} ao buscar dashboard.`);
        }

        const json = (await resp.json()) as ApiEnvelope<DashboardData>;

        if (!json.success) {
            throw new Error(json.message ?? 'Erro desconhecido ao carregar a dashboard.');
        }

        const { vendas, por_produto, por_categoria, estoque } = json.data;

        // Edge case: nenhuma venda registrada no banco
        if (!vendas || vendas.length === 0) {
            cardsWrap.innerHTML = '';
            tabelaWrap.innerHTML = '';
            rankingWrap.innerHTML = '';
            categoriasWrap.innerHTML = '';
            showAlert('dashboard-alert', 'Nenhum dado registrado. Assim que houver vendas, as métricas aparecerão aqui.', 'info');
            return;
        }

        renderCardsMetricas(vendas);
        renderRankingProdutos(por_produto ?? []);
        renderDistribuicaoCategorias(por_categoria ?? []);
        renderTabelaProdutos(por_produto ?? []);
        renderAlertasEstoque(estoque ?? []);

    } catch (erro) {
        console.error('Erro ao carregar dashboard:', erro);
        cardsWrap.innerHTML = '';
        tabelaWrap.innerHTML = '';
        rankingWrap.innerHTML = '';
        categoriasWrap.innerHTML = '';
        showAlert('dashboard-alert', 'Não foi possível carregar os dados da dashboard. Verifique a conexão com o banco/API.', 'danger');
    }
}

/**
 * Núcleo do requisito de "Agregações via reduce()":
 * a partir do array bruto de vendas vindo do PHP, calcula:
 *  - faturamento total (quantidade * valor_unitario, acumulado)
 *  - total de unidades vendidas
 *  - ticket médio
 *  - venda de maior valor (subtotal)
 * tudo em um único reduce, sem risco de NaN mesmo com dados
 * "sujos" que eventualmente escapem da limpeza do banco.
 */
function renderCardsMetricas(vendas: VendaRaw[]): void {
    const cardsWrap = el<HTMLDivElement>('dashboard-cards');

    type Acumulador = {
        faturamentoTotal: number;
        unidadesVendidas: number;
        numeroVendas: number;
        maiorVenda: number;
    };

    const acumuladorInicial: Acumulador = {
        faturamentoTotal: 0,
        unidadesVendidas: 0,
        numeroVendas: 0,
        maiorVenda: 0,
    };

    const resultado = vendas.reduce<Acumulador>((acc, venda) => {
        // Defesa extra: mesmo com a View já limpando os dados,
        // nunca confiamos cegamente no que chega do PHP.
        const quantidade = Math.max(0, toNumber(venda.quantidade));
        const valorUnitario = Math.max(0, toNumber(venda.valor_unitario));
        const subtotal = quantidade * valorUnitario;

        return {
            faturamentoTotal: acc.faturamentoTotal + subtotal,
            unidadesVendidas: acc.unidadesVendidas + quantidade,
            numeroVendas: acc.numeroVendas + 1,
            maiorVenda: Math.max(acc.maiorVenda, subtotal),
        };
    }, acumuladorInicial);

    // Edge case: proteção contra divisão por zero (NaN) no ticket médio
    const ticketMedio = resultado.numeroVendas > 0
        ? resultado.faturamentoTotal / resultado.numeroVendas
        : 0;

    cardsWrap.innerHTML = `
        ${cardMetrica('Faturamento Total', formatBRL(resultado.faturamentoTotal), 'bi-cash-coin', 'success')}
        ${cardMetrica('Unidades Vendidas', resultado.unidadesVendidas.toLocaleString('pt-BR'), 'bi-box-seam', 'primary')}
        ${cardMetrica('Ticket Médio', formatBRL(ticketMedio), 'bi-graph-up', 'info')}
        ${cardMetrica('Maior Venda', formatBRL(resultado.maiorVenda), 'bi-trophy', 'warning')}
    `;
}

function cardMetrica(titulo: string, valor: string, icone: string, cor: string): string {
    return `
    <div class="col-sm-6 col-lg-3">
        <div class="card border-0 shadow-sm h-100">
            <div class="card-body">
                <div class="text-${cor} mb-2"><i class="bi ${icone} fs-3"></i></div>
                <p class="text-muted small mb-1">${titulo}</p>
                <h4 class="mb-0">${valor}</h4>
            </div>
        </div>
    </div>`;
}

/**
 * Algoritmo de Ranking: ordena (.sort()) os produtos por faturamento
 * e destaca (.slice()) o Top 3 — o "pódio" de mais vendidos, recalculado
 * dinamicamente a cada carga do dashboard (não é um valor fixo no banco).
 */
function renderRankingProdutos(porProduto: FaturamentoPorProduto[]): void {
    const wrap = el<HTMLDivElement>('dashboard-ranking');

    if (porProduto.length === 0) {
        wrap.innerHTML = '';
        return;
    }

    const top3 = [...porProduto]
        .sort((a, b) => toNumber(b.faturamento_total) - toNumber(a.faturamento_total))
        .slice(0, 3);

    const medalhas = ['🥇', '🥈', '🥉'];
    const cores = ['warning', 'secondary', 'danger'];

    const cartoes = top3.map((p, indice) => `
        <div class="col-md-4">
            <div class="card border-0 shadow-sm h-100 border-top border-4 border-${cores[indice]}">
                <div class="card-body text-center">
                    <div class="fs-2 mb-1">${medalhas[indice]}</div>
                    <h6 class="mb-1">${escapeHtml(p.produto_nome)}</h6>
                    <p class="text-muted small mb-2">${escapeHtml(p.categoria_nome)}</p>
                    <p class="fw-bold text-success mb-0">${formatBRL(toNumber(p.faturamento_total))}</p>
                    <p class="small text-muted mb-0">${toNumber(p.unidades_vendidas).toLocaleString('pt-BR')} un. vendidas</p>
                </div>
            </div>
        </div>`).join('');

    wrap.innerHTML = `
        <h3 class="h6 text-uppercase text-muted mb-3"><i class="bi bi-trophy-fill"></i> Top 3 produtos em destaque</h3>
        <div class="row g-3 mb-4">${cartoes}</div>`;
}

/**
 * Transformação/formatação de estrutura (.map()): converte a lista
 * bruta "por_categoria" (vinda pronta da View) em uma nova lista já
 * com o percentual de participação de cada categoria no faturamento
 * total, pronta para desenhar as barras de progresso.
 */
function renderDistribuicaoCategorias(porCategoria: FaturamentoPorCategoria[]): void {
    const wrap = el<HTMLDivElement>('dashboard-categorias');

    if (porCategoria.length === 0) {
        wrap.innerHTML = '';
        return;
    }

    const totalGeral = porCategoria.reduce((soma, c) => soma + toNumber(c.faturamento_total), 0);

    const comPercentual: CategoriaComPercentual[] = porCategoria.map((c) => ({
        ...c,
        percentual: totalGeral > 0 ? (toNumber(c.faturamento_total) / totalGeral) * 100 : 0,
    }));

    const barras = comPercentual.map((c) => `
        <div class="mb-2">
            <div class="d-flex justify-content-between small mb-1">
                <span>${escapeHtml(c.categoria_nome)}</span>
                <span class="text-muted">${formatBRL(toNumber(c.faturamento_total))} · ${c.percentual.toFixed(1)}%</span>
            </div>
            <div class="progress" style="height: 8px;">
                <div class="progress-bar bg-dark" style="width: ${c.percentual.toFixed(1)}%"></div>
            </div>
        </div>`).join('');

    wrap.innerHTML = `
        <h3 class="h6 text-uppercase text-muted mb-3"><i class="bi bi-pie-chart-fill"></i> Participação por categoria</h3>
        <div class="card border-0 shadow-sm mb-4"><div class="card-body">${barras}</div></div>`;
}

function renderTabelaProdutos(porProduto: FaturamentoPorProduto[]): void {
    const wrap = el<HTMLDivElement>('dashboard-tabela-wrap');

    if (porProduto.length === 0) {
        wrap.innerHTML = '';
        return;
    }

    const linhas = porProduto.map((p) => `
        <tr>
            <td>${escapeHtml(p.produto_nome)}</td>
            <td>${escapeHtml(p.categoria_nome)}</td>
            <td class="text-end">${toNumber(p.unidades_vendidas).toLocaleString('pt-BR')}</td>
            <td class="text-end">${formatBRL(toNumber(p.faturamento_total))}</td>
            <td class="text-end">${formatBRL(toNumber(p.ticket_medio_unitario))}</td>
        </tr>`).join('');

    wrap.innerHTML = `
    <h3 class="h6 text-uppercase text-muted mb-3"><i class="bi bi-table"></i> Faturamento detalhado por produto</h3>
    <div class="table-responsive">
        <table class="table table-hover align-middle bg-white">
            <thead class="table-dark">
                <tr>
                    <th>Produto</th>
                    <th>Categoria</th>
                    <th class="text-end">Unidades</th>
                    <th class="text-end">Faturamento</th>
                    <th class="text-end">Preço médio</th>
                </tr>
            </thead>
            <tbody>${linhas}</tbody>
        </table>
    </div>`;
}

/** Segmentação de negócio (.filter()): isola só os produtos em estado crítico de estoque. */
function renderAlertasEstoque(estoque: EstoqueSaude[]): void {
    const criticos = estoque.filter((e) => e.status_estoque === 'CRITICO');

    if (criticos.length === 0) return;

    const lista = criticos.map((e) => `<li>${escapeHtml(e.produto_nome)} — ${e.estoque_atual} un. restantes</li>`).join('');

    const container = el<HTMLDivElement>('dashboard-alert');
    container.innerHTML += `
        <div class="alert alert-warning mt-3">
            <strong><i class="bi bi-exclamation-triangle"></i> Estoque crítico:</strong>
            <ul class="mb-0 mt-1">${lista}</ul>
        </div>`;
}

// ------------------------------------------------------------
// 6) Navegação entre abas (Loja / Dashboard) + inicialização
// ------------------------------------------------------------
function inicializarAbas(): void {
    const tabDashboard = document.getElementById('tab-dashboard');
    if (!tabDashboard) return;

    tabDashboard.addEventListener('shown.bs.tab', () => {
        void carregarDashboard();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    inicializarAbas();
    inicializarFiltrosLoja();

    void (async () => {
        const categorias = await carregarCategorias();
        popularSelectCategorias('filtro-categoria', categorias, true);
        popularSelectCategorias('campo-categoria', categorias, false);
        await carregarProdutos();
    })();
});
