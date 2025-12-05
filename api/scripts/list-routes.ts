import fs from "fs";
import path from "path";

const ROUTES_DIR = path.join(process.cwd(), "src/routes");

const routeRegex = /(router|app)\.(get|post|put|delete|patch|options|head)\(['"`]([^'"`]*)['"`]/gi;

function scanFile(filePath: string) {
  const content = fs.readFileSync(filePath, "utf8");

  const matches = [...content.matchAll(routeRegex)];

  return matches.map(match => ({
    method: match[2].toUpperCase(),
    path: match[3],
    file: path.basename(filePath)
  }));
}

function scanRoutes() {
  const results: any[] = [];

  const files = fs
    .readdirSync(ROUTES_DIR)
    .filter(f => f.endsWith(".ts") || f.endsWith(".js"));

  for (const file of files) {
    const fullPath = path.join(ROUTES_DIR, file);
    const routes = scanFile(fullPath);

    if (routes.length > 0) {
      console.log(`\n[INFO] Arquivo: ${file}`);
      routes.forEach(r =>
        console.log(`${r.method.padEnd(7)} ${r.path}`)
      );
    }

    results.push(...routes);
  }

  return results;
}

console.log("[INFO] Listando rotas da pasta:", ROUTES_DIR);

scanRoutes();
