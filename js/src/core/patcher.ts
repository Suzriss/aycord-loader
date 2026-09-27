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
  obj[key] = replacement;
  map[key] = rec;
  return rec;
}

function add(kind: "before" | "instead" | "after", obj: any, key: string, hook: Hook): Unpatch {
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
}

export const before  = (obj: any, key: string, hook: Hook) => add("before", obj, key, hook);
export const instead = (obj: any, key: string, hook: Hook) => add("instead", obj, key, hook);
export const after   = (obj: any, key: string, hook: Hook) => add("after", obj, key, hook);
