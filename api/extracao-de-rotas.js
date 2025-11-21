const fs = require('fs');
const path = require('path');

/**
 * Extrai rotas de um arquivo TypeScript/JavaScript Express
 * @param {string} filePath - Caminho para o arquivo de rotas
 * @returns {Object} Objeto com as rotas encontradas
 */
function extractRoutes(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const routes = {};

  // Regex para capturar router.get, router.post, router.patch, router.delete, etc.
  const routeRegex = /router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  
  let match;
  while ((match = routeRegex.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const path = match[2];
    
    // Encontrar o comentário acima da rota (se existir)
    const beforeRoute = content.substring(0, match.index);
    const lines = beforeRoute.split('\n');
    let description = '';
    
    // Procurar por comentários nas últimas linhas antes da rota
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 10); i--) {
      const line = lines[i].trim();
      if (line.startsWith('*') && !line.startsWith('*/')) {
        description = line.replace(/^\*\s*/, '').trim();
        break;
      }
      // Também captura comentários de linha única
      if (line.startsWith('//')) {
        description = line.replace(/^\/\/\s*/, '').trim();
        break;
      }
    }
    
    // Criar uma chave única para a rota
    const routeKey = path.replace(/\//g, '_').replace(/:/g, '');
    if (!routes[routeKey]) {
      routes[routeKey] = {
        method,
        path,
        description: description || `${method} ${path}`
      };
    }
  }

  return routes;
}

/**
 * Gera arquivo de configuração JSON para o K6
 */
function generateRoutesConfig() {
  // Lista de arquivos de rotas para processar
  const routeFiles = [
    {
      name: 'filadechamados',
      file: 'fila-de-chamados.routes.ts',
      prefix: '/filadechamados'
    },
    {
      name: 'servico',
      file: 'servico.routes.ts',
      prefix: '/servico'
    },
    {
      name: 'tecnico',
      file: 'tecnico.routes.ts',
      prefix: '/tecnico'
    },
    {
      name: 'usuario',
      file: 'usuario.routes.ts',
      prefix: '/usuario'
    }
  ];

  const config = {
    generatedAt: new Date().toISOString(),
    routes: {}
  };

  let totalRoutes = 0;

  // Processar cada arquivo de rotas
  for (const routeFile of routeFiles) {
    const routesFilePath = path.join(__dirname, 'src', 'routes', routeFile.file);
    
    if (!fs.existsSync(routesFilePath)) {
      console.log(`⚠️  Arquivo não encontrado: ${routesFilePath} (pulando...)`);
      continue;
    }

    console.log(`📂 Lendo rotas de: ${routesFilePath}`);
    
    const routes = extractRoutes(routesFilePath);
    
    config.routes[routeFile.name] = {
      basePrefix: routeFile.prefix,
      routes: routes
    };

    const routeCount = Object.keys(routes).length;
    totalRoutes += routeCount;

    // Mostrar as rotas encontradas
    console.log(`\n📋 Rotas extraídas de ${routeFile.name}:`);
    Object.entries(routes).forEach(([key, route]) => {
      console.log(`  ${route.method.padEnd(6)} ${routeFile.prefix}${route.path}`);
    });
  }

  const outputPath = path.join(__dirname, 'k6-routes.json');
  fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));
  
  console.log(`\n✅ Configuração de rotas gerada: ${outputPath}`);
  console.log(`📊 Total de rotas encontradas: ${totalRoutes}`);

  return config;
}

// Executar se for chamado diretamente
if (require.main === module) {
  generateRoutesConfig();
}

module.exports = { extractRoutes, generateRoutesConfig };