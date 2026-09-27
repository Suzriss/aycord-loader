// Metro module finder — how we reach Discord's internals.
// Discord bundles with Metro: every module lives in a registry addressable by
// numeric id via the global require (`__r`). We eagerly-ish require modules and
// index their exports so plugins can find a store / component / util by shape.

declare const __r: (id: number) => any;
declare const modules: Record<number, any>;

type Filter = (exp: any, id?: number) => boolean;

const cache: any[] = [];

function allModules(): any[] {
  if (cache.length) return cache;
  // Metro exposes the module table on the global require in dev-ish builds;
  // fall back to brute-forcing ids until requires start throwing "not found".
  const reg: Record<number, any> =
    (typeof modules !== "undefined" && modules) ||
    (globalThis as any).modules ||
    (__r as any)?.getModules?.() || {};

  const ids = Object.keys(reg);
  const scan = ids.length ? ids.map(Number) : range(0, 20000);

  for (const id of scan) {
    let exp: any;
    try { exp = __r(id); } catch { continue; }
    if (exp == null) continue;
    cache.push(exp);
    if (exp.default && exp.__esModule) cache.push(exp.default);
  }
  console.log(`[ayCORD] indexed ${cache.length} modules`);
  return cache;
}

function range(a: number, b: number) {
  const out = []; for (let i = a; i < b; i++) out.push(i); return out;
}

export function find(filter: Filter): any {
  for (const m of allModules()) {
    try { if (filter(m)) return m; } catch {}
  }
  return undefined;
}

export function findAll(filter: Filter): any[] {
  return allModules().filter((m) => { try { return filter(m); } catch { return false; } });
}

// Common convenience finders.
export const findByProps = (...props: string[]) =>
  find((m) => m && props.every((p) => m[p] !== undefined)) ||
  find((m) => m?.default && props.every((p) => m.default[p] !== undefined))?.default;

export const findByStoreName = (name: string) =>
  find((m) => m?.getName?.() === name) ||
  find((m) => m?.default?.getName?.() === name)?.default;

export const findByName = (name: string) =>
  find((m) => m?.name === name && typeof m === "function") ||
  find((m) => m?.default?.name === name)?.default;
