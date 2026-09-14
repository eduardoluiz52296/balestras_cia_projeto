<?php
/**
 * POST /backend/api/produto_excluir.php
 * Body: { "id": number }
 *
 * Executa uma EXCLUSÃO LÓGICA (sp_produto_excluir -> ativo = 0):
 * o produto some do catálogo e da vw_estoque_saude, mas o
 * histórico de vendas antigas continua íntegro (a FK vendas.produto_id
 * nunca fica órfã). A regra é sempre a mesma e sempre explicada
 * de volta ao usuário na mensagem de resposta.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf8mb4');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../config/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Método não permitido. Use POST.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$corpo = json_decode(file_get_contents('php://input'), true);
$id    = isset($corpo['id']) ? (int) $corpo['id'] : 0;

if ($id <= 0) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Informe um id de produto válido.'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = getConnection();

    // Confirma que o produto existe e está ativo antes de excluir
    $busca = $pdo->prepare('SELECT nome, ativo FROM produtos WHERE id = :id');
    $busca->execute([':id' => $id]);
    $produto = $busca->fetch();

    if (!$produto) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Produto não encontrado.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ((int) $produto['ativo'] === 0) {
        // Edge case: já estava excluído — não é erro, só avisa.
        echo json_encode([
            'success' => true,
            'message' => "O produto \"{$produto['nome']}\" já estava removido do catálogo.",
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $stmt = $pdo->prepare('CALL sp_produto_excluir(:id)');
    $stmt->execute([':id' => $id]);
    $stmt->closeCursor();

    echo json_encode([
        'success' => true,
        'message' => "Produto \"{$produto['nome']}\" removido do catálogo (exclusão lógica: o histórico de vendas é preservado).",
    ], JSON_UNESCAPED_UNICODE);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Falha ao excluir o produto.',
        'error'   => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}
