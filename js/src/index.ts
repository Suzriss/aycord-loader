// ayCORD JS entrypoint — evaluated on Discord's RN bridge after its own bundle.
import antiDelete from "./plugins/anti-delete";
import vault from "./plugins/vault";
import { initStorage } from "./core/storage";

export interface Plugin {
  id: string;
  name: string;
  unpatches: Array<() => void>;
  start(): void;
  stop(): void;
}

const plugins: Plugin[] = [
  vault,
  antiDelete,
  // media-tools, ghost-mode, emoji-ripper, reminders, notes,
  // multi-account, export, ghost-ping, keyword-tracker — added incrementally.
];

function startPlugins() {
  console.log("[ayCORD] booting " + plugins.length + " plugin(s)");
  for (const p of plugins) {
    try { p.start(); }
    catch (e) { console.log(`[ayCORD] plugin ${p.id} failed: ${e}`); }
  }
  (globalThis as any).ayCORD = {
    plugins,
    version: "0.1.0",
    unload: () => plugins.forEach((p) => { try { p.stop(); } catch {} }),
  };
  console.log("[ayCORD] ready");
}

async function boot() {
  await initStorage();      // load persisted vault/config from MMKV first
  startPlugins();
}

// The bridge may need a tick for the module registry to settle.
boot().catch((e) => {
  console.log("[ayCORD] boot deferred: " + e);
  setTimeout(() => boot().catch((err) => console.log("[ayCORD] boot failed: " + err)), 400);
});
