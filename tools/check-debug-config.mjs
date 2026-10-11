import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const launchPath = join(root, ".vscode", "launch.json");
const mainMapPath = join(root, "wwwroot", "js", "main.js.map");

function fail(message) {
  console.error(`DEBUG CONFIG ERROR: ${message}`);
  process.exit(1);
}

if (!existsSync(launchPath)) fail(".vscode/launch.json is missing");
const launch = JSON.parse(readFileSync(launchPath, "utf8"));
const configs = Array.isArray(launch.configurations) ? launch.configurations : [];
for (const type of ["edge", "chrome"]) {
  const cfg = configs.find((item) => item?.type === type);
  if (!cfg) fail(`missing ${type} browser launch configuration`);
  if (cfg.url !== "http://localhost:5173") fail(`${type} URL must be http://localhost:5173`);
  if (cfg.webRoot !== "${workspaceFolder}\\wwwroot") fail(`${type} webRoot must point at wwwroot`);
}

if (!existsSync(mainMapPath)) fail("wwwroot/js/main.js.map is missing; run npm run build");
const map = JSON.parse(readFileSync(mainMapPath, "utf8"));
if (!Array.isArray(map.sources) || map.sources.length === 0) fail("main.js.map has no TypeScript sources");
if (!Array.isArray(map.sourcesContent) || map.sourcesContent.length === 0) fail("main.js.map has no inlineSources");

const mapDir = dirname(mainMapPath);
const resolvedSources = map.sources.map((source) => normalize(resolve(mapDir, source)));
const expected = normalize(join(root, "src", "main.ts"));
if (!resolvedSources.includes(expected)) {
  fail(`main.js.map does not resolve to src/main.ts (resolved: ${resolvedSources.join(", ")})`);
}

console.log("Visual Studio browser debug configuration OK");
console.log("  Edge/Chrome URL : http://localhost:5173");
console.log("  webRoot         : wwwroot");
console.log("  source map      : wwwroot/js/main.js.map -> src/main.ts");
console.log("Select 'Simpsons Viewer (Edge)' in Visual Studio and press F5.");
