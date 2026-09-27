// Minimal function patcher (before / after / instead), spitroast-style.
// Every patch returns an unpatch() so plugins can clean up on disable.

type Unpatch = () => void;
type Hook = (args: any[], ret?: any) => any;

interface PatchRecord {
  o: any;            // original function
  before: Hook[];
  instead: Hook[];
  after: Hook[];
}

const patched = new WeakMap<object, Record<string, PatchRecord>>();

// Diagnostic: how many property replacements actually took vs. were rejected by
// a frozen/non-configurable target.
export const patchStats = { installed: 0, failed: 0 };

function ensure(obj: any, key: string): PatchRecord {
  let map = patched.get(obj);
  if (!map) { map = {}; patched.set(obj, map); }
  if (map[key]) return map[key];

  const original = obj[key];
  const rec: PatchRecord = { o: original, before: [], instead: [], after: [] };

  const replacement = function (this: any, ...args: any[]) {
    for (const h of rec.before) {
      const r = h.call(this, args);
      if (Array.isArray(r)) args = r;
    }

    let ret: any;
    if (rec.instead.length) {
      for (const h of rec.instead) ret = h.call(this, args, rec.o);
    } else {
      ret = rec.o.apply(this, args);
    }

    for (const h of rec.after) {
      const r = h.call(this, args, ret);
      if (r !== undefined) ret = r;
    }
    return ret;
  };

  try { Object.defineProperties(replacement, Object.getOwnPropertyDescriptors(original)); } catch {}

  // Discord's module exports are often frozen or getter-backed, so a plain
  // `obj[key] = replacement` silently no-ops (hook never fires) or throws in
  // strict mode (killing our caller). Assign, verify it took, and fall back to
  // defineProperty; never throw.
  let installed = false;
  try { obj[key] = replacement; installed = obj[key] === replacement; } catch {}
  if (!installed) {
    try {
      Object.defineProperty(obj, key, { value: replacement, writable: true, configurable: true, enumerable: true });
      installed = obj[key] === replacement;
    } catch {}
  }
  if (installed) patchStats.installed++;
  else { patchStats.failed++; console.log(`[ayCORD] patch of ${key} did not take (frozen/non-configurable)`); }
  map[key] = rec;
  return rec;
}

function add(kind: "before" | "instead" | "after", obj: any, key: string, hook: Hook): Unpatch {
  try {
    if (!obj || typeof obj[key] !== "function") {
      console.log(`[ayCORD] patch target ${key} is not a function`);
      return () => {};
    }
    const rec = ensure(obj, key);
    rec[kind].push(hook);
    return () => {
      const i = rec[kind].indexOf(hook);
      if (i >= 0) rec[kind].splice(i, 1);
    };
  } catch (e) {
    console.log(`[ayCORD] patch ${key} failed: ${e}`);
    return () => {};
  }
}

export const before  = (obj: any, key: string, hook: Hook) => add("before", obj, key, hook);
export const instead = (obj: any, key: string, hook: Hook) => add("instead", obj, key, hook);
export const after   = (obj: any, key: string, hook: Hook) => add("after", obj, key, hook);
