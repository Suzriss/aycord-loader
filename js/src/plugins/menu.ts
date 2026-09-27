// ayCORD menu — a row at the TOP of Discord settings that opens the ayCORD
// controls, plus a guaranteed "/ayc" chat-command fallback that opens the same
// menu (in case the settings injection doesn't bind on a given Discord build).
import { after, instead } from "../core/patcher";
import { findByProps } from "../core/metro";
import { React, actionSheet, prompt, SettingsOverview } from "../core/ui";
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

function note(msg: string) {
  try {
    const T: any = findByProps("showToast");
    const mk: any = findByProps("createToast");
    if (T?.showToast && mk?.createToast) return T.showToast(mk.createToast(String(msg), 1));
  } catch {}
  console.log("[ayCORD] " + msg);
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

const plugin: Plugin = {
  id: "menu",
  name: "منيو الإعدادات",
  unpatches: [],

  start() {
    // 1) Settings row at the very top.
    const ov: any = SettingsOverview();
    const holder = ov && ("default" in ov ? ov : { default: ov });
    if (holder?.default) {
      this.unpatches.push(
        after(holder, "default", (_args: any[], ret: any) => {
          try { const el = buildRow(); if (el) injectTop(ret, el); }
          catch (e) { console.log("[ayCORD] settings inject failed: " + e); }
          return ret;
        })
      );
      console.log("[ayCORD] settings row hooked");
    } else {
      console.log("[ayCORD] SettingsOverviewScreen not found — use /ayc");
    }

    // 2) Guaranteed fallback: "/ayc" chat command opens the menu.
    const MA: any = findByProps("sendMessage", "receiveMessage") || findByProps("sendMessage");
    if (MA?.sendMessage) {
      this.unpatches.push(
        instead(MA, "sendMessage", (args: any[], orig: any) => {
          const content = (args?.[1]?.content ?? "").trim().toLowerCase();
          if (content === "/ayc" || content === ".ayc" || content === "/aycord") {
            setTimeout(openMenu, 50);
            return Promise.resolve(void 0);   // swallow the command message
          }
          return orig.apply(MA, args);
        })
      );
      console.log("[ayCORD] /ayc command ready");
    }
  },

  stop() { this.unpatches.forEach((u) => u()); this.unpatches = []; },
};

export default plugin;
