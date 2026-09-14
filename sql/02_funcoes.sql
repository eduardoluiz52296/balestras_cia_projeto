-- ============================================================
-- Funções reutilizáveis do banco (MariaDB)
-- Objetivo: concentrar regras de negócio simples em UMA função,
-- para que qualquer View, Stored Procedure ou consulta futura use
-- sempre a MESMA lógica (evita duplicar CASE/IF em vários lugares).
-- ============================================================

USE balestras_cia;

DELIMITER $$

-- ------------------------------------------------------------
-- fn_classificar_estoque
-- Recebe a quantidade em estoque e devolve um rótulo padronizado:
--   <= 5   -> 'CRITICO'
--   <= 15  -> 'ATENCAO'
--   > 15   -> 'OK'
-- Reutilizada em:
--   - vw_estoque_saude          (sql/02_views_ctes.sql)
--   - sp_listar_produtos        (sql/05_procedures.sql)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS fn_classificar_estoque$$
CREATE FUNCTION fn_classificar_estoque(p_estoque INT)
RETURNS VARCHAR(10)
DETERMINISTIC
BEGIN
    DECLARE v_status VARCHAR(10);

    IF p_estoque <= 5 THEN
        SET v_status = 'CRITICO';
    ELSEIF p_estoque <= 15 THEN
        SET v_status = 'ATENCAO';
    ELSE
        SET v_status = 'OK';
    END IF;

    RETURN v_status;
END$$

-- ------------------------------------------------------------
-- fn_preco_formatado
-- Recebe um DECIMAL e devolve string já formatada em padrão
-- monetário brasileiro simples (000.000,00), útil para relatórios
-- gerados direto em SQL (ex.: exportações), reaproveitando a
-- mesma regra de formatação em qualquer consulta futura.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS fn_preco_formatado$$
CREATE FUNCTION fn_preco_formatado(p_valor DECIMAL(10,2))
RETURNS VARCHAR(30)
DETERMINISTIC
BEGIN
    RETURN CONCAT('R$ ', FORMAT(p_valor, 2, 'de_DE'));
END$$

DELIMITER ;

-- ------------------------------------------------------------
-- Teste rápido (opcional):
--   SELECT fn_classificar_estoque(3);   -- CRITICO
--   SELECT fn_classificar_estoque(10);  -- ATENCAO
--   SELECT fn_classificar_estoque(50);  -- OK
--   SELECT fn_preco_formatado(1899.9);  -- R$ 1.899,90
-- ------------------------------------------------------------
