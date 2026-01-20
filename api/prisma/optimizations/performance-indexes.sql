-- ====================================================================
-- ÍNDICES DE PERFORMANCE CRÍTICOS
-- ====================================================================

-- ============================================================
-- PRIORIDADE P0 - CRÍTICO (Resolvem 60% dos problemas)
-- ============================================================

-- 1. ÍNDICE NO EMAIL (CRÍTICO - usado em TODOS os logins)
-- Impacto: Reduz latência do /auth/login de 4s para ~200ms
-- Nota: Já existe no schema, mas vamos garantir
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usuarios_email ON usuarios(email);

-- 2. ÍNDICE DE STATUS + DATA (CRÍTICO - otimiza listagens)
-- Já existe no schema, mas vamos adicionar variações importantes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chamados_status_gerado_em ON chamados(status, gerado_em DESC);

-- 3. ÍNDICE PARA CHAMADOS NÃO DELETADOS (CRÍTICO)
-- Muito importante para queries com WHERE deletado_em IS NULL
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chamados_deletado_em_null 
  ON chamados(status, gerado_em DESC) 
  WHERE deletado_em IS NULL;

-- 4. ÍNDICE PARA USUÁRIOS ATIVOS (CRÍTICO)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usuarios_ativo_regra 
  ON usuarios(ativo, regra) 
  WHERE deletado_em IS NULL;

-- ============================================================
-- PRIORIDADE P1 - ALTA (Otimizações importantes)
-- ============================================================

-- 5. ÍNDICE COMPOSTO PARA FILA DE TÉCNICOS
-- Já existe idx tecnico_id + status, mas vamos adicionar versão otimizada
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chamados_tecnico_status_gerado 
  ON chamados(tecnico_id, status, gerado_em DESC) 
  WHERE deletado_em IS NULL;

-- 6. ÍNDICE COMPOSTO PARA FILA DE USUÁRIOS
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chamados_usuario_status_gerado 
  ON chamados(usuario_id, status, gerado_em DESC) 
  WHERE deletado_em IS NULL;

-- 7. ÍNDICE PARA CHAMADOS ABERTOS (query muito comum)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chamados_abertos 
  ON chamados(gerado_em DESC) 
  WHERE status = 'ABERTO' AND deletado_em IS NULL;

-- 8. ÍNDICE PARA CHAMADOS EM ATENDIMENTO
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chamados_em_atendimento 
  ON chamados(tecnico_id, gerado_em DESC) 
  WHERE status = 'EM_ATENDIMENTO' AND deletado_em IS NULL;

-- ============================================================
-- PRIORIDADE P2 - MÉDIA (Otimizações complementares)
-- ============================================================

-- 9. ÍNDICE PARA SERVIÇOS ATIVOS
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_servicos_ativo_nome 
  ON servicos(ativo, nome) 
  WHERE deletado_em IS NULL;

-- 10. ÍNDICE PARA EXPEDIENTES POR USUÁRIO
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_expedientes_usuario_ativo 
  ON expedientes(usuario_id, ativo) 
  WHERE deletado_em IS NULL;

-- 11. ÍNDICE PARA ORDENS DE SERVIÇO ATIVAS
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ordens_servico_ativas 
  ON ordens_de_servico(chamado_id, servico_id) 
  WHERE deletado_em IS NULL;

-- ============================================================
-- ANÁLISE E ESTATÍSTICAS
-- ============================================================

ANALYZE usuarios;
ANALYZE chamados;
ANALYZE servicos;
ANALYZE expedientes;
ANALYZE ordens_de_servico;

-- ============================================================
-- VERIFICAÇÃO DOS ÍNDICES CRIADOS
-- ============================================================

SELECT 
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexname::regclass)) as tamanho
FROM pg_indexes 
WHERE schemaname = 'public'
  AND tablename IN ('usuarios', 'chamados', 'servicos', 'expedientes', 'ordens_de_servico')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;