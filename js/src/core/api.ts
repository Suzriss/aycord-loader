// Lazy handles to the Discord internals our plugins reuse.
import { findByProps, findByStoreName } from "./metro";

export const lazy = <T>(get: () => T) => {
  let v: T | undefined;
  return () => (v ??= get());
};

export const FluxDispatcher = lazy(() =>
  findByProps("dispatch", "subscribe", "_actionHandlers") ||
  findByProps("dispatch", "register"));

export const MessageStore   = lazy(() => findByStoreName("MessageStore"));
export const ChannelStore   = lazy(() => findByStoreName("ChannelStore"));
export const UserStore      = lazy(() => findByStoreName("UserStore"));
export const GuildStore     = lazy(() => findByStoreName("GuildStore"));
export const SelectedChannelStore = lazy(() => findByStoreName("SelectedChannelStore"));

export const Toasts = lazy(() => findByProps("open", "close") && findByProps("showToast") || findByProps("open", "close"));

export function toast(text: string) {
  try {
    const T: any = findByProps("showToast");
    const mk: any = findByProps("createToast");
    if (T?.showToast && mk?.createToast) { T.showToast(mk.createToast(text, 1)); return; }
  } catch {}
  console.log("[ayCORD toast] " + text);
}

// Persistent per-device storage bridged from native (see StorageBridge later).
// For now backed by an in-memory map + globalThis fallback.
const mem: Record<string, any> = ((globalThis as any).__aycordStore ??= {});
export const store = {
  get: <T>(k: string, d: T): T => (k in mem ? mem[k] : d),
  set: (k: string, v: any) => { mem[k] = v; },
};
