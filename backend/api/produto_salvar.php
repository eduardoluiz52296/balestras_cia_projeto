<?php
/**
 * POST /backend/api/produto_salvar.php
 *
 * Recebe um JSON no corpo da requisição:
 *   { id?: number, nome, categoria_id, preco_unitario, estoque, imagem?, descricao? }
 *
 * - Sem "id" (ou id vazio/0)  -> CREATE  (sp_produto_criar)
 * - Com "id" válido           -> UPDATE  (sp_produto_atualizar)
 *
 * Esta rota concentra as validações de negócio da API (nome
 * obrigatório, preço/estoque não podem ser negativos nem
 * inválidos, categoria precisa existir) ANTES de chamar a
 * procedure — o trigger BEFORE UPDATE no banco é a última linha
 * de defesa, não a única.
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

function respondErro(string $mensagem, int $status = 422): void
{
    http_response_code($status);
    echo json_encode(['success' => false, 'message' => $mensagem], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respondErro('Método não permitido. Use POST.', 405);
}

$corpo = json_decode(file_get_contents('php://input'), true);

// Edge case: corpo ausente/JSON inválido
if (!is_array($corpo)) {
    respondErro('Corpo da requisição inválido (esperado JSON).', 400);
}

$id           = isset($corpo['id']) ? (int) $corpo['id'] : 0;
$nome         = trim((string) ($corpo['nome'] ?? ''));
$categoriaId  = (int) ($corpo['categoria_id'] ?? 0);
$preco        = $corpo['preco_unitario'] ?? null;
$estoque      = $corpo['estoque'] ?? null;
$imagem       = trim((string) ($corpo['imagem'] ?? '')) ?: null;
$descricao    = trim((string) ($corpo['descricao'] ?? ''));

// ---------- Validações de negócio (edge cases claros para o usuário) ----------
$erros = [];

if ($nome === '' || mb_strlen($nome) < 3) {
    $erros[] = 'O nome do produto precisa ter pelo menos 3 caracteres.';
}
if ($categoriaId <= 0) {
    $erros[] = 'Selecione uma categoria válida.';
}
if (!is_numeric($preco) || (float) $preco <= 0) {
    $erros[] = 'O preço precisa ser um número maior que zero.';
}
if (!is_numeric($estoque) || (int) $estoque < 0) {
    $erros[] = 'O estoque precisa ser um número inteiro maior ou igual a zero.';
}

if (!empty($erros)) {
    respondErro(implode(' ', $erros));
}

$preco   = round((float) $preco, 2);
$estoque = (int) $estoque;

try {
    $pdo = getConnection();

    // Confere se a categoria realmente existe (evita FK quebrada)
    $checaCategoria = $pdo->prepare('SELECT COUNT(*) FROM categorias WHERE id = :id');
    $checaCategoria->execute([':id' => $categoriaId]);
    if ((int) $checaCategoria->fetchColumn() === 0) {
        respondErro('Categoria informada não existe.');
    }

    if ($id > 0) {
        // ---------- UPDATE ----------
        $stmt = $pdo->prepare(
            'CALL sp_produto_atualizar(:id, :nome, :categoria_id, :preco, :estoque, :imagem, :descricao)'
        );
        $stmt->execute([
            ':id'           => $id,
            ':nome'         => $nome,
            ':categoria_id' => $categoriaId,
            ':preco'        => $preco,
            ':estoque'      => $estoque,
            ':imagem'       => $imagem,
            ':descricao'    => $descricao,
        ]);
        $stmt->closeCursor();

        echo json_encode([
            'success' => true,
            'message' => "Produto \"{$nome}\" atualizado com sucesso.",
            'data'    => ['id' => $id],
        ], JSON_UNESCAPED_UNICODE);

    } else {
        // ---------- CREATE ----------
        // OUT param via variável de sessão do MySQL/MariaDB (padrão PDO)
        $pdo->prepare(
            'CALL sp_produto_criar(:nome, :categoria_id, :preco, :estoque, :imagem, :descricao, @novo_id)'
        )->execute([
            ':nome'         => $nome,
            ':categoria_id' => $categoriaId,
            ':preco'        => $preco,
            ':estoque'      => $estoque,
            ':imagem'       => $imagem,
            ':descricao'    => $descricao,
        ]);

        $novoId = (int) $pdo->query('SELECT @novo_id')->fetchColumn();

        echo json_encode([
            'success' => true,
            'message' => "Produto \"{$nome}\" cadastrado com sucesso.",
            'data'    => ['id' => $novoId],
        ], JSON_UNESCAPED_UNICODE);
    }

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Falha ao salvar o produto no banco de dados.',
        'error'   => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}
