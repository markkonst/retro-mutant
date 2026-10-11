import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const webRoot = join(projectRoot, "wwwroot");
const port = Number(process.env.PORT ?? 5173);

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
]);

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl ?? "/", `http://localhost:${port}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const candidate = normalize(join(webRoot, pathname));
  if (!candidate.startsWith(webRoot)) return null;
  return candidate;
}

const server = createServer((request, response) => {
  const path = resolveRequestPath(request.url);
  if (!path || !existsSync(path) || !statSync(path).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": mime.get(extname(path).toLowerCase()) ?? "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  createReadStream(path).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Simpsons Script VM Viewer: http://localhost:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
