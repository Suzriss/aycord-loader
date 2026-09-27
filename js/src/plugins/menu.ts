// ayCORD menu — a row at the TOP of Discord settings that opens the ayCORD
// controls, plus a guaranteed "/ayc" chat-command fallback that opens the same
// menu (in case the settings injection doesn't bind on a given Discord build).
import { after, before, instead } from "../core/patcher";
import { findByProps, findByNameHolder } from "../core/metro";
import { React, Alert, actionSheet, prompt } from "../core/ui";
import { SelectedChannelStore } from "../core/api";
import { storage } from "../core/storage";
import type { Plugin } from "../index";

function V(): any { return (globalThis as any).ayCORDVault || {}; }

export function openMenu() {
  const locked = (V().list?.() || []).length;
  const adOn = storage.get<boolean>("antidelete.on", true);
  actionSheet("⚙️ ayCORD", [
    {
      label: V().hasPasscode?.() ? "🔒 تغيير رمز الفولت" : "🔒 تعيين رمز الفولت",
      onPress: () => prompt("رمز الفولت", "اكتب رمزاً جديداً", (v) => v && V().setPasscode?.(v), true),
    },
    {
      label: "🔐 قفل هذه المحادثة",
      onPress: () => { const r = V().lock?.(); note(r || "تم القفل"); },
    },
    {
      label: "🔓 فتح قفل هذه المحادثة",
      onPress: () => { const r = V().unlock?.(); note(r || "تم الفتح"); },
    },
    {
      label: `📋 المقفلة (${locked})`,
      onPress: () => note("محادثات مقفلة: " + locked),
    },
    {
      label: `🗑️ الرسائل المحذوفة: ${adOn ? "تعمل ✅" : "متوقفة ⛔"}`,
      onPress: () => { storage.set("antidelete.on", !adOn); note("تحتاج إعادة فتح ديسكورد للتبديل"); },
    },
  ]);
}

export function note(msg: string) {
  try {
    const T: any = findByProps("showToast");
    if (T?.showToast) return T.showToast(String(msg));
  } catch {}
  console.log("[ayCORD] " + msg);
  try { Alert()?.alert?.("ayCORD", String(msg)); } catch {}
}

// Build the settings row element.
function buildRow(): any {
  const react: any = React();
  const Forms: any = findByProps("FormRow", "FormSection") || findByProps("FormRow");
  const Row = Forms?.FormRow || findByProps("FormRow")?.FormRow;
  if (!react || !Row) return null;
  const row = react.createElement(Row, {
    label: "ayCORD",
    subLabel: "الخصوصية والمميزات",
    onPress: openMenu,
    trailing: Forms?.FormArrow ? react.createElement(Forms.FormArrow, {}) : undefined,
  });
  const Section = Forms?.FormSection;
  return Section ? react.createElement(Section, { title: "ayCORD" }, row) : row;
}

// Insert our element at the top of the first array-children container in the tree.
function injectTop(tree: any, el: any): boolean {
  if (!tree || typeof tree !== "object") return false;
  const ch = tree.props?.children;
  if (Array.isArray(ch)) { ch.unshift(el); return true; }
  if (ch && typeof ch === "object") return injectTop(ch, el);
  return false;
}

// Newer Discord builds render settings from a config table
// (SETTING_RENDERER_CONFIG, keyed rows) laid out by createList({ sections }).
// We register a "pressable" row and put it in a section at the very top.
const ROW_KEY = "AYCORD_MENU";

function hookSettingsConfig(unpatches: Array<() => void>): boolean {
  const consts: any = findByProps("SETTING_RENDERER_CONFIG");
  const listMod: any = findByProps("createList");
  if (!consts || !listMod?.createList) return false;

  // Shape mirrors Discord's own pressable rows in SETTING_RENDERER_CONFIG.
  const row = {
    type: "pressable",
    title: () => "ayCORD",
    description: () => "الخصوصية والمميزات",
    onPress: openMenu,
    usePredicate: () => true,
    useTrailing: undefined as any,
    IconComponent: undefined as any,
    withArrow: true,
    screen: undefined as any,
  };
  // Register our row in the renderer config. Prefer a plain mutation of the
  // table (works on most builds); only if that's rejected fall back to
  // redefining the whole property as a merged getter. Never throw.
  let added = false;
  try {
    const table: any = consts.SETTING_RENDERER_CONFIG;
    if (table && table[ROW_KEY]) added = true;
    else if (table) { table[ROW_KEY] = row; added = table[ROW_KEY] === row; }
  } catch {}
  if (!added) {
    try {
      let cfg = consts.SETTING_RENDERER_CONFIG;
      Object.defineProperty(consts, "SETTING_RENDERER_CONFIG", {
        configurable: true, enumerable: true,
        get: () => ({ ...cfg, [ROW_KEY]: row }),
        set: (v) => { cfg = v; },
      });
      added = !!consts.SETTING_RENDERER_CONFIG?.[ROW_KEY];
    } catch {}
  }
  if (!added) return false;   // couldn't register the row → let overview handle it

  unpatches.push(
    before(listMod, "createList", (args: any[]) => {
      try {
        const sections = args?.[0]?.sections;
        if (!Array.isArray(sections)) return;
        const isMain = sections.some((s: any) =>
          Array.isArray(s?.settings) && (s.settings.includes("ACCOUNT") || s.settings.includes("LOGOUT")));
        if (!isMain || sections.some((s: any) => s?.settings?.includes?.(ROW_KEY))) return;
        sections.unshift({ label: "ayCORD", title: "ayCORD", settings: [ROW_KEY] });
      } catch {}
    })
  );
  return true;
}

export const menuStatus = { settings: "none", command: false, overviewFired: false };

const plugin: Plugin = {
  id: "menu",
  name: "منيو الإعدادات",
  unpatches: [],

  // Idempotent: install the settings row. Prefer the data-driven config path
  // (no render-fn patching); keep the overview render patch only as a last
  // resort, and don't let it block the config path from binding.
  installSettings(): boolean {
    if (menuStatus.settings === "config") return true;
    try {
      if (hookSettingsConfig(this.unpatches)) {
        menuStatus.settings = "config";
        console.log("[ayCORD] settings row hooked (config)");
        return true;
      }
    } catch (e) { console.log("[ayCORD] config hook failed: " + e); }

    // Last-resort render patch — only once, and we still return false so the
    // retry loop keeps trying the (reliable) config path as modules settle.
    if (menuStatus.settings === "none") {
      const h = findByNameHolder("SettingsOverviewScreen");
      if (h?.mod && typeof h.mod[h.key] === "function") {
        this.unpatches.push(
          after(h.mod, h.key, (_args: any[], ret: any) => {
            menuStatus.overviewFired = true;   // proves Discord calls our patched export
            try { const el = buildRow(); if (el) injectTop(ret, el); }
            catch (e) { console.log("[ayCORD] settings inject failed: " + e); }
            return ret;
          })
        );
        menuStatus.settings = "overview";
        console.log("[ayCORD] settings row hooked (overview, real holder)");
      }
    }
    return false;
  },

  // Idempotent: install the "/ayc" chat-command fallback. Returns true once bound.
  installCommand(): boolean {
    if (menuStatus.command) return true;
    try {
      const MA: any = findByProps("sendMessage", "editMessage") || findByProps("sendMessage");
      if (!MA?.sendMessage) return false;
      this.unpatches.push(
        instead(MA, "sendMessage", function (this: any, args: any[], orig: any) {
          const content = (args?.[1]?.content ?? "").trim().toLowerCase();
          if (content === "/ayc" || content === ".ayc" || content === "/aycord") {
            setTimeout(openMenu, 50);
            return Promise.resolve(void 0);   // swallow the command message
          }
          return orig.apply(this, args);
        })
      );
      menuStatus.command = true;
      console.log("[ayCORD] /ayc command ready");
      return true;
    } catch (e) { console.log("[ayCORD] command hook failed: " + e); return false; }
  },

  start() {
    // Some modules (messaging, settings) only become requireable after login,
    // so a one-shot install at boot misses them. Install what's ready now, then
    // retry the rest on a schedule until both bind (or we give up after ~90s).
    // Call BOTH every tick (no && short-circuit) so /ayc keeps retrying even
    // while the settings row is still waiting to bind.
    const tryAll = () => { const a = this.installSettings(); const b = this.installCommand(); return a && b; };
    if (tryAll()) return;

    let tries = 0;
    const tick = () => {
      tries++;
      if (tryAll() || tries >= 45) {
        console.log(`[ayCORD] menu install settled after ${tries} tr(ies): settings=${menuStatus.settings}, /ayc=${menuStatus.command ? "on" : "off"}`);
        return;
      }
      setTimeout(tick, 2000);
    };
    setTimeout(tick, 2000);
  },

  stop() { this.unpatches.forEach((u) => u()); this.unpatches = []; },
};

export default plugin;
