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

// Discord registers every module factory up front, but requiring a module
// before its dependencies are ready (e.g. messaging/settings modules on the
// login screen) throws. We index what we can, remember the ids that threw for
// a *runtime* reason, and retry only those later — so post-login modules get
// picked up without re-scanning the whole 40k id space.
let scanned = false;
let pending: number[] = [];
let lastRescan = 0;

function indexId(r: (id: number) => any, id: number): "ok" | "absent" | "threw" {
  let exp: any;
  try { exp = r(id); }
  catch (e: any) {
    const msg = String((e && e.message) || e);
    // "unknown/undefined module" == this id simply isn't a module → never retry.
    return /unknown module|has not been defined|Requiring unknown/i.test(msg) ? "absent" : "threw";
  }
  if (exp == null) return "absent";
  cache.push(exp);
  if (exp.default && exp.__esModule) cache.push(exp.default);
  return "ok";
}

function fullScan(): void {
  const r = metroRequire();
  if (!r) { scanned = true; return; }
  const ids = moduleIds(r);
  let ok = 0, absent = 0, threw = 0;
  pending = [];
  for (const id of ids) {
    const res = indexId(r, id);
    if (res === "ok") ok++;
    else if (res === "absent") absent++;
    else { threw++; pending.push(id); }
  }
  scanned = true;
  console.log(`[ayCORD] indexed ${cache.length} exports (${ok} ok, ${absent} absent, ${threw} pending) from ${ids.length} ids`);
}

// Retry ids that threw before — cheap, throttled, and shrinks as they succeed.
function rescanPending(): number {
  const r = metroRequire();
  if (!r || !pending.length) return 0;
  const now = Date.now();
  if (now - lastRescan < 800) return 0;
  lastRescan = now;
  const before = cache.length;
  const still: number[] = [];
  for (const id of pending) { if (indexId(r, id) !== "ok") still.push(id); }
  const gained = cache.length - before;
  if (gained) console.log(`[ayCORD] rescan +${gained} exports (${still.length} still pending)`);
  pending = still;
  return gained;
}

function allModules(): any[] {
  if (!scanned) fullScan();
  return cache;
}

function range(a: number, b: number) {
  const out = []; for (let i = a; i < b; i++) out.push(i); return out;
}

// Diagnostic snapshot — which require global bound and how many modules we
// indexed. Forces indexing so callers get a real count. Never throws.
export function metroDiag(): { req: string; count: number } {
  try {
    const r = metroRequire();
    const mods = allModules();
    return { req: r ? ((r as any).name || "anon") : "NONE", count: mods.length };
  } catch (e) {
    return { req: "ERR:" + e, count: 0 };
  }
}

export function find(filter: Filter): any {
  const mods = allModules();
  for (const m of mods) {
    try { if (filter(m)) return m; } catch {}
  }
  // Self-heal: a module we need may only have become requireable after login.
  // Retry the pending ids (throttled) and scan just the newly-added exports.
  if (pending.length) {
    const before = cache.length;
    if (rescanPending() > 0) {
      for (let i = before; i < cache.length; i++) {
        try { if (filter(cache[i])) return cache[i]; } catch {}
      }
    }
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

// Like findByName, but returns the *module holder* + the key that points at the
// named function, so callers can patch it in place (patching a copy is a no-op).
export function findByNameHolder(name: string): { mod: any; key: string } | undefined {
  for (const m of allModules()) {
    try {
      if (m && typeof m.default === "function" && m.default.name === name) return { mod: m, key: "default" };
      if (m && typeof m === "object") {
        for (const k of Object.keys(m)) {
          if (typeof m[k] === "function" && m[k].name === name) return { mod: m, key: k };
        }
      }
    } catch {}
  }
  return undefined;
}
