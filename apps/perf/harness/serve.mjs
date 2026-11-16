// Tiny static server for harness/dist. Used by scripts/run.mjs, or run it yourself:
//   node harness/serve.mjs            (default port 8099)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "dist");
const types = { ".html": "text/html", ".js": "text/javascript" };

export function serveHarness(port = Number(process.env.HARNESS_PORT || 8099), host = process.env.HARNESS_HOST || "0.0.0.0") {
  const server = http.createServer((req, res) => {
    const name = req.url.split("?")[0] === "/" ? "index.html" : path.basename(req.url.split("?")[0]);
    const file = path.join(dist, name);
    if (!fs.existsSync(file)) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await serveHarness();
  console.log(`harness at http://127.0.0.1:${process.env.HARNESS_PORT || 8099}/`);
}
