import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const roots = {
  public: resolve(root, "public"),
  src: resolve(root, "src"),
  examples: resolve(root, "examples")
};
const port = Number.parseInt(process.env.PORT ?? "4174", 10);
const host = process.env.HOST ?? "127.0.0.1";
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function resolveRequest(pathname) {
  if (pathname === "/") {
    return resolve(roots.public, "index.html");
  }
  const segments = pathname.slice(1).split("/");
  const namedRoot = roots[segments[0]];
  const base = namedRoot ?? roots.public;
  const relative = namedRoot ? segments.slice(1).join("/") : segments.join("/");
  const candidate = resolve(base, `.${sep}${relative}`);
  return candidate.startsWith(`${base}${sep}`) ? candidate : undefined;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? host}`);
    const file = resolveRequest(decodeURIComponent(url.pathname));
    if (!file) {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      response.end("Invalid path");
      return;
    }
    const body = await readFile(file);
    response.writeHead(200, {
      "content-type": types[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store"
    });
    response.end(body);
  } catch (error) {
    const status = error && typeof error === "object" && error.code === "ENOENT" ? 404 : 500;
    response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
    response.end(status === 404 ? "Not found" : "Server error");
  }
});

server.listen(port, host, () => {
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  console.log(`Edgecase Theatre listening at http://${host}:${actualPort}`);
});

function shutdown() {
  server.close((error) => {
    process.exitCode = error ? 1 : 0;
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
