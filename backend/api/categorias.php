<?php
/**
 * GET /backend/api/categorias.php
 * Lista simples de categorias, usada para:
 *   - popular o <select> de filtro na aba Loja
 *   - popular o <select> do formulário de Novo/Editar produto
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf8mb4');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/../config/db.php';

try {
    $pdo = getConnection();

    $categorias = $pdo->query('SELECT id, nome, descricao FROM categorias ORDER BY nome')->fetchAll();

    echo json_encode([
        'success' => true,
        'data'    => $categorias,
    ], JSON_UNESCAPED_UNICODE);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Falha ao consultar categorias.',
        'error'   => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}
