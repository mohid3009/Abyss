// In-memory stand-in for `anna.storage` with the same etag semantics as APS
// (shapes copied from the anna-app harness). Used by tests and the
// standalone preview when no Anna host is present.

export const PRECONDITION_FAILED = -32023;
export const MAX_VALUE_BYTES = 65_536;   // APS default value cap

export function memKv() {
  const rows = new Map();
  let n = 0;

  return {
    async get({ key }) {
      const r = rows.get(key);
      return r ? { key, value: structuredClone(r.value), etag: r.etag, exists: true }
               : { key, value: null, etag: null, exists: false };
    },
    async set({ key, value, if_match }) {
      if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_VALUE_BYTES) {
        throw new Error(`value too large for key ${key} (64 KB cap)`);
      }
      if (if_match !== undefined) {
        const have = rows.get(key)?.etag ?? null;
        if (have !== if_match && !(if_match === "" && !have)) {
          throw Object.assign(new Error(`if_match mismatch (have=${have} want=${if_match})`), { code: PRECONDITION_FAILED });
        }
      }
      const etag = `mem-${(++n).toString(16)}`;
      rows.set(key, { value: structuredClone(value), etag });
      return { ok: true, key, etag };
    },
    async delete({ key }) {
      return { deleted: rows.delete(key) };
    },
    async list({ prefix = "", cursor = null, limit = 100 }) {
      const keys = [...rows.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const page = keys.slice(start, start + limit);
      const next = start + limit < keys.length ? String(start + limit) : null;
      return { entries: page.map((key) => ({ key, etag: rows.get(key).etag })), cursor: next };
    },
  };
}
