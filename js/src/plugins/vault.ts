// Vault — lock chosen DMs / channels behind a passcode.
// When a locked channel is opened, ayCORD asks for the passcode before showing
// it. Wrong/cancelled -> bounced back to the last unlocked channel. The passcode
// is stored only as a salted SHA-256 hash in MMKV; the plaintext never persists.
// (FaceID unlock is the next phase — native LocalAuthentication bridge.)
import { before, after } from "../core/patcher";
import { FluxDispatcher, SelectedChannelStore, ChannelStore } from "../core/api";
import { storage } from "../core/storage";
import { sha256 } from "../core/sha256";
import { findByProps } from "../core/metro";
import type { Plugin } from "../index";

const K_HASH = "vault.hash";
const K_SALT = "vault.salt";
const K_LOCKED = "vault.locked";

const unlocked = new Set<string>();   // session-only
let lastSafe = "";

function salt(): string {
  let s = storage.get<string>(K_SALT, "");
  if (!s) { s = Math.random().toString(36).slice(2) + Date.now().toString(36); storage.set(K_SALT, s); }
  return s;
}
function hash(pw: string) { return sha256(salt() + ":" + pw); }
function hasPasscode() { return !!storage.get<string>(K_HASH, ""); }
function verify(pw: string) { return hasPasscode() && hash(pw) === storage.get<string>(K_HASH, ""); }

function lockedList(): string[] { return storage.get<string[]>(K_LOCKED, []); }
function isLocked(cid: string) { return lockedList().includes(cid); }

function navigate(cid: string) {
  try {
    const nav = findByProps("selectChannel") || findByProps("transitionToChannel");
    const ch = ChannelStore()?.getChannel?.(cid);
    nav?.selectChannel?.({ guildId: ch?.guild_id ?? null, channelId: cid });
  } catch (e) { console.log("[ayCORD] vault nav failed: " + e); }
}

function promptUnlock(cid: string, bounceTo: string) {
  const Alert: any = findByProps("prompt", "alert") || findByProps("prompt");
  if (!Alert?.prompt) { console.log("[ayCORD] vault: no Alert.prompt"); return; }
  Alert.prompt(
    "🔒 ayCORD Vault",
    "اكتب الرمز لفتح هذه المحادثة",
    [
      { text: "إلغاء", style: "cancel", onPress: () => { if (bounceTo) navigate(bounceTo); } },
      {
        text: "فتح",
        onPress: (pw: string) => {
          if (verify(pw)) { unlocked.add(cid); lastSafe = cid; }
          else { if (bounceTo) navigate(bounceTo); setTimeout(() => promptUnlock(cid, bounceTo), 400); }
        },
      },
    ],
    "secure-text"
  );
}

const plugin: Plugin = {
  id: "vault",
  name: "الفولت — قفل المحادثات",
  unpatches: [],

  start() {
    const Dispatcher: any = FluxDispatcher();
    if (!Dispatcher) return console.log("[ayCORD] vault: no dispatcher");

    this.unpatches.push(
      before(Dispatcher, "dispatch", (args: any[]) => {
        const a = args[0];
        if (a?.type !== "CHANNEL_SELECT") return;
        const cid = a.channelId;
        if (!cid) return;
        if (isLocked(cid) && !unlocked.has(cid)) {
          const from = lastSafe || SelectedChannelStore()?.getChannelId?.() || "";
          setTimeout(() => promptUnlock(cid, from), 60);
        } else {
          lastSafe = cid;
        }
      })
    );

    // Public API — settings UI will drive these; usable from console meanwhile.
    (globalThis as any).ayCORDVault = {
      setPasscode: (pw: string) => { storage.set(K_HASH, hash(pw)); return "passcode set"; },
      lock: (cid?: string) => {
        cid = cid || SelectedChannelStore()?.getChannelId?.();
        if (!cid) return "no channel";
        const l = lockedList(); if (!l.includes(cid)) l.push(cid); storage.set(K_LOCKED, l);
        unlocked.delete(cid); return "locked " + cid;
      },
      unlock: (cid?: string) => {
        cid = cid || SelectedChannelStore()?.getChannelId?.();
        const l = lockedList().filter((x) => x !== cid); storage.set(K_LOCKED, l);
        if (cid) unlocked.delete(cid); return "unlocked " + cid;
      },
      list: () => lockedList(),
      hasPasscode,
    };

    console.log("[ayCORD] vault active");
  },

  stop() {
    this.unpatches.forEach((u) => u());
    this.unpatches = [];
    unlocked.clear();
    delete (globalThis as any).ayCORDVault;
  },
};

export default plugin;
