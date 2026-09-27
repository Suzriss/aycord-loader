// Persistent storage backed by Discord's own MMKV (survives restarts).
// Plugins get a synchronous get/set; writes are debounced to a single MMKV key.
import { findByProps } from "./metro";

const NS = "aycord_store_v1";
let mem: Record<string, any> = {};
let loaded = false;
let saveTimer: any = null;

function backend(): any {
  // MMKVManager (Discord) or AsyncStorage — both expose getItem/setItem.
  return (
    findByProps("MMKVManager")?.MMKVManager ||
    findByProps("getItem", "setItem", "removeItem") ||
    null
  );
}

export async function initStorage(): Promise<void> {
  if (loaded) return;
  try {
    const b = backend();
    if (b?.getItem) {
      const raw = await b.getItem(NS);
      if (raw) mem = JSON.parse(raw);
    }
  } catch (e) {
    console.log("[ayCORD] storage load failed: " + e);
  }
  loaded = true;
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { backend()?.setItem?.(NS, JSON.stringify(mem)); }
    catch (e) { console.log("[ayCORD] storage save failed: " + e); }
  }, 250);
}

export const storage = {
  get: <T>(key: string, def: T): T => (key in mem ? mem[key] : def),
  set: (key: string, val: any) => { mem[key] = val; persist(); },
  remove: (key: string) => { delete mem[key]; persist(); },
};
