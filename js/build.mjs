// Bundle the TS runtime into a single Resources/aycord.js the dylib embeds.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../Resources/aycord.js");

await build({
  entryPoints: [resolve(here, "src/index.ts")],
  bundle: true,
  minify: true,
  format: "iife",
  // Hermes: no ESM, target JS Hermes reliably supports.
  target: ["es2020"],
  platform: "neutral",
  legalComments: "none",
  outfile: out,
});

console.log("[ayCORD] wrote " + out);
