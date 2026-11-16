// Bundles harness.src.js (+ socket.io-client + mediasoup-client) into dist/harness.js
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(path.join(here, "dist"), { recursive: true });
await build({
  entryPoints: [path.join(here, "harness.src.js")],
  outfile: path.join(here, "dist", "harness.js"),
  bundle: true,
  format: "iife",
  target: "chrome100",
  platform: "browser",
  minify: false,
  logLevel: "warning",
});
fs.copyFileSync(path.join(here, "index.html"), path.join(here, "dist", "index.html"));
console.log("harness built -> harness/dist/");
