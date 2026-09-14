<?php
/**
 * GET /backend/api/produtos.php
 *
 * Catálogo de produtos com busca, filtro por categoria e
 * paginação — tudo resolvido em uma única chamada à Stored
 * Procedure sp_listar_produtos (sql/05_procedures.sql).
 *
 * Query params aceitos (todos opcionais):
 *   busca         string  -> parte do nome do produto
 *   categoria_id  int     -> filtra por categoria
 *   pagina        int     -> página atual (default 1)
 *   por_pagina    int     -> itens por página (default 8, máx 50)
 *
 * Chamado pelo front (app.ts) via fetch + async/await sempre que o
 * usuário digita na busca, troca o filtro ou muda de página —
 * o servidor nunca recebe o catálogo inteiro de uma vez.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf8mb4');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/../config/db.php';

// ---------- Leitura e sanitização dos parâmetros de entrada ----------
$busca       = isset($_GET['busca']) ? trim((string) $_GET['busca']) : null;
$categoriaId = isset($_GET['categoria_id']) && $_GET['categoria_id'] !== ''
    ? (int) $_GET['categoria_id']
    : null;
$pagina     = isset($_GET['pagina']) ? max(1, (int) $_GET['pagina']) : 1;
$porPagina  = isset($_GET['por_pagina']) ? (int) $_GET['por_pagina'] : 8;

try {
    $pdo = getConnection();

    $stmt = $pdo->prepare('CALL sp_listar_produtos(:busca, :categoria_id, :pagina, :por_pagina)');
    $stmt->bindValue(':busca', $busca === '' ? null : $busca, PDO::PARAM_STR);
    $stmt->bindValue(':categoria_id', $categoriaId, $categoriaId === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
    $stmt->bindValue(':pagina', $pagina, PDO::PARAM_INT);
    $stmt->bindValue(':por_pagina', $porPagina, PDO::PARAM_INT);
    $stmt->execute();

    $produtos = $stmt->fetchAll();
    $stmt->closeCursor(); // necessário após CALL antes de nova query na mesma conexão

    // A procedure devolve total_registros repetido em cada linha;
    // extrai uma única vez para montar a paginação (edge case: 0 linhas).
    $totalRegistros = $produtos[0]['total_registros'] ?? 0;
    $totalPaginas   = $totalRegistros > 0 ? (int) ceil($totalRegistros / max(1, $porPagina)) : 0;

    // Remove a coluna auxiliar antes de devolver ao front
    $produtos = array_map(static function (array $p): array {
        unset($p['total_registros']);
        return $p;
    }, $produtos);

    echo json_encode([
        'success' => true,
        'data'    => $produtos,
        'paginacao' => [
            'pagina_atual'    => $pagina,
            'por_pagina'      => $porPagina,
            'total_registros' => (int) $totalRegistros,
            'total_paginas'   => $totalPaginas,
        ],
    ], JSON_UNESCAPED_UNICODE);

} catch (PDOException $e) {
    // Falha de banco/conexão: nunca deixa a API quebrar sem resposta
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Falha ao consultar o banco de dados.',
        'error'   => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}
