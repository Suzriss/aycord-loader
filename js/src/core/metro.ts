// Metro module finder — how we reach Discord's internals.
// Discord bundles with Metro: every module lives in a registry addressable by
// numeric id via the global require (`__r`). We eagerly-ish require modules and
// index their exports so plugins can find a store / component / util by shape.

declare const __r: (id: number) => any;
declare const modules: Record<number, any>;

type Filter = (exp: any, id?: number) => boolean;

const cache: any[] = [];

// The Metro require global isn't always named `__r` — resolve it once, trying
// every name Discord/RN builds have shipped it under. Whatever we find here is
// the single thing every finder depends on, so we log loudly if it's missing.
let reqResolved = false;
let req: ((id: number) => any) | undefined;

function metroRequire(): ((id: number) => any) | undefined {
  if (reqResolved) return req;
  reqResolved = true;
  const g: any = globalThis as any;
  const cands = [
    typeof __r !== "undefined" ? __r : undefined,
    g.__r, g.metroRequire, g.__metroRequire, g.require,
  ];
  for (const c of cands) {
    if (typeof c === "function") { req = c; break; }
  }
  console.log(req
    ? "[ayCORD] metro require resolved (" + ((req as any).name || "anon") + ")"
    : "[ayCORD] metro require NOT FOUND — no globals (__r/metroRequire/require); metro disabled");
  return req;
}

// Try to get the module-id registry without executing anything. Most release
// builds keep `modules` closure-local (not global) and expose no getModules(),
// so we fall back to brute-forcing a wide id range.
function moduleIds(r: (id: number) => any): number[] {
  const g: any = globalThis as any;
  const reg: any =
    (typeof modules !== "undefined" && modules) ||
    g.modules ||
    g.__d?.modules ||
    (r as any)?.getModules?.() ||
    null;
  if (reg) {
    const keys = Object.keys(reg);
    if (keys.length) { console.log("[ayCORD] module registry found (" + keys.length + " ids)"); return keys.map(Number); }
  }
  console.log("[ayCORD] no module registry exposed — brute-forcing ids 0..40000");
  return range(0, 40000);
}

function allModules(): any[] {
  if (cache.length) return cache;
  const r = metroRequire();
  if (!r) return cache;   // nothing we can do without require

  let attempted = 0, threw = 0;
  for (const id of moduleIds(r)) {
    let exp: any;
    attempted++;
    try { exp = r(id); } catch { threw++; continue; }
    if (exp == null) continue;
    cache.push(exp);
    if (exp.default && exp.__esModule) cache.push(exp.default);
  }
  console.log(`[ayCORD] indexed ${cache.length} modules (tried ${attempted}, ${threw} threw)`);
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
