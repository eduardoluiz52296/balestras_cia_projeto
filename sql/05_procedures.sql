-- ============================================================
-- Stored Procedures
-- Objetivo: tirar da API PHP a responsabilidade de montar SQL
-- dinâmico. A API só chama a procedure com parâmetros; toda a
-- lógica de busca por nome, filtro por categoria e paginação
-- fica centralizada e otimizada aqui no banco.
-- ============================================================

USE balestras_cia;

DELIMITER $$

-- ------------------------------------------------------------
-- sp_listar_produtos
-- Lista produtos ativos com:
--   - busca textual (nome do produto, case-insensitive, parcial)
--   - filtro opcional por categoria
--   - paginação (p_pagina começa em 1)
--   - status de estoque via fn_classificar_estoque() (reuso)
--   - total_registros embutido em cada linha (COUNT(*) OVER())
--     para a API/JS montar a paginação sem 2ª consulta.
-- Chamada pela API de forma assíncrona (fetch + async/await no
-- front, mysqli/PDO no PHP) a cada busca/filtro/troca de página,
-- sem travar a interface.
-- ------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_listar_produtos$$
CREATE PROCEDURE sp_listar_produtos(
    IN p_busca        VARCHAR(120),
    IN p_categoria_id INT,
    IN p_pagina       INT,
    IN p_por_pagina   INT
)
BEGIN
    DECLARE v_offset INT;

    -- Defesas contra parâmetros inválidos (edge cases)
    IF p_pagina IS NULL OR p_pagina < 1 THEN
        SET p_pagina = 1;
    END IF;

    IF p_por_pagina IS NULL OR p_por_pagina < 1 OR p_por_pagina > 50 THEN
        SET p_por_pagina = 8;
    END IF;

    SET v_offset = (p_pagina - 1) * p_por_pagina;

    SELECT
        p.id,
        p.nome,
        p.categoria_id,
        c.nome                              AS categoria,
        p.preco_unitario,
        p.estoque,
        p.imagem,
        p.descricao,
        fn_classificar_estoque(p.estoque)   AS status_estoque,
        COUNT(*) OVER()                     AS total_registros
    FROM produtos p
    INNER JOIN categorias c ON c.id = p.categoria_id
    WHERE p.ativo = 1
      AND (p_busca IS NULL OR p_busca = '' OR p.nome LIKE CONCAT('%', p_busca, '%'))
      AND (p_categoria_id IS NULL OR p_categoria_id = 0 OR p.categoria_id = p_categoria_id)
    ORDER BY c.nome, p.nome
    LIMIT p_por_pagina OFFSET v_offset;
END$$


-- ------------------------------------------------------------
-- sp_produto_criar
-- Insere um novo produto (parte "Create" do CRUD) e devolve o id
-- gerado via parâmetro OUT.
-- ------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_produto_criar$$
CREATE PROCEDURE sp_produto_criar(
    IN  p_nome           VARCHAR(120),
    IN  p_categoria_id   INT,
    IN  p_preco_unitario DECIMAL(10,2),
    IN  p_estoque        INT,
    IN  p_imagem         VARCHAR(255),
    IN  p_descricao      TEXT,
    OUT p_novo_id        INT
)
BEGIN
    INSERT INTO produtos (nome, categoria_id, preco_unitario, estoque, imagem, descricao, ativo)
    VALUES (p_nome, p_categoria_id, ABS(p_preco_unitario), ABS(p_estoque), p_imagem, p_descricao, 1);

    SET p_novo_id = LAST_INSERT_ID();
END$$


-- ------------------------------------------------------------
-- sp_produto_atualizar
-- Atualiza um produto existente (parte "Update" do CRUD).
-- O trigger trg_produtos_before_update ainda garante, na camada
-- de banco, que preço/estoque nunca fiquem negativos mesmo que
-- algo escape da validação da procedure/PHP.
-- ------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_produto_atualizar$$
CREATE PROCEDURE sp_produto_atualizar(
    IN p_id              INT,
    IN p_nome            VARCHAR(120),
    IN p_categoria_id    INT,
    IN p_preco_unitario  DECIMAL(10,2),
    IN p_estoque         INT,
    IN p_imagem          VARCHAR(255),
    IN p_descricao       TEXT
)
BEGIN
    UPDATE produtos
       SET nome           = p_nome,
           categoria_id   = p_categoria_id,
           preco_unitario = ABS(p_preco_unitario),
           estoque        = ABS(p_estoque),
           imagem         = p_imagem,
           descricao      = p_descricao
     WHERE id = p_id;
END$$


-- ------------------------------------------------------------
-- sp_produto_excluir
-- Exclusão lógica (parte "Delete" do CRUD): NUNCA apaga a linha
-- de verdade (isso quebraria o histórico em "vendas", que referencia
-- produto_id). Em vez disso, marca ativo = 0. A partir daí:
--   - some do catálogo (WHERE ativo = 1 em sp_listar_produtos/produtos.php)
--   - some da vw_estoque_saude (mesma cláusula)
--   - continua existindo para as vendas antigas não perderem o vínculo
-- ------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_produto_excluir$$
CREATE PROCEDURE sp_produto_excluir(
    IN p_id INT
)
BEGIN
    UPDATE produtos SET ativo = 0 WHERE id = p_id;
END$$

DELIMITER ;

-- ------------------------------------------------------------
-- Testes rápidos (opcional, rode manualmente no phpMyAdmin):
--
--   CALL sp_listar_produtos(NULL, NULL, 1, 8);          -- página 1, sem filtro
--   CALL sp_listar_produtos('balestra', NULL, 1, 8);    -- busca por nome
--   CALL sp_listar_produtos(NULL, 1, 1, 8);              -- só categoria 1
--
--   CALL sp_produto_criar('Facão de Mata', 3, 129.90, 15, NULL, 'Teste', @novo_id);
--   SELECT @novo_id;
--
--   CALL sp_produto_atualizar(@novo_id, 'Facão de Mata Pro', 3, 149.90, 10, NULL, 'Editado');
--   CALL sp_produto_excluir(@novo_id);
--   SELECT ativo FROM produtos WHERE id = @novo_id;      -- 0
-- ------------------------------------------------------------
