import http from 'k6/http';
import { check, sleep, group } from 'k6';

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || 'admin@helpme.com';
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'Admin123!';
const USER_EMAIL = __ENV.USER_EMAIL || 'user@helpme.com';
const USER_PASSWORD = __ENV.USER_PASSWORD || 'User123!';
const TECNICO_EMAIL = __ENV.TECNICO_EMAIL || 'tecnico@helpme.com';
const TECNICO_PASSWORD = __ENV.TECNICO_PASSWORD || 'Tecnico123!';
const SERVICO_NOME = __ENV.SERVICO_NOME || 'Serviço Teste K6';
const DEBUG_MODE = __ENV.DEBUG_MODE === 'true';
const SKIP_CHAMADO_CREATION = __ENV.SKIP_CHAMADO_CREATION === 'true';
const MOCK_CHAMADO_ID = __ENV.MOCK_CHAMADO_ID || null;

// ====== CONFIGURAÇÃO DE ROTAS DINÂMICAS ======
const ROUTES_CONFIG = JSON.parse(open('../../../scripts/k6-routes.json'));

// ====== FUNÇÕES AUXILIARES ======
function randomString(length) {
  return Math.random().toString(36).substring(2, 2 + length);
}

function getRouteURL(module, routePath, params = {}) {
  if (typeof routePath === 'undefined') {
    routePath = module;
    module = 'filadechamados';
  }
  
  const moduleConfig = ROUTES_CONFIG.routes[module];
  if (!moduleConfig) {
    console.error(`❌ Módulo de rotas não encontrado: ${module}`);
    return null;
  }
  
  let url = `${BASE_URL}${moduleConfig.basePrefix}${routePath}`;

  Object.entries(params).forEach(([key, value]) => {
    url = url.replace(`:${key}`, value);
  });
  
  return url;
}

function addQueryParams(url, params = {}) {
  const queryString = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  
  return queryString ? `${url}?${queryString}` : url;
}

function getServicoURL(routePath, params = {}) {
  return getRouteURL('servico', routePath, params);
}

function getFilaDeChamadosURL(routePath, params = {}) {
  return getRouteURL('filadechamados', routePath, params);
}

// ====== CONFIGURAÇÃO DE CENÁRIOS ======
export let options = {
  scenarios: {
    // [CENARIO 01] TESTE DE LOGIN E OPERAÇÕES AUTENTICADAS
    OPERACOES_COM_USUARIOS_AUTENTICADOS: {
      executor: 'constant-vus',
      vus: 1,
      duration: '30s',
      exec: 'authenticatedOps',
    },
    // [CENARIO 02] TESTE DE REFRESH TOKEN
    TESTE_DO_REFRESH_TOKEN: {
      executor: 'constant-vus',
      vus: 1,
      duration: '10s',
      exec: 'refreshTokenTest',
      startTime: '35s',
    },
    // [CENARIO 03] TESTE CRUD DE USUÁRIOS
    TESTE_CRUD_DE_USUARIOS: {
      executor: 'constant-vus',
      vus: 1,
      duration: '20s',
      exec: 'userCrudTest',
      startTime: '50s',
    },
  },
};

// ====== CENÁRIO 01: OPERAÇÕES AUTENTICADAS ======
export function authenticatedOps() {
  let adminToken;
  let adminHeaders;
  let userToken;
  let userHeaders;
  let tecnicoToken;
  let tecnicoHeaders;

  // ====== AUTENTICAÇÃO: LOGIN DOS 3 TIPOS DE USUÁRIOS ======
  
  // 1. [ADMIN] PERMISSÃO COMPLETA
  group('Autenticação - Login do Administrador', function () {
    const loginPayload = JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    const loginRes = http.post(`${BASE_URL}/auth/login`, loginPayload, {
      headers: { 'Content-Type': 'application/json' },
    });

    const loginCheck = check(loginRes, {
      'ADMIN - Login bem-sucedido (200)': (r) => r.status === 200,
      'ADMIN - Token de acesso retornado': (r) => r.json('accessToken') !== undefined,
    });

    if (loginCheck) {
      adminToken = loginRes.json('accessToken');
      adminHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      };
    } else {
      console.log(`Login ADMIN falhou: status ${loginRes.status}`);
    }
  });

  // 2. [USUARIO] PERMISSÃO PARA ABRIR E GERENCIAR CHAMADOS
  group('Autenticação - Login do Usuário', function () {
    const loginPayload = JSON.stringify({
      email: USER_EMAIL,
      password: USER_PASSWORD,
    });

    const loginRes = http.post(`${BASE_URL}/auth/login`, loginPayload, {
      headers: { 'Content-Type': 'application/json' },
    });

    const loginCheck = check(loginRes, {
      'USUARIO - Login bem-sucedido (200)': (r) => r.status === 200,
      'USUARIO - Token de acesso retornado': (r) => r.json('accessToken') !== undefined,
    });

    if (loginCheck) {
      userToken = loginRes.json('accessToken');
      userHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      };
    } else {
      console.log(`Login USUARIO falhou: status ${loginRes.status}`);
    }
  });

  // 3. [TECNICO] - ATENDIMENTO E RESOLUÇÃO DE CHAMADOS (OPCIONAL)
  group('Autenticação - Login do Técnico (opcional)', function () {
    const loginPayload = JSON.stringify({
      email: TECNICO_EMAIL,
      password: TECNICO_PASSWORD,
    });

    const loginRes = http.post(`${BASE_URL}/auth/login`, loginPayload, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (loginRes.status === 200) {
      tecnicoToken = loginRes.json('accessToken');
      tecnicoHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tecnicoToken}`,
      };
      console.log('✓ Login TECNICO realizado com sucesso');
    } else {
      console.log(`⚠ Login TECNICO falhou (usuário pode não existir): status ${loginRes.status}`);
      console.log('  Os testes continuarão usando apenas ADMIN e USUARIO');
    }
  });

  // INTERROMPE 0 TESTE CASO NÃO CONSEGUIU LOGINS ESSENCIAIS
  if (!adminToken || !userToken) {
    console.log('❌ Logins essenciais falharam. Abortando testes.');
    return;
  }

  // ====== PERFIL DO USUÁRIO AUTENTICADO ======
  
  group('Autenticação - Obter Perfil do Usuário Logado', function () {
    const meRes = http.get(`${BASE_URL}/auth/me`, { headers: adminHeaders });

    check(meRes, {
      'ADMIN - Perfil obtido com sucesso (200)': (r) => r.status === 200,
      'ADMIN - Perfil contém regra correta (ADMIN)': (r) => r.json('regra') === 'ADMIN',
    });
  });

  // ====== OPERAÇÕES CRUD DE ADMINISTRADORES ======
  
  group('Administração - CRUD de Administradores', function () {
    let adminId = null;

    group('GET /admin - Listar Todos os Administradores', function () {
      let res = http.get(`${BASE_URL}/admin`, { headers: adminHeaders });
      check(res, {
        'ADMIN - Lista de administradores obtida (200)': (r) => r.status === 200,
      });
    });

    group('POST /admin - Criar Novo Administrador', function () {
      const payloadPost = JSON.stringify({
        nome: 'Teste',
        sobrenome: 'Admin',
        email: `teste.${Math.random().toString(36).substring(7)}@exemplo.com`,
        password: 'senha123',
      });

      let res = http.post(`${BASE_URL}/admin`, payloadPost, { headers: adminHeaders });
      check(res, {
        'ADMIN - Novo administrador criado com sucesso (200/201)': (r) => r.status === 200 || r.status === 201,
      });

      if (res.status === 200 || res.status === 201) {
        adminId = JSON.parse(res.body).id;
      }
    });

    if (adminId) {
      group('PUT /admin/:id - Atualizar Dados do Administrador', function () {
        const payloadPut = JSON.stringify({
          nome: 'Teste Atualizado',
          sobrenome: 'Admin',
          email: `teste.atualizado.${Math.random().toString(36).substring(7)}@exemplo.com`,
        });

        let res = http.put(`${BASE_URL}/admin/${adminId}`, payloadPut, { headers: adminHeaders });
        check(res, {
          'ADMIN - Administrador atualizado com sucesso (200)': (r) => r.status === 200,
        });
      });

      group('DELETE /admin/:id - Excluir Administrador', function () {
        let res = http.del(`${BASE_URL}/admin/${adminId}`, null, { headers: adminHeaders });
        check(res, {
          'ADMIN - Administrador excluído com sucesso (200)': (r) => r.status === 200,
        });
      });
    }
  });

  // ====== OPERAÇÕES CRUD DE SERVIÇOS ======
  group('Serviços - CRUD Completo', function () {
    let servicoId = null;
    let servicoIdParaDesativar = null;
    let servicoNomeCriado = null;

    group('GET /servico - Listar Serviços Ativos', function () {
      const url = getServicoURL('/');
      let res = http.get(url, { headers: adminHeaders });
      
      const checkListaServicos = check(res, {
        'ADMIN - Lista de serviços obtida (200)': (r) => r.status === 200,
        'ADMIN - Resposta é um array': (r) => {
          try {
            return Array.isArray(r.json());
          } catch (e) {
            if (DEBUG_MODE) console.log(`[DEBUG] Erro ao parsear JSON: ${e}`);
            return false;
          }
        },
      });

      if (checkListaServicos && res.status === 200) {
        const servicos = JSON.parse(res.body);
        console.log(`✓ [ADMIN] Encontrados ${servicos.length} serviços ativos`);
      }
    });

    group('GET /servico?incluirInativos=true - Listar Todos os Serviços', function () {
      const url = addQueryParams(getServicoURL('/'), { incluirInativos: 'true' });
      let res = http.get(url, { headers: adminHeaders });
      
      const checkListaTodos = check(res, {
        'ADMIN - Lista completa de serviços obtida (200)': (r) => r.status === 200,
        'ADMIN - Resposta é um array': (r) => {
          try {
            return Array.isArray(r.json());
          } catch (e) {
            return false;
          }
        },
      });

      if (checkListaTodos && res.status === 200) {
        const servicos = JSON.parse(res.body);
        const ativos = servicos.filter(s => s.ativo === true).length;
        const inativos = servicos.filter(s => s.ativo === false).length;
        console.log(`✓ [ADMIN] Total: ${servicos.length} serviços (${ativos} ativos, ${inativos} inativos)`);
      }
    });

    group('POST /servico - Criar Novo Serviço', function () {
      const timestamp = Math.random().toString(36).substring(7);
      servicoNomeCriado = `Serviço Teste K6 ${timestamp}`;
      const payloadPost = JSON.stringify({
        nome: servicoNomeCriado,
        descricao: `Serviço criado durante teste de carga - ${new Date().toISOString()}`,
      });

      if (DEBUG_MODE) {
        console.log(`[DEBUG] Payload: ${payloadPost}`);
      }

      const url = getServicoURL('/');
      let res = http.post(url, payloadPost, { headers: adminHeaders });
      
      const checkCriar = check(res, {
        'ADMIN - Novo serviço criado com sucesso (201)': (r) => r.status === 201,
        'ADMIN - Serviço retorna ID': (r) => {
          try {
            return r.json('id') !== undefined;
          } catch (e) {
            return false;
          }
        },
        'ADMIN - Serviço está ativo por padrão': (r) => {
          try {
            return r.json('ativo') === true;
          } catch (e) {
            return false;
          }
        },
      });

      if (checkCriar && (res.status === 200 || res.status === 201)) {
        const servico = JSON.parse(res.body);
        servicoId = servico.id;
        console.log(`✓ [ADMIN] Serviço criado: ID=${servicoId}, Nome="${servico.nome}"`);
      } else {
        console.log(`✗ [ADMIN] Falha ao criar serviço: ${res.status} - ${res.body}`);
      }
    });

    group('POST /servico - Validação de Nome Duplicado', function () {
      if (!servicoId || !servicoNomeCriado) {
        console.log('⏭️  Pulando teste de duplicação (serviço não foi criado)');
        return;
      }

      const payloadDuplicado = JSON.stringify({
        nome: servicoNomeCriado,
        descricao: 'Tentativa de criar serviço duplicado',
      });

      const url = getServicoURL('/');
      let res = http.post(url, payloadDuplicado, { headers: adminHeaders });
      
      check(res, {
        'ADMIN - Rejeita nome duplicado (409)': (r) => r.status === 409,
        'ADMIN - Mensagem de erro presente': (r) => {
          try {
            return r.json('error') !== undefined;
          } catch (e) {
            return false;
          }
        },
      });
      
      if (res.status !== 409) {
        console.log(`✗ [ADMIN] Esperado 409, recebido ${res.status} - ${res.body}`);
      }
    });

    group('POST /servico - Validação de Campos Obrigatórios', function () {
      const payloadSemNome = JSON.stringify({
        descricao: 'Serviço sem nome',
      });

      const url = getServicoURL('/');
      let res = http.post(url, payloadSemNome, { headers: adminHeaders });
      
      check(res, {
        'ADMIN - Rejeita serviço sem nome (400)': (r) => r.status === 400,
        'ADMIN - Mensagem de erro sobre nome obrigatório': (r) => {
          try {
            const error = r.json('error');
            return error && error.includes('obrigatório');
          } catch (e) {
            return false;
          }
        },
      });

      const payloadNomeVazio = JSON.stringify({
        nome: '   ',
        descricao: 'Nome com apenas espaços',
      });

      let res2 = http.post(url, payloadNomeVazio, { headers: adminHeaders });
      
      check(res2, {
        'ADMIN - Rejeita nome vazio/espaços (400)': (r) => r.status === 400,
      });
    });

    if (servicoId) {
      group('GET /servico/:id - Buscar Serviço por ID', function () {
        const url = getServicoURL('/:id', { id: servicoId });
        let res = http.get(url, { headers: adminHeaders });
        
        const checkBuscar = check(res, {
          'ADMIN - Serviço encontrado por ID (200)': (r) => r.status === 200,
          'ADMIN - ID corresponde ao buscado': (r) => {
            try {
              return r.json('id') === servicoId;
            } catch (e) {
              return false;
            }
          },
        });

        if (checkBuscar) {
          const servico = JSON.parse(res.body);
          console.log(`✓ [ADMIN] Serviço encontrado: "${servico.nome}"`);
        }
      });

      group('GET /servico/:id - Validação de ID Inexistente', function () {
        const idInexistente = '00000000-0000-0000-0000-000000000000';
        const url = getServicoURL('/:id', { id: idInexistente });
        let res = http.get(url, { headers: adminHeaders });
        
        check(res, {
          'ADMIN - Retorna 404 para ID inexistente': (r) => r.status === 404,
          'ADMIN - Mensagem de erro presente': (r) => {
            try {
              return r.json('error') !== undefined;
            } catch (e) {
              return false;
            }
          },
        });
      });
    }

    if (servicoId) {
      group('PUT /servico/:id - Atualizar Serviço', function () {
        const payloadPut = JSON.stringify({
          nome: `Serviço Atualizado ${Math.random().toString(36).substring(7)}`,
          descricao: 'Descrição atualizada durante teste de carga',
        });

        const url = getServicoURL('/:id', { id: servicoId });
        let res = http.put(url, payloadPut, { headers: adminHeaders });
        
        const checkAtualizar = check(res, {
          'ADMIN - Serviço atualizado com sucesso (200)': (r) => r.status === 200,
          'ADMIN - Retorna dados atualizados': (r) => {
            try {
              return r.json('nome') !== undefined;
            } catch (e) {
              return false;
            }
          },
        });

        if (checkAtualizar) {
          const servico = JSON.parse(res.body);
          console.log(`✓ [ADMIN] Serviço atualizado: "${servico.nome}"`);
        } else {
          console.log(`✗ [ADMIN] Falha ao atualizar: ${res.status} - ${res.body}`);
        }
      });

      group('PUT /servico/:id - Atualização Parcial', function () {
        const payloadParcial = JSON.stringify({
          descricao: 'Nova descrição (atualização parcial)',
        });

        const url = getServicoURL('/:id', { id: servicoId });
        let res = http.put(url, payloadParcial, { headers: adminHeaders });
        
        check(res, {
          'ADMIN - Aceita atualização parcial (200)': (r) => r.status === 200,
        });
      });
    }

    group('POST /servico - Criar Serviço para Desativação', function () {
      const payloadPost = JSON.stringify({
        nome: `Serviço Para Desativar ${Math.random().toString(36).substring(7)}`,
        descricao: 'Serviço que será desativado nos testes',
      });

      const url = getServicoURL('/');
      let res = http.post(url, payloadPost, { headers: adminHeaders });
      
      if (res.status === 201) {
        servicoIdParaDesativar = JSON.parse(res.body).id;
        console.log(`✓ [ADMIN] Serviço criado para desativação: ID=${servicoIdParaDesativar}`);
      }
    });

    if (servicoIdParaDesativar) {
      group('DELETE /servico/:id/desativar - Desativar Serviço', function () {
        const url = getServicoURL('/:id/desativar', { id: servicoIdParaDesativar });
        let res = http.del(url, null, { headers: adminHeaders });
        
        const checkDesativar = check(res, {
          'ADMIN - Serviço desativado com sucesso (200)': (r) => r.status === 200,
          'ADMIN - Mensagem de confirmação': (r) => {
            try {
              return r.json('message') !== undefined;
            } catch (e) {
              return false;
            }
          },
        });

        if (checkDesativar) {
          console.log(`✓ [ADMIN] Serviço desativado com sucesso`);
        }
      });

      group('DELETE /servico/:id/desativar - Validação de Serviço Já Desativado', function () {
        const url = getServicoURL('/:id/desativar', { id: servicoIdParaDesativar });
        let res = http.del(url, null, { headers: adminHeaders });
        
        check(res, {
          'ADMIN - Rejeita desativação de serviço já desativado (400)': (r) => r.status === 400,
          'ADMIN - Mensagem indica que já está desativado': (r) => {
            try {
              const error = r.json('error');
              return error && error.includes('já está desativado');
            } catch (e) {
              return false;
            }
          },
        });
      });

      group('PATCH /servico/:id/reativar - Reativar Serviço', function () {
        const url = getServicoURL('/:id/reativar', { id: servicoIdParaDesativar });
        let res = http.patch(url, null, { headers: adminHeaders });
        
        const checkReativar = check(res, {
          'ADMIN - Serviço reativado com sucesso (200)': (r) => r.status === 200,
          'ADMIN - Serviço está ativo': (r) => {
            try {
              return r.json('servico.ativo') === true;
            } catch (e) {
              return false;
            }
          },
        });

        if (checkReativar) {
          console.log(`✓ [ADMIN] Serviço reativado com sucesso`);
        }
      });

      group('PATCH /servico/:id/reativar - Validação de Serviço Já Ativo', function () {
        const url = getServicoURL('/:id/reativar', { id: servicoIdParaDesativar });
        let res = http.patch(url, null, { headers: adminHeaders });
        
        check(res, {
          'ADMIN - Rejeita reativação de serviço já ativo (400)': (r) => r.status === 400,
          'ADMIN - Mensagem indica que já está ativo': (r) => {
            try {
              const error = r.json('error');
              return error && error.includes('já está ativo');
            } catch (e) {
              return false;
            }
          },
        });
      });
    }

    if (servicoId) {
      group('DELETE /servico/:id/excluir - Excluir Serviço Permanentemente', function () {
        const url = getServicoURL('/:id/excluir', { id: servicoId });
        let res = http.del(url, null, { headers: adminHeaders });
        
        const checkExcluir = check(res, {
          'ADMIN - Serviço excluído permanentemente (200)': (r) => r.status === 200,
          'ADMIN - Mensagem de confirmação': (r) => {
            try {
              const msg = r.json('message');
              return msg && msg.includes('permanentemente');
            } catch (e) {
              return false;
            }
          },
        });

        if (checkExcluir) {
          console.log(`✓ [ADMIN] Serviço excluído permanentemente do banco de dados`);
        } else {
          console.log(`✗ [ADMIN] Falha ao excluir: ${res.status} - ${res.body}`);
        }
      });

      group('GET /servico/:id - Verificar Exclusão Permanente', function () {
        const url = getServicoURL('/:id', { id: servicoId });
        let res = http.get(url, { headers: adminHeaders });
        
        check(res, {
          'ADMIN - Serviço não existe mais (404)': (r) => r.status === 404,
        });
      });
    }

    group('Serviços - Testes de Autorização (USUARIO)', function () {
      group('GET /servico - USUARIO Pode Listar Serviços', function () {
        const url = getServicoURL('/');
        let res = http.get(url, { headers: userHeaders });
        
        check(res, {
          'USUARIO - Pode listar serviços (200)': (r) => r.status === 200,
        });
      });

      group('POST /servico - USUARIO Não Pode Criar Serviços', function () {
        const payload = JSON.stringify({
          nome: 'Teste Sem Permissão',
          descricao: 'Tentativa de criar serviço sem permissão',
        });

        const url = getServicoURL('/');
        let res = http.post(url, payload, { headers: userHeaders });
        
        check(res, {
          'USUARIO - Acesso negado ao criar serviço (403)': (r) => r.status === 403,
        });
      });

      if (servicoIdParaDesativar) {
        group('PUT /servico/:id - USUARIO Não Pode Atualizar Serviços', function () {
          const payload = JSON.stringify({
            nome: 'Tentativa de Atualização',
          });

          const url = getServicoURL('/:id', { id: servicoIdParaDesativar });
          let res = http.put(url, payload, { headers: userHeaders });
          
          check(res, {
            'USUARIO - Acesso negado ao atualizar serviço (403)': (r) => r.status === 403,
          });
        });

        group('DELETE /servico/:id/desativar - USUARIO Não Pode Desativar', function () {
          const url = getServicoURL('/:id/desativar', { id: servicoIdParaDesativar });
          let res = http.del(url, null, { headers: userHeaders });
          
          check(res, {
            'USUARIO - Acesso negado ao desativar serviço (403)': (r) => r.status === 403,
          });
        });

        group('DELETE /servico/:id/excluir - USUARIO Não Pode Excluir', function () {
          const url = getServicoURL('/:id/excluir', { id: servicoIdParaDesativar });
          let res = http.del(url, null, { headers: userHeaders });
          
          check(res, {
            'USUARIO - Acesso negado ao excluir serviço (403)': (r) => r.status === 403,
          });
        });
      }
    });

    if (servicoIdParaDesativar) {
      group('Limpeza - Excluir Serviço Remanescente', function () {
        const url = getServicoURL('/:id/excluir', { id: servicoIdParaDesativar });
        let res = http.del(url, null, { headers: adminHeaders });
        if (res.status === 200) {
          console.log(`✓ [CLEANUP] Serviço de teste removido`);
        }
      });
    }
  });

  // ====== DESCOBRIR SERVIÇOS DISPONÍVEIS ======
  
  let servicoNome = SERVICO_NOME;

  if (!servicoNome) {
    group('Serviços - Buscar Serviço Ativo para Testes', function () {
      const url = getServicoURL('/');
      const servicosRes = http.get(url, { headers: adminHeaders });
      
      if (servicosRes.status === 200) {
        try {
          const servicos = JSON.parse(servicosRes.body);
          
          if (Array.isArray(servicos) && servicos.length > 0) {
            const servicoAtivo = servicos.find(s => s.ativo === true || s.ativo === undefined);
            if (servicoAtivo) {
              servicoNome = servicoAtivo.nome;
              console.log(`✓ Serviço encontrado: "${servicoNome}"`);
            }
          }
        } catch (e) {
          console.log(`⚠ Erro ao processar resposta: ${e}`);
        }
      }

      if (!servicoNome) {
        console.log('⚠ Não foi possível encontrar serviços ativos');
        console.log('💡 Dica: Configure a variável de ambiente SERVICO_NOME com o nome de um serviço válido');
      }
    });
  } else {
    console.log(`✓ Usando serviço da variável de ambiente: "${servicoNome}"`);
  }

  // ====== FLUXO COMPLETO DE GERENCIAMENTO DE CHAMADOS ======
  
  group('Chamados - Ciclo de Vida Completo', function () {
    let chamadoId = MOCK_CHAMADO_ID;

    if (!SKIP_CHAMADO_CREATION) {
      group('POST chamado/abertura-chamado - Usuário Abre Novo Chamado', function () {
        if (!servicoNome) {
          console.log('⚠ [USUARIO] Pulando criação de chamado - nenhum serviço disponível');
          return;
        }

        const payloadChamado = JSON.stringify({
          descricao: `Teste de chamado - ${Math.random().toString(36).substring(7)} - ${new Date().toISOString()}`,
          servico: servicoNome,
        });

        if (DEBUG_MODE) {
          console.log(`[DEBUG] Payload do chamado: ${payloadChamado}`);
          console.log(`[DEBUG] Headers: ${JSON.stringify(userHeaders)}`);
        }

        let res = http.post(`${BASE_URL}/chamado/abertura-chamado`, payloadChamado, { headers: userHeaders });
        
        if (DEBUG_MODE) {
          console.log(`[DEBUG] Status: ${res.status}`);
          console.log(`[DEBUG] Response body: ${res.body}`);
        }
        
        if (res.status === 201) {
          chamadoId = JSON.parse(res.body).id;
          const chamadoNumero = JSON.parse(res.body).numero || 'N/A';
          console.log(`✓ [USUARIO] Chamado criado: ID=${chamadoId}, Número=${chamadoNumero}`);
          check(res, {
            'USUARIO - Chamado criado com sucesso (201)': (r) => r.status === 201,
          });
        } else {
          console.log(`✗ [USUARIO] Falha ao criar chamado: status ${res.status}, body: ${res.body}`);
          
          if (res.status === 500) {
            console.log('💡 Dica: O erro 500 persiste mesmo sem concorrência.');
            console.log('   Verifique o código da API que gera o número INC0001');
          }
          
          check(res, {
            'USUARIO - Falha esperada ao criar chamado': (r) => r.status === 201,
          });
        }
      });
    } else {
      console.log('⏭️  Pulando criação de chamados (SKIP_CHAMADO_CREATION=true)');
    }

    if (chamadoId) {
      group('GET /chamado/:id - Consultar Histórico de Atualizações', function () {
        let res = http.get(`${BASE_URL}/chamado/${chamadoId}/historico`, { headers: userHeaders });
        check(res, {
          'Histórico do chamado obtido com sucesso (200)': (r) => r.status === 200,
        });
      });

      group('PATCH /chamado/:id/status - Iniciar Atendimento do Chamado', function () {
        const payloadStatus = JSON.stringify({
          status: 'EM_ATENDIMENTO',
          atualizacaoDescricao: 'Técnico iniciou atendimento',
        });

        if (tecnicoHeaders) {
          let resTecnico = http.patch(`${BASE_URL}/chamado/${chamadoId}/status`, payloadStatus, { headers: tecnicoHeaders });
          
          if (resTecnico.status === 200) {
            console.log(`✓ [TECNICO] Status atualizado para EM_ATENDIMENTO`);
            check(resTecnico, {
              'TECNICO - Chamado colocado em atendimento (200)': (r) => r.status === 200,
            });
          } else if (resTecnico.status === 403) {
            console.log(`⚠ [TECNICO] Status 403 - tentando com ADMIN...`);
            
            let resAdmin = http.patch(`${BASE_URL}/chamado/${chamadoId}/status`, payloadStatus, { headers: adminHeaders });
            check(resAdmin, {
              'ADMIN - Chamado colocado em atendimento via fallback (200)': (r) => r.status === 200,
            });
            
            if (resAdmin.status === 200) {
              console.log(`✓ [ADMIN] Status atualizado para EM_ATENDIMENTO (fallback)`);
            }
          }
        } else {
          let res = http.patch(`${BASE_URL}/chamado/${chamadoId}/status`, payloadStatus, { headers: adminHeaders });
          check(res, {
            'ADMIN - Chamado colocado em atendimento (200)': (r) => r.status === 200,
          });
        }
      });

      group('PATCH /chamado/:id/status - Encerrar Chamado Resolvido', function () {
        const payloadEncerrar = JSON.stringify({
          status: 'ENCERRADO',
          descricaoEncerramento: 'Chamado resolvido com sucesso',
          atualizacaoDescricao: 'Problema solucionado',
        });

        let res = http.patch(`${BASE_URL}/chamado/${chamadoId}/status`, payloadEncerrar, { headers: adminHeaders });
        const checkEncerrar = check(res, {
          'ADMIN - Chamado encerrado com sucesso (200)': (r) => r.status === 200,
        });
        
        if (!checkEncerrar) {
          console.log(`✗ [ADMIN] Falha ao encerrar: ${res.status} - ${res.body}`);
        } else {
          console.log(`✓ [ADMIN] Chamado encerrado com sucesso`);
        }
      });

      group('PATCH /chamado/:id/reabrir-chamado - Usuário Reabre Chamado', function () {
        const payloadReabrir = JSON.stringify({
          atualizacaoDescricao: 'Problema não foi resolvido',
        });

        let res = http.patch(`${BASE_URL}/chamado/${chamadoId}/reabrir-chamado`, payloadReabrir, { headers: userHeaders });
        const checkReabrir = check(res, {
          'USUARIO - Chamado reaberto com sucesso (200)': (r) => r.status === 200,
        });
        
        if (!checkReabrir) {
          console.log(`✗ [USUARIO] Falha ao reabrir: ${res.status} - ${res.body}`);
        } else {
          console.log(`✓ [USUARIO] Chamado reaberto com sucesso`);
        }
      });

      group('PATCH /chamado/:id/cancelar-chamado - Cancelar Chamado', function () {
        const payloadCancelar = JSON.stringify({
          descricaoEncerramento: 'Chamado cancelado por teste',
        });

        let res = http.patch(`${BASE_URL}/chamado/${chamadoId}/cancelar-chamado`, payloadCancelar, { headers: userHeaders });
        const checkCancelar = check(res, {
          'USUARIO - Chamado cancelado com sucesso (200)': (r) => r.status === 200,
        });
        
        if (!checkCancelar) {
          console.log(`✗ [USUARIO] Falha ao cancelar: ${res.status} - ${res.body}`);
        } else {
          console.log(`✓ [USUARIO] Chamado cancelado com sucesso`);
        }
      });

      group('DELETE /chamado/:id/excluir-chamado - Excluir Chamado Permanentemente', function () {
        let res = http.del(`${BASE_URL}/chamado/${chamadoId}/excluir-chamado`, null, { headers: adminHeaders });
        const checkExcluir = check(res, {
          'ADMIN - Chamado excluído permanentemente (200)': (r) => r.status === 200,
        });
        
        if (!checkExcluir) {
          console.log(`✗ [ADMIN] Falha ao excluir: ${res.status} - ${res.body}`);
        } else {
          console.log(`✓ [ADMIN] Chamado excluído com sucesso`);
        }
      });
    }
  });

  // ====== ROTAS DE LISTAGEM DE CHAMADOS ======
  
  group('Chamados - Rotas de Listagem', function () {
    group('GET /filadechamados/meus-chamados - Listar Meus Chamados', function () {
      const url = getFilaDeChamadosURL('/meus-chamados');
      let res = http.get(url, { headers: userHeaders });
      
      if (DEBUG_MODE) {
        console.log(`[DEBUG] ${url} - Status: ${res.status}`);
        console.log(`[DEBUG] ${url} - Body: ${res.body.substring(0, 200)}`);
      }
      
      const checkMeusChamados = check(res, {
        'USUARIO - Meus chamados listados com sucesso (200)': (r) => r.status === 200,
        'USUARIO - Resposta é um array': (r) => {
          try {
            return Array.isArray(r.json());
          } catch (e) {
            if (DEBUG_MODE) console.log(`[DEBUG] Erro ao parsear JSON: ${e}`);
            return false;
          }
        },
      });
      
      if (checkMeusChamados) {
        const chamados = JSON.parse(res.body);
        console.log(`✓ [USUARIO] Encontrados ${chamados.length} chamados próprios`);
      }
    });

    if (tecnicoHeaders) {
      group('GET /filadechamados/chamados-atribuidos - Listar Chamados Atribuídos ao Técnico', function () {
        const url = getFilaDeChamadosURL('/chamados-atribuidos');
        let res = http.get(url, { headers: tecnicoHeaders });
        
        if (DEBUG_MODE) {
          console.log(`[DEBUG] ${url} - Status: ${res.status}`);
          console.log(`[DEBUG] ${url} - Body: ${res.body.substring(0, 200)}`);
        }
        
        const checkAtribuidos = check(res, {
          'TECNICO - Chamados atribuídos listados com sucesso (200)': (r) => r.status === 200,
          'TECNICO - Resposta é um array': (r) => {
            try {
              return Array.isArray(r.json());
            } catch (e) {
              if (DEBUG_MODE) console.log(`[DEBUG] Erro ao parsear JSON: ${e}`);
              return false;
            }
          },
        });
        
        if (checkAtribuidos) {
          const chamados = JSON.parse(res.body);
          console.log(`✓ [TECNICO] Encontrados ${chamados.length} chamados atribuídos`);
        }
      });
    }

    group('GET /filadechamados/todos-chamados?status= - Listar Chamados por Status (ADMIN)', function () {
      const statusList = ['ABERTO', 'EM_ATENDIMENTO', 'ENCERRADO', 'CANCELADO', 'REABERTO'];
      
      for (let status of statusList) {
        const url = addQueryParams(getFilaDeChamadosURL('/todos-chamados'), { status });
        let res = http.get(url, { headers: adminHeaders });
        
        if (status === 'ABERTO' && DEBUG_MODE) {
          console.log(`[DEBUG] ${url} - Status HTTP: ${res.status}`);
          console.log(`[DEBUG] ${url} - Body: ${res.body.substring(0, 200)}`);
        }
        
        check(res, {
          [`ADMIN - Chamados ${status} listados com sucesso (200)`]: (r) => r.status === 200,
          [`ADMIN - Resposta ${status} é um array`]: (r) => {
            try {
              return Array.isArray(r.json());
            } catch (e) {
              if (status === 'ABERTO' && DEBUG_MODE) {
                console.log(`[DEBUG] Erro ao parsear JSON para ${status}: ${e}`);
              }
              return false;
            }
          },
        });
        
        if (res.status === 200) {
          try {
            const chamados = JSON.parse(res.body);
            console.log(`✓ [ADMIN] Status ${status}: ${chamados.length} chamados`);
          } catch (e) {
            console.log(`✗ [ADMIN] Erro ao parsear resposta de ${status}`);
          }
        }
      }
    });

    group('GET /filadechamados/todos-chamados - Testes de Validação', function () {
      const urlSemStatus = getFilaDeChamadosURL('/todos-chamados');
      let resSemStatus = http.get(urlSemStatus, { headers: adminHeaders });
      
      if (DEBUG_MODE) {
        console.log(`[DEBUG] ${urlSemStatus} - Status HTTP: ${resSemStatus.status}`);
        console.log(`[DEBUG] ${urlSemStatus} - Body: ${resSemStatus.body}`);
      }
      
      check(resSemStatus, {
        'ADMIN - Retorna erro 400 sem parâmetro status': (r) => r.status === 400,
        'ADMIN - Mensagem de erro presente': (r) => {
          try {
            return r.json('error') !== undefined;
          } catch (e) {
            if (DEBUG_MODE) console.log(`[DEBUG] Erro ao verificar mensagem de erro: ${e}`);
            return false;
          }
        },
      });

      const urlStatusInvalido = addQueryParams(getFilaDeChamadosURL('/todos-chamados'), { status: 'INVALIDO' });
      let resStatusInvalido = http.get(urlStatusInvalido, { headers: adminHeaders });
      
      if (DEBUG_MODE) {
        console.log(`[DEBUG] ${urlStatusInvalido} - Status HTTP: ${resStatusInvalido.status}`);
        console.log(`[DEBUG] ${urlStatusInvalido} - Body: ${resStatusInvalido.body}`);
      }
      
      check(resStatusInvalido, {
        'ADMIN - Status inválido retorna erro 400': (r) => r.status === 400,
        'ADMIN - Mensagem de erro sobre status inválido': (r) => {
          try {
            return r.json('error') !== undefined;
          } catch (e) {
            return false;
          }
        },
      });
    });

    group('GET /filadechamados/abertos - Listar Chamados Abertos', function () {
      const urlAbertos = getFilaDeChamadosURL('/abertos');
      let resAdmin = http.get(urlAbertos, { headers: adminHeaders });
      
      if (DEBUG_MODE) {
        console.log(`[DEBUG] ${urlAbertos} (ADMIN) - Status: ${resAdmin.status}`);
        console.log(`[DEBUG] ${urlAbertos} (ADMIN) - Body: ${resAdmin.body.substring(0, 200)}`);
      }
      
      const checkAdmin = check(resAdmin, {
        'ADMIN - Chamados abertos listados com sucesso (200)': (r) => r.status === 200,
        'ADMIN - Resposta é um array': (r) => {
          try {
            return Array.isArray(r.json());
          } catch (e) {
            if (DEBUG_MODE) console.log(`[DEBUG] Erro ao parsear JSON (ADMIN): ${e}`);
            return false;
          }
        },
      });
      
      if (checkAdmin) {
        const chamados = JSON.parse(resAdmin.body);
        console.log(`✓ [ADMIN] Encontrados ${chamados.length} chamados abertos/reabertos`);
      }

      if (tecnicoHeaders) {
        let resTecnico = http.get(urlAbertos, { headers: tecnicoHeaders });
        
        if (DEBUG_MODE) {
          console.log(`[DEBUG] ${urlAbertos} (TECNICO) - Status: ${resTecnico.status}`);
        }
        
        const checkTecnico = check(resTecnico, {
          'TECNICO - Chamados abertos listados com sucesso (200)': (r) => r.status === 200,
          'TECNICO - Resposta é um array': (r) => {
            try {
              return Array.isArray(r.json());
            } catch (e) {
              if (DEBUG_MODE) console.log(`[DEBUG] Erro ao parsear JSON (TECNICO): ${e}`);
              return false;
            }
          },
        });
        
        if (checkTecnico) {
          const chamados = JSON.parse(resTecnico.body);
          console.log(`✓ [TECNICO] Encontrados ${chamados.length} chamados abertos/reabertos`);
        }
      }
    });

    group('Testes de Autorização - Permissões Negadas', function () {
      const urlTodosChamados = addQueryParams(getFilaDeChamadosURL('/todos-chamados'), { status: 'ABERTO' });
      let res1 = http.get(urlTodosChamados, { headers: userHeaders });
      check(res1, {
        'USUARIO - Acesso negado a /todos-chamados (403)': (r) => r.status === 403,
      });

      const urlAbertos = getFilaDeChamadosURL('/abertos');
      let res2 = http.get(urlAbertos, { headers: userHeaders });
      check(res2, {
        'USUARIO - Acesso negado a /abertos (403)': (r) => r.status === 403,
      });

      const urlAtribuidos = getFilaDeChamadosURL('/chamados-atribuidos');
      let res3 = http.get(urlAtribuidos, { headers: userHeaders });
      check(res3, {
        'USUARIO - Acesso negado a /chamados-atribuidos (403)': (r) => r.status === 403,
      });
    });
  });

  sleep(1);
}

// ====== CENÁRIO 02: TESTE DE REFRESH TOKEN ======

export function refreshTokenTest() {
  let token;
  let refreshToken;
  let adminHeaders;

  group('Autenticação - Renovação de Token e Logout', function () {
    // 1. FAZ SEU PRÓPRIO LOGIN
    const loginPayload = JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    const loginRes = http.post(`${BASE_URL}/auth/login`, loginPayload, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (loginRes.status !== 200) {
      console.log(`❌ Login falhou no teste de refresh: ${loginRes.status}`);
      return;
    }

    const loginCheck = check(loginRes, {
      'Refresh Test - Login bem-sucedido (200)': (r) => r.status === 200,
      'Refresh Test - Access token retornado': (r) => r.json('accessToken') !== undefined,
      'Refresh Test - Refresh token retornado': (r) => r.json('refreshToken') !== undefined,
    });

    if (!loginCheck) {
      console.log('❌ Falha ao obter tokens no teste de refresh');
      return;
    }

    refreshToken = loginRes.json('refreshToken');
    token = loginRes.json('accessToken');

    if (!refreshToken) {
      console.log('❌ RefreshToken não encontrado na resposta');
      return;
    }

    console.log('✓ Tokens obtidos com sucesso para teste de refresh');

    // 2. AGUARDA ANTES DE RENOVAR
    sleep(1);

    // 3. RENOVA OS TOKENS
    const refreshPayload = JSON.stringify({ refreshToken });
    const refreshRes = http.post(`${BASE_URL}/auth/refresh-token`, refreshPayload, {
      headers: { 'Content-Type': 'application/json' },
    });

    const refreshCheck = check(refreshRes, {
      'Refresh - Tokens renovados com sucesso (200)': (r) => r.status === 200,
      'Refresh - Novo access token retornado': (r) => r.json('accessToken') !== undefined,
      'Refresh - Novo refresh token retornado': (r) => r.json('refreshToken') !== undefined,
    });

    if (!refreshCheck) {
      console.log(`❌ Falha no refresh: ${refreshRes.status} - ${refreshRes.body}`);
      return;
    }

    console.log('✓ Tokens renovados com sucesso');

    // 4. TESTA LOGOUT COM O NOVO TOKEN
    if (refreshRes.status === 200) {
      const newToken = refreshRes.json('accessToken');
      
      const logoutHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${newToken}`,
      };

      const logoutRes = http.post(`${BASE_URL}/auth/logout`, null, { headers: logoutHeaders });
      
      const logoutCheck = check(logoutRes, {
        'Logout - Sessão encerrada com sucesso (200)': (r) => r.status === 200,
      });

      if (logoutCheck) {
        console.log('✓ Logout realizado com sucesso');
      } else {
        console.log(`❌ Falha no logout: ${logoutRes.status} - ${logoutRes.body}`);
      }
    }
  });

  sleep(1);
}

// ====== CENÁRIO 03: CRUD DE USUÁRIOS ======

export function userCrudTest() {
  let adminHeaders;
  let userHeaders;
  let usuarioId = null;
  let usuarioEmail = null;
  let usuarioIdParaExcluir = null;

  // LOGIN DO ADMIN
  group('Login ADMIN para CRUD Usuários', function () {
    const payload = JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    const res = http.post(`${BASE_URL}/auth/login`, payload, {
      headers: { 'Content-Type': 'application/json' },
    });

    check(res, {
      'Login ADMIN OK (200)': (r) => r.status === 200,
    });

    if (res.status === 200) {
      const token = res.json('accessToken');
      adminHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };
    } else {
      console.log('❌ Falha no login ADMIN - abortando testes de usuário');
      return;
    }
  });

  // LOGIN DO USUARIO
  group('Login USUARIO para testes de permissão', function () {
    const payload = JSON.stringify({
      email: USER_EMAIL,
      password: USER_PASSWORD,
    });

    const res = http.post(`${BASE_URL}/auth/login`, payload, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (res.status === 200) {
      const token = res.json('accessToken');
      userHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };
    }
  });

  // CRUD DE USUÁRIOS
  group('Usuários - CRUD Completo', function () {
    group('GET /usuario - Listar Todos os Usuários', function () {
      const url = `${BASE_URL}/usuario`;
      let res = http.get(url, { headers: adminHeaders });
      
      const checkListaUsuarios = check(res, {
        'ADMIN - Lista de usuários obtida (200)': (r) => r.status === 200,
        'ADMIN - Resposta é um array': (r) => {
          try {
            return Array.isArray(r.json());
          } catch (e) {
            if (DEBUG_MODE) console.log(`[DEBUG] Erro ao parsear JSON: ${e}`);
            return false;
          }
        },
      });

      if (checkListaUsuarios && res.status === 200) {
        const usuarios = JSON.parse(res.body);
        console.log(`✓ [ADMIN] Encontrados ${usuarios.length} usuários cadastrados`);
      }
    });

    group('POST /usuario - Criar Novo Usuário', function () {
      const timestamp = randomString(6);
      usuarioEmail = `usuario.teste.${timestamp}@exemplo.com`;
      
      const payloadPost = JSON.stringify({
        nome: 'Teste',
        sobrenome: 'Usuario K6',
        email: usuarioEmail,
        password: 'SenhaSegura123!',
        telefone: '(11) 98765-4321',
        ramal: '1234',
       setor: 'RECURSOS_HUMANOS',
      });

      if (DEBUG_MODE) {
        console.log(`[DEBUG] Payload: ${payloadPost}`);
      }

      const url = `${BASE_URL}/usuario`;
      let res = http.post(url, payloadPost, { headers: adminHeaders });
      
      const checkCriar = check(res, {
        'ADMIN - Novo usuário criado com sucesso (201)': (r) => r.status === 201,
        'ADMIN - Usuário retorna ID': (r) => {
          try {
            return r.json('id') !== undefined;
          } catch (e) {
            return false;
          }
        },
        'ADMIN - Usuário tem regra USUARIO': (r) => {
          try {
            return r.json('regra') === 'USUARIO';
          } catch (e) {
            return false;
          }
        },
      });

      if (checkCriar && res.status === 201) {
        const usuario = JSON.parse(res.body);
        usuarioId = usuario.id;
        console.log(`✓ [ADMIN] Usuário criado: ID=${usuarioId}, Email="${usuario.email}"`);
      } else {
        console.log(`✗ [ADMIN] Falha ao criar usuário: ${res.status} - ${res.body}`);
      }
    });

    group('POST /usuario - Validação de Email Duplicado', function () {
      if (!usuarioId || !usuarioEmail) {
        console.log('⏭️  Pulando teste de duplicação (usuário não foi criado)');
        return;
      }

      const payloadDuplicado = JSON.stringify({
        nome: 'Outro',
        sobrenome: 'Usuario',
        email: usuarioEmail,
        password: 'OutraSenha123!',
       setor: 'RECURSOS_HUMANOS',
      });

      const url = `${BASE_URL}/usuario`;
      let res = http.post(url, payloadDuplicado, { headers: adminHeaders });
      
      check(res, {
        'ADMIN - Rejeita email duplicado (400)': (r) => r.status === 400,
        'ADMIN - Mensagem de erro presente': (r) => {
          try {
            return r.json('error') !== undefined;
          } catch (e) {
            return false;
          }
        },
      });
      
      if (res.status !== 400) {
        console.log(`✗ [ADMIN] Esperado 400, recebido ${res.status} - ${res.body}`);
      }
    });

    group('POST /usuario - Validação de Campos Obrigatórios', function () {
      const payloadSemSenha = JSON.stringify({
        nome: 'Teste',
        sobrenome: 'Sem Senha',
        email: `sem.senha.${randomString(6)}@exemplo.com`,
        setor: 'RECURSOS_HUMANOS',
      });

      const url = `${BASE_URL}/usuario`;
      let res1 = http.post(url, payloadSemSenha, { headers: adminHeaders });
      
      check(res1, {
        'ADMIN - Rejeita usuário sem senha (400)': (r) => r.status === 400,
        'ADMIN - Mensagem sobre senha obrigatória': (r) => {
          try {
            const error = r.json('error');
            return error && error.toLowerCase().includes('senha');
          } catch (e) {
            return false;
          }
        },
      });

      const payloadSemEmail = JSON.stringify({
        nome: 'Teste',
        sobrenome: 'Sem Email',
        password: 'Senha123!',
        setor: 'RECURSOS_HUMANOS',
      });

      let res2 = http.post(url, payloadSemEmail, { headers: adminHeaders });
      
      check(res2, {
        'ADMIN - Rejeita usuário sem email (400)': (r) => r.status === 400,
      });

      const payloadSemNome = JSON.stringify({
        sobrenome: 'Sem Nome',
        email: `sem.nome.${randomString(6)}@exemplo.com`,
        password: 'Senha123!',
        setor: 'RECURSOS_HUMANOS',
      });

      let res3 = http.post(url, payloadSemNome, { headers: adminHeaders });
      
      check(res3, {
        'ADMIN - Rejeita usuário sem nome (400)': (r) => r.status === 400,
      });
    });

    if (usuarioEmail) {
      group('POST /usuario/email - Buscar Usuário por Email', function () {
        const payloadBusca = JSON.stringify({
          email: usuarioEmail,
        });

        const url = `${BASE_URL}/usuario/email`;
        let res = http.post(url, payloadBusca, { headers: adminHeaders });
        
        const checkBuscar = check(res, {
          'ADMIN - Usuário encontrado por email (200)': (r) => r.status === 200,
          'ADMIN - Email corresponde ao buscado': (r) => {
            try {
              return r.json('email') === usuarioEmail;
            } catch (e) {
              return false;
            }
          },
          'ADMIN - Retorna dados completos': (r) => {
            try {
              const data = r.json();
              return data.id && data.nome && data.sobrenome && data.setor;
            } catch (e) {
              return false;
            }
          },
        });

        if (checkBuscar) {
          const usuario = JSON.parse(res.body);
          console.log(`✓ [ADMIN] Usuário encontrado: "${usuario.nome} ${usuario.sobrenome}"`);
        }
      });

      group('POST /usuario/email - Validação de Email Obrigatório', function () {
        const payloadVazio = JSON.stringify({});

        const url = `${BASE_URL}/usuario/email`;
        let res = http.post(url, payloadVazio, { headers: adminHeaders });
        
        check(res, {
          'ADMIN - Rejeita busca sem email (400)': (r) => r.status === 400,
          'ADMIN - Mensagem sobre email obrigatório': (r) => {
            try {
              const error = r.json('error');
              return error && error.toLowerCase().includes('obrigatório');
            } catch (e) {
              return false;
            }
          },
        });
      });

      group('POST /usuario/email - Validação de Email Inexistente', function () {
        const payloadInexistente = JSON.stringify({
          email: 'nao.existe.12345@exemplo.com',
        });

        const url = `${BASE_URL}/usuario/email`;
        let res = http.post(url, payloadInexistente, { headers: adminHeaders });
        
        check(res, {
          'ADMIN - Retorna 404 para email inexistente': (r) => r.status === 404,
          'ADMIN - Mensagem de erro presente': (r) => {
            try {
              return r.json('error') !== undefined;
            } catch (e) {
              return false;
            }
          },
        });
      });
    }

    if (usuarioId) {
      group('PUT /usuario/:id - Atualizar Dados do Usuário', function () {
        const payloadPut = JSON.stringify({
          nome: 'Teste Atualizado',
          sobrenome: 'Usuario K6 Modificado',
          telefone: '(11) 91234-5678',
          ramal: '5678',
          setor: 'FINANCEIRO',
        });

        const url = `${BASE_URL}/usuario/${usuarioId}`;
        let res = http.put(url, payloadPut, { headers: adminHeaders });
        
        const checkAtualizar = check(res, {
          'ADMIN - Usuário atualizado com sucesso (200)': (r) => r.status === 200,
          'ADMIN - Retorna dados atualizados': (r) => {
            try {
              return r.json('nome') === 'Teste Atualizado';
            } catch (e) {
              return false;
            }
          },
        });

        if (checkAtualizar) {
          const usuario = JSON.parse(res.body);
          console.log(`✓ [ADMIN] Usuário atualizado: "${usuario.nome} ${usuario.sobrenome}"`);
        } else {
          console.log(`✗ [ADMIN] Falha ao atualizar: ${res.status} - ${res.body}`);
        }
      });

      group('PUT /usuario/:id - Atualização Parcial', function () {
        const payloadParcial = JSON.stringify({
          telefone: '(11) 99999-8888',
        });

        const url = `${BASE_URL}/usuario/${usuarioId}`;
        let res = http.put(url, payloadParcial, { headers: adminHeaders });
        
        check(res, {
          'ADMIN - Aceita atualização parcial (200)': (r) => r.status === 200,
        });
      });

      group('PUT /usuario/:id - Validação de ID Inexistente', function () {
        const idInexistente = '00000000-0000-0000-0000-000000000000';
        const payload = JSON.stringify({
          nome: 'Teste',
        });

        const url = `${BASE_URL}/usuario/${idInexistente}`;
        let res = http.put(url, payload, { headers: adminHeaders });
        
        check(res, {
          'ADMIN - Retorna erro para ID inexistente (400)': (r) => r.status === 400,
        });
      });
    }

    if (usuarioId) {
      group('PUT /usuario/:id/senha - Alterar Senha do Usuário', function () {
        const payloadSenha = JSON.stringify({
          password: 'NovaSenhaSegura123!',
        });

        const url = `${BASE_URL}/usuario/${usuarioId}/senha`;
        let res = http.put(url, payloadSenha, { headers: adminHeaders });
        
        const checkSenha = check(res, {
          'ADMIN - Senha alterada com sucesso (200)': (r) => r.status === 200,
          'ADMIN - Mensagem de confirmação': (r) => {
            try {
              const msg = r.json('message');
              return msg && msg.toLowerCase().includes('senha');
            } catch (e) {
              return false;
            }
          },
        });

        if (checkSenha) {
          console.log(`✓ [ADMIN] Senha do usuário alterada com sucesso`);
        }
      });

      group('PUT /usuario/:id/senha - Validação de Senha Obrigatória', function () {
        const payloadVazio = JSON.stringify({});

        const url = `${BASE_URL}/usuario/${usuarioId}/senha`;
        let res = http.put(url, payloadVazio, { headers: adminHeaders });
        
        check(res, {
          'ADMIN - Rejeita alteração sem senha (400)': (r) => r.status === 400,
          'ADMIN - Mensagem sobre senha obrigatória': (r) => {
            try {
              const error = r.json('error');
              return error && error.toLowerCase().includes('obrigatória');
            } catch (e) {
              return false;
            }
          },
        });
      });
    }

    if (usuarioId) {
      group('POST /usuario/:id/avatar - Info sobre Upload de Avatar', function () {
        console.log(`ℹ️  [INFO] Endpoint de avatar disponível em: /usuario/${usuarioId}/avatar`);
        console.log(`ℹ️  [INFO] Testes de upload de arquivo devem ser feitos manualmente ou com ferramentas específicas`);
      });
    }

    group('POST /usuario - Criar Usuário para Exclusão', function () {
      const timestamp = randomString(6);
      const payloadPost = JSON.stringify({
        nome: 'Usuario',
        sobrenome: 'Para Excluir',
        email: `usuario.excluir.${timestamp}@exemplo.com`,
        password: 'SenhaParaExcluir123!',
        setor: 'RECURSOS_HUMANOS',
      });

      const url = `${BASE_URL}/usuario`;
      let res = http.post(url, payloadPost, { headers: adminHeaders });
      
      if (res.status === 201) {
        usuarioIdParaExcluir = JSON.parse(res.body).id;
        console.log(`✓ [ADMIN] Usuário criado para exclusão: ID=${usuarioIdParaExcluir}`);
      }
    });

    if (usuarioIdParaExcluir) {
      group('DELETE /usuario/:id - Excluir Usuário Permanentemente', function () {
        const url = `${BASE_URL}/usuario/${usuarioIdParaExcluir}`;
        let res = http.del(url, null, { headers: adminHeaders });
        
        const checkExcluir = check(res, {
          'ADMIN - Usuário excluído com sucesso (200)': (r) => r.status === 200,
          'ADMIN - Mensagem de confirmação': (r) => {
            try {
              const msg = r.json('message');
              return msg && msg.includes('excluídos');
            } catch (e) {
              return false;
            }
          },
        });

        if (checkExcluir) {
          console.log(`✓ [ADMIN] Usuário e chamados associados excluídos com sucesso`);
        } else {
          console.log(`✗ [ADMIN] Falha ao excluir: ${res.status} - ${res.body}`);
        }
      });

      group('DELETE /usuario/:id - Validação de Usuário Já Excluído', function () {
        const url = `${BASE_URL}/usuario/${usuarioIdParaExcluir}`;
        let res = http.del(url, null, { headers: adminHeaders });
        
        check(res, {
          'ADMIN - Retorna erro ao excluir usuário inexistente (400)': (r) => r.status === 400,
        });
      });
    }

    group('Usuários - Testes de Autorização (USUARIO)', function () {
      if (!userHeaders) {
        console.log('⏭️  Pulando testes de autorização (usuário não logado)');
        return;
      }

      group('GET /usuario - USUARIO Não Pode Listar Usuários', function () {
        const url = `${BASE_URL}/usuario`;
        let res = http.get(url, { headers: userHeaders });
        
        check(res, {
          'USUARIO - Acesso negado ao listar usuários (403)': (r) => r.status === 403,
        });
      });

      group('POST /usuario - USUARIO Não Pode Criar Usuários', function () {
        const payload = JSON.stringify({
          nome: 'Teste',
          sobrenome: 'Sem Permissao',
          email: `sem.permissao.${randomString(6)}@exemplo.com`,
          password: 'Senha123!',
          setor: 'RECURSOS_HUMANOS',
        });

        const url = `${BASE_URL}/usuario`;
        let res = http.post(url, payload, { headers: userHeaders });
        
        check(res, {
          'USUARIO - Acesso negado ao criar usuário (403)': (r) => r.status === 403,
        });
      });

      group('POST /usuario/email - USUARIO Não Pode Buscar Usuários', function () {
        const payload = JSON.stringify({
          email: ADMIN_EMAIL,
        });

        const url = `${BASE_URL}/usuario/email`;
        let res = http.post(url, payload, { headers: userHeaders });
        
        check(res, {
          'USUARIO - Acesso negado ao buscar por email (403)': (r) => r.status === 403,
        });
      });

      if (usuarioId) {
        group('Permissões USUARIO - Editar Próprios Dados', function () {
          console.log(`ℹ️  [INFO] USUARIO pode editar seus próprios dados (autorizado por authorizeRoles)`);
          console.log(`ℹ️  [INFO] Validação completa requer autenticação como o usuário específico`);
        });
      }
    });

    if (usuarioId) {
      group('Limpeza - Excluir Usuário de Teste', function () {
        const url = `${BASE_URL}/usuario/${usuarioId}`;
        let res = http.del(url, null, { headers: adminHeaders });
        if (res.status === 200) {
          console.log(`✓ [CLEANUP] Usuário de teste removido`);
        }
      });
    }
  });

  // TESTES DE CACHE REDIS
  group('Usuários - Validação de Cache (Redis)', function () {
    group('GET /usuario - Primeira Chamada (Miss de Cache)', function () {
      const url = `${BASE_URL}/usuario`;
      const inicio = Date.now();
      let res = http.get(url, { headers: adminHeaders });
      const duracao = Date.now() - inicio;
      
      check(res, {
        'Cache - Primeira chamada bem-sucedida (200)': (r) => r.status === 200,
      });
      
      console.log(`✓ [CACHE] Primeira chamada: ${duracao}ms (cache miss esperado)`);
    });

    group('GET /usuario - Segunda Chamada (Hit de Cache)', function () {
      const url = `${BASE_URL}/usuario`;
      const inicio = Date.now();
      let res = http.get(url, { headers: adminHeaders });
      const duracao = Date.now() - inicio;
      
      check(res, {
        'Cache - Segunda chamada bem-sucedida (200)': (r) => r.status === 200,
      });
      
      console.log(`✓ [CACHE] Segunda chamada: ${duracao}ms (cache hit esperado - mais rápido)`);
    });
  });

  sleep(1);
}