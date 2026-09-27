// ayCORD JS entrypoint — evaluated on Discord's RN bridge after its own bundle.
import antiDelete from "./plugins/anti-delete";
import vault from "./plugins/vault";
import menu, { menuStatus, note } from "./plugins/menu";
import { initStorage } from "./core/storage";
import { metroDiag } from "./core/metro";

// Metro-independent native alert: reach RN's AlertManager straight through the
// TurboModule / native-module proxy globals, without going through the module
// registry. This is our proof the payload evaluated even when metro finds
// nothing — the one signal that separates "payload didn't run" from
// "metro is broken".
function rnNativeAlert(title: string, msg: string): boolean {
  const g: any = globalThis as any;
  let AM: any;
  try { AM = g.__turboModuleProxy && g.__turboModuleProxy("AlertManager"); } catch {}
  if (!AM) { try { AM = g.RN$Bridgeless && g.__turboModuleProxy && g.__turboModuleProxy("RCTAlertManager"); } catch {} }
  if (!AM && g.nativeModuleProxy) AM = g.nativeModuleProxy.AlertManager || g.nativeModuleProxy.RCTAlertManager;
  try {
    if (AM?.alertWithArgs) {
      AM.alertWithArgs({ title, message: msg, buttons: [{ "0": "OK" }], cancelButtonKey: "0" }, () => {});
      return true;
    }
  } catch {}
  // Last resort: at least prove eval reached here, in the device console.
  try { g.nativeLoggingHook?.("[ayCORD] " + title + ": " + msg, 3); } catch {}
  return false;
}

export interface Plugin {
  id: string;
  name: string;
  unpatches: Array<() => void>;
  start(): void;
  stop(): void;
}

const plugins: Plugin[] = [
  menu,
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

  // Visible confirmation via Discord's own toast (needs metro).
  const where = menuStatus.settings === "none" ? "اكتب .ayc بأي محادثة" : "الإعدادات ← ayCORD";
  setTimeout(() => note("ayCORD اشتغل ✅ — " + where), 1500);

  // One concise confirmation. Settings/‏/ayc may still be "off" here if shown on
  // the login screen — they bind via retry once Discord finishes loading.
  const d = metroDiag();
  setTimeout(() => rnNativeAlert(
    "ayCORD ✓",
    "اشتغل — modules: " + d.count +
    "\nصف الإعدادات: " + (menuStatus.settings !== "none" ? "جاهز" : "ينتظر") +
    " | /ayc: " + (menuStatus.command ? "on" : "ينتظر الدخول") +
    "\n(سجّل دخول، بعدين افتح الإعدادات أو اكتب ‎.ayc)"
  ), 1200);
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
