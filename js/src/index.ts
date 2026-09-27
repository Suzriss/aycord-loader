// ayCORD JS entrypoint — evaluated on Discord's RN bridge after its own bundle.
import antiDelete from "./plugins/anti-delete";
import vault from "./plugins/vault";
import menu, { menuStatus, note } from "./plugins/menu";
import { initStorage } from "./core/storage";
import { metroDiag, findByProps, findByName, findByNameHolder } from "./core/metro";
import { patchStats } from "./core/patcher";

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

  // Report once the menu actually settles (both bound), or after ~95s — so the
  // alert shows the true final state instead of a mid-retry snapshot.
  let watch = 0;
  const check = () => {
    watch++;
    const settled = menuStatus.command && menuStatus.settings !== "none";
    if (settled || watch >= 48) {
      rnNativeAlert(settled ? "ayCORD ✓ جاهز" : "ayCORD probe", probe());
      return;
    }
    setTimeout(check, 2000);
  };
  setTimeout(check, 3000);
}

function yn(x: any): string { return x ? "Y" : "N"; }

function probe(): string {
  const d = metroDiag();
  const sov = findByName("SettingsOverviewScreen");
  const sovH = findByNameHolder("SettingsOverviewScreen");
  return [
    "modules: " + d.count,
    "sendMessage(+edit): " + yn(findByProps("sendMessage", "editMessage")),
    "sendMessage: " + yn(findByProps("sendMessage")),
    "SETTING_RENDERER_CONFIG: " + yn(findByProps("SETTING_RENDERER_CONFIG")),
    "createList: " + yn(findByProps("createList")),
    "SettingsOverview: fn=" + yn(sov) + " holder=" + yn(sovH),
    "showToast: " + yn(findByProps("showToast")),
    "FormRow: " + yn(findByProps("FormRow")),
    "actionSheet: " + yn(findByProps("showSimpleActionSheet")),
    "patches ok/fail: " + patchStats.installed + "/" + patchStats.failed,
    "overviewFired: " + yn(menuStatus.overviewFired),
    "bound → settings:" + menuStatus.settings + " /ayc:" + (menuStatus.command ? "on" : "off"),
  ].join("\n");
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
